# Middleware Selection — Güvenli Request Processing Pipeline

> **"Cheap Check First"** prensibi ile tasarlanmış, yüksek performanslı ve güvenli ara katman hiyerarşisi.

---

## 🎯 Mimari Felsefe

Bu proje, bir web sunucusuna gelen her isteği **en verimli, güvenli ve performanslı** şekilde işlemek üzere tasarlanmıştır. Temel prensip:

> ⚡ **En ucuz kontrol en önde olmalıdır.**

Sahte veya kötü niyetli istekler, ağır kimlik doğrulama (JWT) veya veritabanı sorguları yapılmadan **0.1ms'de** elenir.

### Pipeline Sıralama Gerekçesi

```
İstek → [Yunus Polisi] → [CORS] → [Helmet] → [Logger] → [Polis] → [Zabıta] → Controller
          ~0.1ms          ~0.01ms   ~0.01ms    ~1ms      ~5-10ms    ~2ms
          Redis            Bellek    Bellek     I/O       CPU+Redis   DB
```

| Sıra | Katman | Kod Adı | Maliyet | Neden Bu Sırada? |
|------|--------|---------|---------|-------------------|
| 1 | Rate Limiter | Yunus Polisi | ~0.1ms | Botları en başta ele, Auth'a yüklenme |
| 2 | CORS | - | ~0.01ms | Origin kontrolü |
| 3 | Helmet | - | ~0.01ms | Güvenlik header'ları |
| 4 | Request Logger | Kamera | ~1ms | Request ID + timing |
| 5 | Auth Guard | Polis | ~5-10ms | JWT verify + fingerprint |
| 6 | RBAC Guard | Zabıta | ~2ms | Rol tabanlı yetki |

### ❌ Yanlış Sıralama Sorunu

Eğer Auth (JWT doğrulama) Rate Limiter'dan **önce** gelirse:
- Her sahte istekte `crypto.verify()` çağrılır
- Sunucu CPU'su DDoS altında tavan yapar
- Sunucu kullanılamaz hale gelir

---

## 🚫 Bu Kurulum Sadece Bir "Simülasyon" mu?

**HAYIR.** "Saldırı Simülasyonu" adı sadece test senaryosudur. **Arka plan (Backend) tamamen GERÇEKTİR.** 

1. **Gerçek Veritabanı:** Kullanıcılar sadece tarayıcı belleğine değil, doğrudan sunucudaki SQLite (`middleware.db`) dosyasına kalıcı olarak yazılır. Sunucuyu kapatsanız da veriler kaybolmaz. (Native sorunları aşmak için WebAssembly destekli `sql.js` taşıyıcı motoru ile çalışır).
2. **Gerçek Kriptografi:** Şifreler `bcryptjs` kütüphanesi ile Endüstri Standartlarında (Salt Round 10) hashlenir. Düz metin olarak saklanmaz.
3. **Gerçek JWT Oturumları:** Giriş yaptığınızda `jsonwebtoken` size imzalı gerçek bir JWT verir. Şifrenizi değiştirdiğinizde token "Blacklist'e (Kara Liste)" alınır (Revocation). 
4. **Rate Limit Bir Yalan Değildir:** Saldırı butonuna bastığınızda tarayıcınız arkadan sunucu portuna (3000) saniyeler içinde 50 tane donanımsal HTTP POST isteği fırlatır. Express.js bu bağlantıların ilk 10'unu içeri alır, sonrasını donanımı yormadan IP üzerinden 429 yanıtı ile doğrudan keser.

---

## 🛠️ Teknoloji Yığını

| Teknoloji | Neden? |
|-----------|--------|
| **Express.js** | En yaygın Node.js framework — zengin middleware ekosistemi |
| **Redis** | Rate limit sayaçları ve token blacklist için ~0.1ms erişim |
| **SQLite** | Lab ortamı için dosya tabanlı kalıcı depolama |
| **JWT** | Stateless kimlik doğrulama — sunucuda oturum tutmaya gerek yok |
| **bcryptjs** | Kasıtlı yavaş parola hash — brute-force koruması |
| **Winston** | Yapılandırılmış log sistemi (console + dosya) |
| **Docker** | Tek komutla çalışan konteyner orkestrasyonu |

---

## 🚀 Kurulum

### Docker ile (Önerilen)

```bash
# 1. Repoyu klonla
git clone <repo-url>
cd Middleware_selection

# 2. Ortam değişkenlerini yapılandır
cp .env.example .env
# .env dosyasını düzenleyin (JWT_SECRET'ı değiştirin)

# 3. Tek komutla ayağa kaldır
docker-compose up --build
```

### Manuel Kurulum

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Ortam değişkenlerini yapılandır
cp .env.example .env

# 3. Redis'i başlat (ayrı terminal)
# Windows: Redis kurulu olmalı veya Docker kullanın
docker run -d -p 6379:6379 redis:7-alpine

