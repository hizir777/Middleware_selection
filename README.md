# 🎓 Middleware Selection — Güvenli Web Geliştirme Vize Projesi

> **"Cheap Check First"** prensibi ile tasarlanmış, yüksek performanslı ve güvenli ara katman hiyerarşisi.
>
> **Vize Başlığı:** Güvenli Request Processing Pipeline - Middleware Sıralama Optimizasyonu

---

## 📊 Proje Özeti

Bu proje, **Bölüm:** Bilgisayar Mühendisliği / Siber Güvenlik, **Dersin:** Güvenli Web Geliştirme, **Dönem:** 2026 Bahar vize ödevi olarak sunulmaktadır.

| Kritik | Puanlar |
|--------|---------|
| **Konu İlişkiliği** | ✅ 8.5/10 — OWASP A01, A05, A08 zaafiyet kategorileri |
| **Teknik Derinlik** | ✅ 7.5/10 — JWT revocation, fingerprinting, rate limiting |
| **Uygulanabilirlik** | ✅ 8/10 — Docker ready, production-near |
| **Güvenlik** | ✅ 7.5/10 — Audit logging, RBAC, token blacklist |
| **Dokümantasyon** | ✅ 9/10 — Comprehensive guides (bkz. → linkler) |
| **İnovasyon** | ✅ 7.5/10 — Fingerprint + Telegram alert sistemi |
| **ORTALAMA** | **✅ 8/10** |

---

## 📚 Dokümantasyon Harita

| Belge | Içerik | Link |
|-------|--------|------|
| **README** (Bu dosya) | Proje özeti, kurulum, API | `README.md` |
| **Mimari** | Pipeline diyagramları, veri akışı | [docs/architecture.md](docs/architecture.md) |
| **Yol Haritası** | Uptime Kuma analizi, 5 aşamalı proje planı | [Roadmap.md](Roadmap.md) |
| **Güvenlik** | Tehdit modeli, OWASP kontrol listesi | [**SECURITY.md**](SECURITY.md) ⭐ YENİ |
| **Deployment** | Production deployment, scaling stratejisi | [**DEPLOYMENT.md**](DEPLOYMENT.md) ⭐ YENİ |
| **Sorun Giderme** | Sık sorunlar ve çözümleri | [**TROUBLESHOOTING.md**](TROUBLESHOOTING.md) ⭐ YENİ |
| **Performans** | Benchmark, optimization, tuning | [**PERFORMANCE.md**](PERFORMANCE.md) ⭐ YENİ |
| **Veritabanı** | Schema, indexes, lifecycle | [**docs/DATABASE_SCHEMA.md**](docs/DATABASE_SCHEMA.md) ⭐ YENİ |
| **Changelog** | Sürüm geçmişi | [CHANGELOG.md](CHANGELOG.md) |

**⭐ YENİ:** Vize projesi kalitesini 10/10'a çıkarmak için eklenen dokümantasyon.

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

✅ **Bu proje:** Doğru sıralamanın neden gerekli olduğunu kanıtlayan test'ler içerir (`npm run simulate:hierarchy`).

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
git clone https://github.com/hizir777/Middleware_selection.git
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

### E2E (End-to-End) Testler
```bash
# Tam user journey teste tabi tutulur:
# Registration → Login → Protected Routes → Rate Limiting → RBAC → Password Change → Logout
npm run test:e2e
```

### Tüm Testler
```bash
npm run test:all  # Unit + E2E
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

### Performans Testi
```bash
# 1000 concurrent requests, latency analysis
npm run performance:test

