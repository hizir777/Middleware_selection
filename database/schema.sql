-- ================================================================
-- Middleware Selection — Veritabanı Şema Tanımları
-- ================================================================
--
-- Bu dosya, Middleware Selection uygulamasının kalıcı veri
-- depolama katmanı için tam SQL şemasını içermektedir.
--
-- Uygulama mimarisi:
--   - Birincil depolama : SQLite (sql.js / WASM runtime)
--   - Oturum önbelleği  : Redis (token revocation & rate limiting)
--   - Kimlik doğrulama  : JWT (HS256, 1h TTL)
--
-- Tablolar:
--   1. users           — Kayıtlı kullanıcılar ve kimlik bilgileri
--   2. sessions        — Aktif oturum izleme kaydı
--   3. audit_logs      — Güvenlik ve erişim olay günlüğü
--   4. rate_limit_log  — Rate limiter aşım kayıtları (analiz)
--   5. middleware_config— Middleware parametrelerinin yapılandırması
--
-- Tasarım Prensipleri:
--   - Her tablo kendi UUID birincil anahtarına sahiptir.
--   - Kritik alanlar NOT NULL kısıtıyla korunmaktadır.
--   - Sık sorgulanan kolonlar indekslenmiştir.
--   - Denetim izi (audit trail) için created_at/updated_at
--     otomatik olarak güncellenmektedir.
--   - Şifreler hiçbir zaman düz metin olarak saklanmaz;
--     bcrypt (cost factor 12) ile hashlenir.
--
-- Versiyon Geçmişi:
--   v1.0  — Temel users, sessions, audit_logs tabloları
--   v1.1  — rate_limit_log ve middleware_config eklendi
--   v1.2  — Compound index optimizasyonları
--
-- Kullanım:
--   sqlite3 middleware_selection.db < schema.sql
--
-- ================================================================


-- ----------------------------------------------------------------
-- PRAGMA Ayarları
-- ----------------------------------------------------------------
-- WAL (Write-Ahead Logging) modu, eş zamanlı okuma/yazma için
-- performansı önemli ölçüde artırır. Disk I/O azalır.
PRAGMA journal_mode = WAL;

-- Foreign key desteği SQLite'de varsayılan olarak kapalıdır.
-- Referans bütünlüğünü sağlamak için açıkça etkinleştiriyoruz.
PRAGMA foreign_keys = ON;

-- Senkron yazma modu: NORMAL, performans ve güvenlik dengesi sağlar.
-- FULL = her işlemde disk senkronizasyonu (yavaş ama güvenli).
-- NORMAL = crash-safe ama fsync çağrısı azaltılmış (daha hızlı).
PRAGMA synchronous = NORMAL;

-- Önbellek boyutu: negatif değer KB cinsinden belirtilir.
-- -64000 = 64 MB önbellek; sık erişilen sayfalar RAM'de tutulur.
PRAGMA cache_size = -64000;


-- ================================================================
-- TABLO 1: users
-- ================================================================
-- Uygulamaya kayıtlı tüm kullanıcıların temel kimlik bilgilerini
-- ve RBAC (Role-Based Access Control) rol atamasını depolar.
--
-- Güvenlik Notları:
--   - password_hash: bcrypt ile hashlenir, düz metin saklanmaz.
--   - email: büyük/küçük harf duyarsız karşılaştırma için
--     COLLATE NOCASE ile saklanır.
--   - is_active: pasif kullanıcılar giriş yapamaz; hesap silme
--     yerine soft-delete kullanılır (veri bütünlüğü için).
--   - failed_login_count: brute-force tespiti için kullanılır.
--     5 başarısız girişte hesap geçici olarak kilitlenir.
--
-- RBAC Rolleri:
--   admin  — Tüm kaynaklara tam erişim, kullanıcı yönetimi
--   user   — Standart API erişimi, kendi profiline erişim
--   viewer — Salt okunur erişim, audit log görüntüleme
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    -- Benzersiz kullanıcı tanımlayıcı (UUID v4 formatında)
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-'
        || lower(hex(randomblob(2))) || '-4'
        || substr(lower(hex(randomblob(2))), 2) || '-'
        || substr('89ab', abs(random()) % 4 + 1, 1)
        || substr(lower(hex(randomblob(2))), 2) || '-'
        || lower(hex(randomblob(6)))),

    -- Kullanıcı adı: 3–50 karakter, harf/rakam/tire/alt çizgi
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,

    -- E-posta adresi: giriş kimliği olarak kullanılır
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,

    -- bcrypt hash (cost 12): orijinal şifre saklanmaz
    password_hash TEXT NOT NULL,

    -- RBAC rolü: 'admin' | 'user' | 'viewer'
    role TEXT NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user', 'viewer')),

    -- Hesap aktiflik durumu (soft-delete pattern)
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),

    -- Ardışık başarısız giriş sayısı (brute-force koruması)
    failed_login_count INTEGER NOT NULL DEFAULT 0,

    -- Son başarısız giriş zamanı (lockout süresi hesaplama)
    last_failed_login TEXT,

    -- Hesap oluşturulma zamanı (ISO 8601 UTC)
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    -- Son güncelleme zamanı (şifre değişikliği, rol güncellemesi vb.)
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Username ve email için arama hızlandırma indeksleri
-- Giriş sorguları her ikisini de yoğun kullanır
CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_username
    ON users (username);