# 4. Uygulamayı başlat
npm run dev
```

Uygulama: `http://localhost:3000`

---

## 📡 API Endpoint'leri

### Public (Token gerektirmez)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/health` | Sistem durumu (app + Redis) |
| POST | `/api/auth/register` | Yeni kullanıcı kaydı |
| POST | `/api/auth/login` | Giriş + JWT token |

### Protected (Token gerektirir)

| Method | Endpoint | Min. Rol | Açıklama |
|--------|----------|----------|----------|
| POST | `/api/auth/logout` | * | Oturum kapatma (token iptal) |
| POST | `/api/auth/change-password` | * | Şifre değiştirme + tüm token'lar iptal |
| GET | `/api/dashboard` | student | Kullanıcı dashboard |
| GET | `/api/editor/content` | editor | İçerik yönetimi |
| GET | `/api/admin/panel` | admin | Admin paneli |
| GET | `/api/audit-logs` | admin | Güvenlik olay kayıtları |
| PUT | `/api/admin/users/:id/role` | admin | Kullanıcı rolü güncelleme |

---

## 📊 Rate Limit Konfigürasyonu

| Rota Tipi | Limit | Aşıldığında | Auth'a Ulaşır? |
|-----------|-------|-------------|----------------|
| Kritik (`/login`, `/register`) | 10/dakika | `429 Too Many Requests` | ❌ Hayır |
| Genel (diğer rotalar) | 2000/dakika | `429 Too Many Requests` | ❌ Hayır |

---

## 🧪 Test ve Simülasyon

### Unit Testler
```bash
npm test
```

### Saldırı Simülasyonu
```bash
# Rate Limiter testi — 30 istek gönderir
npm run simulate:attack
```

### Oturum İptali Testi
```bash
# Login → Şifre değiştir → Eski token ile dene → 401
npm run simulate:session
```

### Hiyerarşi Testi
```bash
# Rate limit'e takılan isteklerin Auth'a ulaşmadığını kanıtlar
npm run simulate:hierarchy
```

---

## 📋 Dashboard

`http://localhost:3000` adresinde interaktif bir dashboard bulunur:

- 🔐 **Kimlik Doğrulama** — Kayıt, giriş, şifre değiştirme
- ⚡ **Pipeline Görsel** — Middleware sıralama şeması
- 🧪 **API Test** — Endpoint'leri test etme
- 📋 **Audit Logları** — Güvenlik olay geçmişi
- 💥 **Saldırı Simülasyonu** — Tarayıcıdan Rate Limiter testi
- 💚 **Sistem Durumu** — App + Redis health check

---

## 🔐 Güvenlik Özellikleri

- **Cihaz Parmak İzi**: IP + User-Agent + Ekran Çözünürlüğü ile oturum hırsızlığı tespiti
- **Token Revocation**: Şifre değişikliğinde tüm eski token'lar Redis üzerinden anında iptal
- **Audit Logging**: Kritik olaylar veritabanına kaydedilir
- **Telegram Bildirimi**: Güvenlik olaylarında yöneticiye anlık mesaj
- **Helmet**: XSS, Content-Sniffing güvenlik header'ları
- **bcryptjs**: Salt round 10 ile kasıtlı yavaş parola hash

---

## 📁 Proje Yapısı

```text
├── .github/workflows/ci.yml     # GitHub Actions CI/CD
├── docs/                         # Mimari diyagramlar
├── public/                       # Frontend Dashboard
│   ├── css/style.css
│   ├── js/app.js
│   └── index.html
├── scripts/                      # Simülasyon betikleri
│   ├── attack_simulation.js      # Rate Limiter testi
│   ├── session_test.js           # Token revocation testi
│   └── hierarchy_test.js         # Pipeline izolasyon testi
├── src/
│   ├── config/                   # Merkezi konfigürasyon
│   ├── constants/                # Sabitler (HTTP kodları, roller)
│   ├── controllers/              # İstek işleme mantığı
│   ├── middlewares/              # ★ PROJENİN KALBİ ★
│   │   ├── rateLimiter.js        # "Yunus Polisi" (Redis)
│   │   ├── corsHandler.js        # CORS kontrolü
│   │   ├── logger.js             # Request ID + Timing
│   │   ├── authGuard.js          # JWT + Fingerprint
│   │   ├── rbacGuard.js          # "Zabıta" (Rol kontrolü)
│   │   └── errorHandler.js       # Global hata yakalama
│   ├── routes/                   # API rota tanımları
│   ├── services/                 # İş mantığı
│   ├── utils/                    # Yardımcı araçlar
│   └── app.js                    # Giriş noktası
├── tests/                        # Jest testleri
├── docker-compose.yml            # Redis + App orkestrasyonu
├── Dockerfile                    # Multi-stage build
└── package.json
```

---

## 📝 Lisans

MIT License