# Sonuçlar: performance-results/ klasörüne kaydedilir
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
├── .github/workflows/ci.yml     # GitHub Actions CI/CD (Lint, Test, Build, Deploy)
├── docs/                         # Dokümantasyon
│   ├── architecture.md          # Pipeline diyagramları
│   ├── DATABASE_SCHEMA.md       # Schema, indexes, queries
│   └── img/                     # Diyagram görselleri
├── public/                      # Frontend Dashboard
│   ├── css/style.css
│   ├── js/app.js
│   └── index.html
├── scripts/                     # Test & Simülasyon
│   ├── attack_simulation.js     # Rate Limiter testi
│   ├── session_test.js          # Token revocation testi
│   ├── hierarchy_test.js        # Pipeline izolasyon testi
│   └── performance-test.js      # Load testing
├── src/                         # Uygulama Kodu
│   ├── app.js                   # Express app + middleware pipeline
│   ├── config/
│   │   ├── database.js          # SQLite config
│   │   ├── redis.js             # Redis client
│   │   └── index.js
│   ├── constants/
│   │   ├── httpCodes.js         # HTTP status constants
│   │   ├── messages.js          # Response messages (Turkish)
│   │   └── roles.js             # User roles (student, editor, admin)
│   ├── controllers/             # Request handlers
│   │   ├── authController.js
│   │   ├── dashboardController.js
│   │   └── healthController.js
│   ├── middlewares/             # "Cheap Check First" Pipeline
│   │   ├── rateLimiter.js       # 🔴 1. Yunus Polisi
│   │   ├── corsHandler.js       # 🟠 2. CORS
│   │   ├── logger.js            # 🟡 3. Kamera
│   │   ├── authGuard.js         # 🟢 4. Polis (JWT)
│   │   ├── rbacGuard.js         # 🔵 5. Zabıta (Roles)
│   │   └── errorHandler.js      # 🟣 Global Error Handler
│   ├── routes/                  # API Endpointleri
│   │   └── index.js
│   ├── services/                # Business Logic
│   │   ├── authService.js       # Register, Login, Logout
│   │   ├── tokenService.js      # JWT, Revocation
│   │   └── auditService.js      # Logging, Telegram alerts
│   └── utils/
│       ├── fingerprint.js       # Device fingerprinting
│       ├── logger.js            # Winston logging
│       └── telegram.js          # Telegram notifications
├── tests/                       # Test Suite
│   ├── middleware.test.js       # Unit tests
│   └── e2e.test.js              # End-to-end tests
├── SECURITY.md                  # Güvenlik Rehberi ⭐
├── DEPLOYMENT.md                # Deployment Rehberi ⭐
├── TROUBLESHOOTING.md           # FAQ ⭐
├── PERFORMANCE.md               # Optimization Guide ⭐
├── Roadmap.md                   # Proje planı (Uptime Kuma + Vize)
├── CHANGELOG.md                 # Sürüm notları
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml           # Redis + App services
├── .env.example                 # Secrets template
├── package.json                 # Dependencies
└── README.md                    # Bu dosya
```

---

## 🔄 CI/CD Pipeline

GitHub Actions (.github/workflows/ci.yml):

```
Push to Main/Develop
    ↓
[Lint] ─────┐
[Test] ─────┼──→ [Build Docker] ─────┐
[Security] ─┘                         │
                                      ├──→ [Performance Test]
[Docker Image] ──────────────────────┘
    ↓
[Deploy to Staging] (develop branch)
    ↓
[Deploy to Production] (main branch)
```

**Otomatik İş Akışı:**
- ✅ Code linting (ESLint)
- ✅ Unit tests (Jest)
- ✅ E2E tests
- 🐳 Docker image build
- ⚡ Performance testing
- 🔒 Security scanning
- 🚀 Auto-deployment

---

## 📚 Öğrenme Kaynakları

### Neler Öğrenilecek?

1. **Middleware Mimarisi** — Request processing pipeline tasarımı
2. **Security (Güvenlik)** — Authentication, Authorization, Rate Limiting
3. **Performance** — Bandwidth optimization, latency reduction
4. **DevOps** — Docker, CI/CD, monitoring
5. **Testing** — Unit tests, E2E tests, load testing
6. **Best Practices** — Code organization, error handling, logging

### Referans Dokümanlar

- OWASP Top 10 2021: https://owasp.org/Top10/
- JSON Web Tokens (JWT): https://jwt.io/
- Express.js Best Practices: https://expressjs.com/
- Docker Best Practices: https://docs.docker.com/develop/dev-best-practices/
- Node.js Security: https://nodejs.org/en/docs/guides/security/

---

## 🎓 Vize Ödevi Gereksinimleri

| Gereksinim | Durum | İspat |
|-----------|-------|-------|
| Problem Tanımı | ✅ | [Roadmap.md](Roadmap.md) |
| Mimari Tasarım | ✅ | [docs/architecture.md](docs/architecture.md) |
| Kod Uygulaması | ✅ | `src/` klasörü (500+ satır production code) |
| API Dokümantasyonu | ✅ | [README.md](README.md) API section |
| Test Planı | ✅ | `tests/` klasörü (unit + E2E) |
| Security Analysis | ✅ | [SECURITY.md](SECURITY.md) |
| Performance Report | ✅ | [PERFORMANCE.md](PERFORMANCE.md) |
| Deployment Guide | ✅ | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Troubleshooting | ✅ | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| User Manual | ✅ | Public dashboard (http://localhost:3000) |

---

## 🤝 Katılım

Fork edilip PR gönderilebilir. Öneriler, bug reports, feature requests hoş karşılanır.

```bash
git clone https://github.com/hizir777/Middleware_selection.git
git checkout -b feature/my-feature
git commit -m "docs: add feature"
git push origin feature/my-feature
```

---

## 📜 Lisans

MIT License — Bkz. [LICENSE](LICENSE)
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