-- Aktif kullanıcı filtreleme için kısmi indeks
-- Pasif kullanıcılar sorgu dışında tutulur
CREATE INDEX IF NOT EXISTS idx_users_active_role
    ON users (is_active, role)
    WHERE is_active = 1;


-- ================================================================
-- TABLO 2: sessions
-- ================================================================
-- Aktif JWT oturumlarının izleme kaydı. Redis'teki token revocation
-- listesine ek olarak, uzun vadeli analiz ve audit için kalıcı
-- oturum geçmişi burada tutulur.
--
-- Redis vs SQLite Senkronizasyonu:
--   Bir token iptal edildiğinde:
--   1. Redis'e token jti'si kara listeye eklenir (hızlı kontrol).
--   2. Bu tabloda ilgili session kaydı revoked=1 yapılır (analiz).
--
-- Oturum Yaşam Döngüsü:
--   AKTIF   → Kullanıcı giriş yaptı, token geçerli
--   İPTAL   → Kullanıcı logout yaptı veya şifre değiştirdi
--   SÜRESI  → JWT TTL doldu (1 saat)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    -- Oturum benzersiz kimliği (JWT jti claim ile eşleşir)
    id TEXT PRIMARY KEY,

    -- Oturumun sahibi kullanıcı
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- JWT token'ının tam değeri (isteğe bağlı saklama)
    -- Üretim ortamında güvenlik açısından NULL bırakılabilir
    token_hash TEXT,

    -- İstemci IP adresi (IPv4 veya IPv6)
    ip_address TEXT,

    -- User-Agent başlığı (tarayıcı/istemci tespiti)
    user_agent TEXT,

    -- Parmak izi hash'i (ekran çözünürlüğü, dil vb.)
    fingerprint TEXT,

    -- Oturum iptal edildi mi? (1=iptal, 0=aktif)
    revoked INTEGER NOT NULL DEFAULT 0
        CHECK (revoked IN (0, 1)),

    -- İptal sebebi (logout, password_change, admin_revoke vb.)
    revoke_reason TEXT,

    -- JWT'nin son geçerlilik zamanı
    expires_at TEXT NOT NULL,

    -- Oturum açılma zamanı
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    -- Son aktivite zamanı (heartbeat veya istek üzerine güncellenir)
    last_activity TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Kullanıcıya ait tüm oturumları hızlı getirmek için
CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions (user_id);

-- Aktif oturum kontrolü için bileşik indeks
-- WHERE revoked=0 AND expires_at > now() sorgusu optimize edilir
CREATE INDEX IF NOT EXISTS idx_sessions_active
    ON sessions (user_id, revoked, expires_at)
    WHERE revoked = 0;


-- ================================================================
-- TABLO 3: audit_logs
-- ================================================================
-- Uygulamadaki tüm güvenlik olaylarının değiştirilemez kayıt
-- defteri. Bu tablo; compliance gereksinimleri, güvenlik analizi
-- ve adli inceleme (forensic) için kritik önem taşır.
--
-- Olay Tipleri (action sütunu):
--   REGISTER              — Yeni kullanıcı kaydı
--   LOGIN                 — Başarılı giriş
--   LOGOUT                — Oturum kapatma
--   LOGIN_FAILED          — Yanlış şifre ile giriş denemesi
--   PASSWORD_CHANGE       — Şifre değiştirme
--   PERMISSION_DENIED     — Yetkisiz kaynak erişim girişimi
--   SESSION_HIJACK_ATTEMPT— IP/parmak izi uyuşmazlığı
--   RATE_LIMIT_EXCEEDED   — Rate limit ihlali
--   TOKEN_REVOKED_ACCESS  — İptal edilmiş token kullanım denemesi
--   ROLE_CHANGE           — Kullanıcı rol değişikliği (admin)
--
-- Bütünlük Kısıtı:
--   Bu tabloya UPDATE veya DELETE izni verilmemelidir.
--   Kayıtlar yalnızca eklenebilir (append-only).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Otomatik artan birincil anahtar (kronolojik sıra garantisi)
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- İşlemi gerçekleştiren kullanıcının ID'si (NULL=anonim)
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

    -- Kullanıcı adı (snapshot: kullanıcı silinse bile korunur)
    username TEXT,

    -- Olay tipi (yukarıdaki sabit listeden)
    action TEXT NOT NULL,

    -- İsteğin geldiği IP adresi
    ip_address TEXT,

    -- User-Agent string'i
    user_agent TEXT,

    -- Ek bağlam bilgisi (JSON veya serbest metin)
    details TEXT,

    -- Olayın gerçekleştiği zaman damgası (UTC)
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Kullanıcı bazlı olay sorgulama (audit panel)
CREATE INDEX IF NOT EXISTS idx_audit_user_id
    ON audit_logs (user_id);

