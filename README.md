# 🎓 Middleware Selection — Güvenli Web Geliştirme Vize Projesi

<!-- PROFESYONEL REPO ROZETLERİ (BADGES) -->
![NodeJS](https://img.shields.io/badge/Node.js-v20-green?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express.js-v4.21-lightgrey?style=for-the-badge&logo=express)
![Security](https://img.shields.io/badge/Security-High-success?style=for-the-badge&logo=springsecurity)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

> **Üniversite:** *İstinye Üniversitesi* 🏛️  
> **Bölüm/Ders:** *Bilişim Güvenliği Teknolojisi* 📚  
> **Danışman / Eğitmen:** *Keyvan Arasteh* 🧑‍🏫  
> **Geliştirici:** *Can Ekizoğlu* 💻  

---

## ⚡ TL;DR — 3 Komutla Başlangıç (Docker'sız)

```bash
git clone https://github.com/hizir777/Middleware_selection.git
cd Middleware_selection && npm install
npm start
```

→ `http://localhost:3000` açın ✅

**Not:** Redis yok? Sorun değil, **In-Memory fallback** otomatik aktif. Rate limiting ve token revocation bellekte tutuluyor (dev için yeterli).

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

### ⚡ En Basit Yol (3 komut)

```bash
git clone https://github.com/hizir777/Middleware_selection.git
cd Middleware_selection
npm install && npm start
```

Hepsi bu. Uygulama `http://localhost:3000`'de çalışıyor. 

**Redis olmadan çalışıyor?** Evet! In-Memory fallback mode aktif. Veriler bellekte tutuluyor (restart'ta kaybolur ama dev için sorun değil).

---

### Docker ile (Opsiyonel — Produksiyona daha uygun)

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

### Manuel Kurulum (Node.js + Express)

#### Adım 1: Node.js Kur
**Node.js v20 LTS [nodejs.org](https://nodejs.org) adresinden indirin ve kurun.**

Doğrulama:
```bash
node --version    # v20.x+
npm --version     # 10.x+
```

#### Adım 2: Projeyi Klonla
```bash
git clone https://github.com/hizir777/Middleware_selection.git
cd Middleware_selection
```

#### Adım 3: Bağımlılıkları Yükle
```bash
npm install
# Yüklenir: express, ioredis, sql.js, bcryptjs, jsonwebtoken, vb.
```

#### Adım 4: Ortam Değişkenlerini Yapılandır (OPSIYONEL)

Varsayılan ayarlar zaten çalışıyor. Değiştirmek istersen:

```bash
cp .env.example .env    # macOS/Linux
copy .env.example .env  # Windows
```

Sonra `.env` dosyasını editör ile aç:
```env
PORT=3000
JWT_SECRET=your_secret_key_min_32_chars  # Değiştir
REDIS_URL=redis://localhost:6379         # Redis çalışıyorsa
```

#### Adım 5: Redis'i Başlatma (OPSIYONEL)

**Redis istiyorsanız başlayın, istemezseniz Adım 6'ya geçin.**

**Seçenek A: Docker ile başlat (Önerilen)**
```bash
# Ayrı terminal açıp çalıştırın
docker run -d -p 6379:6379 --name redis-app redis:7-alpine

# Test et
redis-cli ping    # "PONG" dönmeli
```

**Seçenek B: Windows'ta kurulu Redis varsa**
```bash
redis-server
# "ready to accept connections on port 6379" mesajı
```

**Seçenek C: Redis'i yüklü değilse?**
✅ Sorun değil! Uygulama otomatik **İn-Memory Fallback** modunda çalışır:
- Rate limiting bellekte tutulur
- Token revocation (logout) bellekte tutulur
- Hızı yine ⚡ (~0.1ms)
- **Sunucu restart'ta veriler kaybedilir** (dev için yeterli)

#### Adım 6: Uygulamayı Başlat
```bash
npm start

# veya geliştirme modu (dosya değişikliğinde otomatik reload):
npm run dev
```

**Başarı göstergesi:**
```
✅ Server listening on port 3000
✅ Database initialized
✅ Redis connected (veya İn-Memory fallback aktif)
```

#### Adım 7: Tarayıcıdan Erişim
```
Adres: http://localhost:3000
Dashboard'ı göreceksiniz
```

---

### Redis Olmadan Çalışabilir mi?

**EVET.** Uygulama Redis'e bağlanamazsa otomatik **İn-Memory Storage** devreye girer.

| Özellik | Redis Modu | İn-Memory Modu (Fallback) |
|---------|-----------|---------------------------|
| **Rate Limiting** | ✅ Gerçek (Redis) | ✅ Çalışır (Bellekte) |
| **Token Revocation** | ✅ Gerçek (Redis SET) | ✅ Çalışır (Array) |
| **Performans** | ⚡ ~0.1ms | ⚡ ~0.01ms (daha hızlı!) |
| **Data Persistence** | ✅ Disk + RAM | ❌ Sadece RAM |
| **Sunucu Restart'ta** | Veriler kalır | Veriler kaybolur |
| **Production** | ✅ Hazır | ⚠️ Dev/Test için |
| **Kurulması gerekli** | ✅ Docker/Windows | ❌ YOK |

**Özetle:** Şu anda **Redis kurulu değil mi?** Sorun değil, uygulama zaten fallback modunda çalışıyor.

---

### Kurulum Doğrulama

```bash
# 1. API health check (dashboard açmak yerine)
curl http://localhost:3000/api/health

# Yanıt (Redis varsa):
# {"success":true,"data":{"app":"✅","redis":"✅ Connected"}}

# Yanıt (Redis yoksa — In-Memory fallback):
# {"success":true,"data":{"app":"✅","redis":"⚠️ Using fallback"}}
```

Her iki durumda da ✅ **başarılı.**

```bash
# 2. Test Suite'i çalıştır
npm test                # Unit tests
npm run test:e2e       # End-to-End tests
npm run test:all       # Tümü

# Tüm testler geçiyse kurulum başarılı.
```

---

### Sık Karşılaşılan Sorunlar

| Sorun | Çözüm |
|-------|------|
| `Error: EADDRINUSE: address already in use :::3000` | `PORT=3001 npm start` ile başka port kullan |
| `npm ERR! missing script: "dev"` | `npm install` yeniden çalıştır |
| `rate limiting çalışmıyor` | Redis yoksa → In-Memory fallback aktif (sorun değil) |
| `npm install çok uzun sürüyor` | İnternet hızı yavaş ise `npm install --no-optional` dene |

Daha fazla sorun için: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

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

---
