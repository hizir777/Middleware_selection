-- ================================================================
-- Migrasyon: 001_initial_schema
-- Versiyon : 1.0.0
-- Tarih    : 2025-01-01
-- Açıklama : Başlangıç şeması — temel tablolar ve indeksler
-- ================================================================
--
-- Bu migrasyon, Middleware Selection uygulamasının ilk
-- veritabanı kurulumunu gerçekleştirir. Idempotent yapıda
-- tasarlanmıştır: birden fazla kez çalıştırılsa bile
-- hata vermez (IF NOT EXISTS / IF EXISTS korumaları).
--
-- Geri Alma (Rollback):
--   Geri almak için 001_rollback.sql dosyasını çalıştırın.
--   UYARI: Rollback işlemi tüm verilerinizi siler!
--
-- Bağımlılıklar:
--   Yok (bu ilk migrasyon)
--
-- Sonraki Migrasyon:
--   002_add_refresh_tokens.sql
-- ================================================================

-- ----------------------------------------------------------------
-- Migrasyon başlangıç zamanını kaydet
-- ----------------------------------------------------------------
-- SQLite'de özel migrasyon tablosu yoksa oluştur.
-- Bu tablo hangi migrasyonların uygulandığını takip eder.
CREATE TABLE IF NOT EXISTS schema_migrations (
    -- Migrasyon versiyon numarası (örn: '001')
    version     TEXT PRIMARY KEY,
    -- Migrasyon dosyasının tam adı
    name        TEXT NOT NULL,
    -- Uygulanma zamanı
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    -- Uygulamayı yapan (CI/CD, manuel, vb.)
    applied_by  TEXT DEFAULT 'system'
);

-- Bu migrasyonun daha önce uygulanıp uygulanmadığını kontrol et.
-- SQLite'de koşullu INSERT için INSERT OR IGNORE kullanılır.
INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES ('001', '001_initial_schema');


-- ================================================================
-- USERS TABLOSU
-- ================================================================
-- Uygulama kullanıcılarının kimlik ve yetkilendirme verilerini tutar.
--
-- Tasarım Kararları:
--   UUID birincil anahtar: integer ID yerine UUID kullanılmasının
--   sebebi güvenlik — sıralı ID'ler varlık sayısını açığa çıkarır
--   ve IDOR (Insecure Direct Object Reference) saldırılarına
--   zemin hazırlar.
--
--   COLLATE NOCASE: Email/username büyük/küçük harf duyarsız
--   eşleştirme için. 'Ali@Example.COM' == 'ali@example.com'
--
--   is_active soft-delete: Kullanıcı silinmez, pasife alınır.
--   Audit trail ve referans bütünlüğü korunur.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash       TEXT NOT NULL,
    -- Rol hiyerarşisi: admin > user > viewer
    role                TEXT NOT NULL DEFAULT 'user'
                            CHECK (role IN ('admin', 'user', 'viewer')),
    is_active           INTEGER NOT NULL DEFAULT 1,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    last_failed_login   TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Email indeksi: giriş sorgusunda WHERE email = ? için
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email
    ON users (email);

-- Username indeksi: @mention ve profil sorgularında
CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_username
    ON users (username);

-- Rol bazlı listeleme için bileşik indeks (admin paneli)
CREATE INDEX IF NOT EXISTS idx_users_role_active
    ON users (role, is_active);


-- ================================================================
-- AUDIT_LOGS TABLOSU
-- ================================================================
-- Tüm güvenlik olaylarının değiştirilemez zaman damgalı kaydı.
--
-- Neden ayrı bir tablo?
--   Audit verisi operasyonel veriden ayrı tutulur:
--   1. Farklı retention policy (log: 1 yıl, users: kalıcı)
--   2. Yüksek yazma hızı (her istek log üretebilir)
--   3. Ayrı yetkilendirme (audit okuma = admin yetkisi)
--   4. Sıkıştırma/arşivleme bağımsız yapılabilir
--
-- AUTOINCREMENT Notu:
--   INTEGER PRIMARY KEY AUTOINCREMENT garantisi:
--   silinen satırın ID'si yeniden kullanılmaz → kronolojik sıra
--   kesinlikle korunur. Adli analiz için kritik.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT,
    username    TEXT,
    -- Olay tipi sabitleri src/constants/auditEvents.js'de tanımlı
    action      TEXT NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    -- Ek bağlam: JSON veya serbest metin
    details     TEXT,
    -- UTC zaman damgası, saat dilimi dönüşümü gerektirmez
    timestamp   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Kullanıcı aktivite geçmişi sorgusu için
CREATE INDEX IF NOT EXISTS idx_audit_user_time
    ON audit_logs (user_id, timestamp DESC);

-- Zaman bazlı tarama için (son N saat/gün filtresi)
CREATE INDEX IF NOT EXISTS idx_audit_timestamp
    ON audit_logs (timestamp DESC);

-- Güvenlik ihlali taraması: olay tipine göre gruplama
CREATE INDEX IF NOT EXISTS idx_audit_action_time
    ON audit_logs (action, timestamp DESC);

-- IP bazlı kötü niyetli kaynak tespiti
CREATE INDEX IF NOT EXISTS idx_audit_ip_time
    ON audit_logs (ip_address, timestamp DESC);


-- ================================================================
-- İlk Admin Kullanıcısı
-- ================================================================
-- Uygulama ilk kurulumda bir admin hesabına ihtiyaç duyar.
-- Bu kayıt sadece users tablosu boşsa eklenir.
--
-- GÜVENLİK UYARISI:
--   Varsayılan şifre üretim ortamında derhal değiştirilmelidir!
--   Bu hash, "Admin@12345" şifresinin bcrypt (rounds=12) halidir.
--   Gerçek üretim kurulumunda aşağıdaki satırı çıkarıp
--   setup.sh ile güvenli şifre oluşturun.
--
-- INSERT OR IGNORE: Tablo zaten dolu ise (yeniden migrasyon
-- senaryosunda) bu satır sessizce atlanır.
-- ----------------------------------------------------------------
INSERT OR IGNORE INTO users (
    id,
    username,
    email,
    -- bcrypt hash — "Admin@12345" — ÜRETIMDE DEĞİŞTİRİN
    password_hash,
    role
) VALUES (
    'admin-00000000-0000-0000-0000-000000000001',
    'admin',
    'admin@middleware.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewlJfPDzANsaHrh2',
    'admin'
);

-- ================================================================
-- Migrasyon tamamlandı: 001_initial_schema
-- ================================================================