-- Zaman bazlı sorgulama (son N saat, tarih aralığı)
CREATE INDEX IF NOT EXISTS idx_audit_timestamp
    ON audit_logs (timestamp DESC);

-- Olay tipine göre filtreleme (güvenlik ihlali taraması)
CREATE INDEX IF NOT EXISTS idx_audit_action
    ON audit_logs (action, timestamp DESC);

-- IP adresine göre sorgulama (kötü niyetli kaynak tespiti)
CREATE INDEX IF NOT EXISTS idx_audit_ip
    ON audit_logs (ip_address, timestamp DESC);


-- ================================================================
-- TABLO 4: rate_limit_log
-- ================================================================
-- Rate limiter ihlallerinin ayrıntılı kaydı. Redis'teki sayaçlar
-- geçici olduğundan (TTL tabanlı), bu tablo kalıcı ihlal geçmişi
-- ve patern analizi için kullanılır.
--
-- Kullanım Senaryoları:
--   - Hangi IP'ler en çok engelleniyor? (DDoS kaynağı analizi)
--   - Hangi endpoint'ler hedef alınıyor?
--   - Saldırı paterni var mı? (zamanlama analizi)
--   - Firewall kural önerisi üretme
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_log (
    -- Otomatik artan kimlik
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- İsteğin geldiği IP adresi
    ip_address TEXT NOT NULL,

    -- Engellenen endpoint (örn: /api/auth/login)
    endpoint TEXT NOT NULL,

    -- HTTP metodu (GET, POST, vb.)
    method TEXT NOT NULL DEFAULT 'GET',

    -- O an uygulanan limit (istek/pencere)
    limit_value INTEGER NOT NULL,

    -- Zaman penceresi (saniye cinsinden)
    window_seconds INTEGER NOT NULL,

    -- Olay zamanı
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- IP bazlı ihlal sayısı ve patern analizi
CREATE INDEX IF NOT EXISTS idx_rate_ip_time
    ON rate_limit_log (ip_address, timestamp DESC);

-- Endpoint bazlı hedefleme analizi
CREATE INDEX IF NOT EXISTS idx_rate_endpoint
    ON rate_limit_log (endpoint, timestamp DESC);


-- ================================================================
-- TABLO 5: middleware_config
-- ================================================================
-- Uygulama middleware parametrelerinin çalışma zamanında
-- güncellenebilir yapılandırma deposu. Sunucuyu yeniden
-- başlatmadan dinamik tuning yapılmasını sağlar.
--
-- Yapılandırılabilir Parametreler:
--   rate_limit_window    — Zaman penceresi (saniye)
--   rate_limit_max       — Pencerede izin verilen max istek
--   jwt_ttl              — Token geçerlilik süresi (saniye)
--   bcrypt_rounds        — bcrypt maliyet faktörü
--   cors_origins         — İzin verilen origin listesi (JSON)
--   session_timeout      — Oturum zaman aşımı (saniye)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS middleware_config (
    -- Yapılandırma anahtarı (benzersiz)
    key TEXT PRIMARY KEY,

    -- Yapılandırma değeri (metin olarak; gerekirse JSON)
    value TEXT NOT NULL,

    -- Değer tipi rehberliği (string, integer, boolean, json)
    value_type TEXT NOT NULL DEFAULT 'string'
        CHECK (value_type IN ('string', 'integer', 'boolean', 'json')),

    -- İnsan okunur açıklama
    description TEXT,

    -- Son güncelleyen kullanıcının ID'si
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,

    -- Güncelleme zamanı
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- ----------------------------------------------------------------
-- Varsayılan Yapılandırma Değerleri
-- ----------------------------------------------------------------
-- Bu değerler uygulama ilk çalıştığında kullanılır.
-- Çalışma zamanında /api/admin/config endpoint'i üzerinden
-- güncellenerek kalıcı olarak değiştirilebilir.
INSERT OR IGNORE INTO middleware_config (key, value, value_type, description)
VALUES
    -- Rate limiter: 15 dakikalık pencerede maksimum 100 istek
    ('rate_limit_window',  '900',   'integer', 'Rate limit zaman penceresi (saniye)'),
    ('rate_limit_max',     '100',   'integer', 'Pencerede izin verilen maksimum istek sayısı'),

    -- Auth endpoint daha kısıtlı: 15 dk'da 10 giriş denemesi
    ('auth_rate_limit_max','10',    'integer', 'Auth endpoint rate limiti (giriş kaba kuvvet koruması)'),

    -- JWT token geçerlilik süresi: 1 saat (3600 saniye)
    ('jwt_ttl',            '3600',  'integer', 'JWT token TTL (saniye)'),

    -- bcrypt cost factor: 12 (yaklaşık 250ms hash süresi)
    -- Değer artırılırsa hash daha güçlü ama daha yavaş olur
    ('bcrypt_rounds',      '12',    'integer', 'bcrypt maliyet faktörü (güvenlik/hız dengesi)'),

    -- İzin verilen CORS originleri (JSON dizisi)
    ('cors_origins',       '["http://localhost:3000"]', 'json',
        'İzin verilen Cross-Origin kaynakları'),

    -- Pasif oturum zaman aşımı: 30 dakika
    ('session_timeout',    '1800',  'integer', 'Pasif oturum zaman aşımı (saniye)');


-- ================================================================
-- VIEW: active_sessions_summary
-- ================================================================
-- Kullanıcı başına aktif oturum özetini döndürür.
-- Dashboard'daki "Aktif Kullanıcılar" metriği için kullanılır.
-- ----------------------------------------------------------------
CREATE VIEW IF NOT EXISTS active_sessions_summary AS
SELECT
    u.id          AS user_id,
    u.username,
    u.role,
    -- Kullanıcının aktif (iptal edilmemiş ve süresi dolmamış) oturum sayısı
    COUNT(s.id)   AS active_session_count,
    -- En son aktivite zamanı
    MAX(s.last_activity) AS last_seen
FROM users u
-- LEFT JOIN: oturumu olmayan kullanıcılar da dahil edilir (count=0)
LEFT JOIN sessions s
    ON s.user_id = u.id
    AND s.revoked = 0
    AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE u.is_active = 1
GROUP BY u.id, u.username, u.role;


-- ================================================================
-- VIEW: security_events_recent
-- ================================================================
-- Son 24 saatteki kritik güvenlik olaylarının özeti.
-- Güvenlik dashboard'u ve uyarı sistemi için kullanılır.
-- ----------------------------------------------------------------
CREATE VIEW IF NOT EXISTS security_events_recent AS
SELECT
    action,
    -- Her olay tipinden kaç tane gerçekleştiği
    COUNT(*)                                      AS event_count,
    -- İlk oluşum zamanı
    MIN(timestamp)                                AS first_occurrence,
    -- Son oluşum zamanı
    MAX(timestamp)                                AS last_occurrence,
    -- Kaç farklı IP'den geldiği
    COUNT(DISTINCT ip_address)                    AS unique_ips
FROM audit_logs
-- Son 24 saat filtresi
WHERE timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')
-- Kritik güvenlik olayları
AND action IN (
    'LOGIN_FAILED',
    'PERMISSION_DENIED',
    'SESSION_HIJACK_ATTEMPT',
    'RATE_LIMIT_EXCEEDED',
    'TOKEN_REVOKED_ACCESS'
)
GROUP BY action
ORDER BY event_count DESC;


-- ================================================================
-- TRIGGER: users_updated_at
-- ================================================================
-- users tablosunda herhangi bir güncelleme yapıldığında
-- updated_at alanını otomatik olarak güncel zamana ayarlar.
-- Uygulama katmanında manuel güncelleme yapmaya gerek kalmaz.
-- ----------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = NEW.id;
END;

-- ================================================================
-- TRIGGER: middleware_config_updated_at
-- ================================================================
-- middleware_config tablosunda güncelleme yapıldığında
-- updated_at alanını otomatik günceller.
-- ----------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS middleware_config_updated_at
AFTER UPDATE ON middleware_config
FOR EACH ROW
BEGIN
    UPDATE middleware_config
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE key = NEW.key;
END;

-- ================================================================
-- Şema kurulumu tamamlandı.
-- ================================================================
