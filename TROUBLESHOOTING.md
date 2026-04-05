# 🔧 Sorun Giderme Rehberi — Middleware Selection

> **Sık karşılaşılan sorunlar ve çözümleri**

---

## 🚫 Kurulum & Başlatma Sorunları

### ❌ "Error: connect ECONNREFUSED 127.0.0.1:6379"

**Sorun:** Redis bağlantı başarısız.

**Çözümü:**

```bash
# 1. Redis çalışıyor mu kontrol et
redis-cli ping
# Beklenen: PONG

# 2. Eğer Redis yoksa başla
# Windows
redis-server

# Linux/Mac
redis-server --daemonize yes

# 3. Docker ile
docker run -d -p 6379:6379 redis:7-alpine
```

---

### ❌ "Error: EADDRINUSE :::3000"

**Sorun:** Port 3000 zaten kullanımda.

**Çözümü:**

```bash
# 1. Port kullanan process'i bul
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 2. Process'i öldür
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows

# 3. Farklı port kullan
PORT=3001 npm run dev
```

---

### ❌ "npm: command not found"

**Sorun:** Node.js/npm kurulu değil.

**Çözümü:**

```bash
# Node.js indir ve kur
# https://nodejs.org/

# Kontrol et
node --version  # v18+
npm --version   # 8+
```

---

### ❌ "docker: permission denied"

**Sorun:** Docker daemon'a erişim yok.

**Çözümü (Linux):**

```bash
# Kullanıcıyı docker grubuna ekle
sudo usermod -aG docker $USER

# Değişiklikleri uygula
newgrp docker

# Kontrol et
docker ps
```

---

## 🔐 Kimlik Doğrulama (Auth) Sorunları

### ❌ "401 Unauthorized - TOKEN_REQUIRED"

**Sorun:** JWT token header'ında yok.

**Çözümü:**

```bash
# Login yapıp token al
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Response'tan token kopyala
# Token ile request gönder
curl -H "Authorization: Bearer eyJ..." http://localhost:3000/api/dashboard
```

---

### ❌ "401 Unauthorized - TOKEN_INVALID"

**Sorun:** Token imzası hatalı veya süresi bitmiş.

**Çözümü:**

```bash
# 1. Token süresi mi bitmiş kontrol et
jwt_decode_online()  # jwt.io'da test et

# 2. JWT_SECRET değişti mi?
# .env dosyasındaki JWT_SECRET'ı kontrol et
echo $JWT_SECRET

# 3. Yeni token al
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

---

### ❌ "401 Unauthorized - TOKEN_REVOKED"

**Sorun:** Token iptal edilmiş (logout/password change).

**Çözümü:**

```bash
# 1. Tekrar login yap
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Yeni token kullan
```

---

### ❌ "403 Forbidden - INSUFFICIENT_ROLE"

**Sorun:** Kullanıcı rolü yetki gerektirmiyor.

**Çözümü:**

```bash
# 1. Aşağıdaki rota yanlış rol için
# GET /api/admin/panel → admin role gerekli

# 2. Admin rolü olan kullanıcı ile login yap
# Veya

# 3. Admin panelinde kullanıcının rolünü değiştir
```

---

## ⏱️ Rate Limiting Sorunları

### ❌ "429 Too Many Requests"

**Sorun:** Çok hızlı istek gönderiyorsun.

**Çözümü:**

```bash
# 1. Rate limit kontrol et
curl -i http://localhost:3000/api/health
# Headers'da gör:
# x-ratelimit-limit: 2000
# x-ratelimit-remaining: 1999

# 2. Bekle (1 dakika)
sleep 60

# 3. Istekler arası bekle
sleep 0.1  # Her istek arasında 100ms
```

---

### ⚠️ Rate Limit'i geliştirmede devre dışı bırakmak

```bash
# .env
RATE_LIMIT_DISABLED=true  # Development only!
```

---

## 📊 Database Sorunları

### ❌ "Error: database disk image is malformed"

**Sorun:** SQLite dosyası corrupted.

**Çözümü:**

```bash
# 1. Old backuptan restore et
cp /backups/middleware.db.backup ./middleware.db

# 2. Veya yenisini oluştur (veri kaybı)
rm ./middleware.db
npm run dev  # Auto-create
```

---

### ❌ "User table does not exist"

**Sorun:** Database initialize olmamış.

**Çözümü:**

```bash
# 1. Dosya sil
rm ./middleware.db

# 2. App restart et (auto-init)
npm run dev

# 3. Kontrol et
curl http://localhost:3000/api/health
# Beklenen: "database":"ok"
```

---

## 🔴 Redis Sorunları

### ❌ "Error: WRONGPASS invalid username-password pair"

**Sorun:** Redis password yanlış.

**Çözümü:**

```bash
# 1. .env'deki REDIS_PASSWORD kontrol et
grep REDIS_PASSWORD .env

# 2. Redis'te password ayarla
redis-cli CONFIG SET requirepass "yourpassword"

# 3. Bağlanırken password kullan
redis-cli -a "yourpassword" ping
```

---

### ❌ "Error: READONLY You can't write against a read only replica"

**Sorun:** Redis replica'ya yazılamıyor.

**Çözümü:**

```bash
# 1. Master Redis'e bağlandığından emin ol
redis-cli INFO replication

# 2. Env değişkeninde;
# REDIS_URL=redis://<master-ip>:6379
```

---

## 🐳 Docker Sorunları

### ❌ "docker-compose: command not found"

**Sorun:** Docker Compose kurulu değil.

**Çözümü:**

```bash
# Docker Desktop'ı indir
# https://www.docker.com/products/docker-desktop/

# Kontrol et
docker-compose --version  # v2.0+
```

---

### ❌ "Cannot connect to Docker daemon"

**Sorun:** Docker daemon çalışmıyor.

**Çözümü (Windows):**

```bash
# Docker Desktop uygulamasını aç
# Sistem trayında Docker ikonu sağ tıkla → Aç
```

**Çözümü (Linux):**

```bash
sudo systemctl start docker
sudo systemctl enable docker  # Auto-start
```

---

### ❌ "build failed: ..." hatasında

**Sorun:** Docker image build başarısız.

**Çözümü:**

```bash
# 1. Cache sil
docker-compose down -v
docker system prune -a

# 2. Tekrar build et
docker-compose up --build

# 3. Logs'ları detaylı gör
docker-compose up --build 2>&1 | tail -50
```

---

## 🌐 Network & CORS Sorunları

### ❌ "CORS error: Access-Control-Allow-Origin missing"

**Sorun:** Farklı domain'den istek yapılıyor.

**Çözümü:**

```bash
# .env'de CORS origins ekle
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# Code'da
const corsOptions = {
  origin: process.env.CORS_ORIGINS.split(','),
  credentials: true,
};
app.use(cors(corsOptions));
```

---

## 🧪 Test Hatası

### ❌ "Jest timeout exceeded 5000ms"

**Sorun:** Test çok yavaş veya hanging.

**Çözümü:**

```bash
# 1. Timeout artır
npm test -- --testTimeout=10000

# 2. Veya .jestrc.json'da
{
  "testTimeout": 10000
}

# 3. Debugging için
NODE_DEBUG=* npm test
```

---

## 📝 Logging & Debugging

### App'dan logları görmek

```bash
# Docker container logs
docker-compose logs -f app

# Spesifik saatler arası
docker logs --since "2 hours ago" -f mw_app

# File'dan (production)
tail -f /app/logs/app.log

# Winston log dosyasından
tail -f logs/combined.log | grep ERROR
```

### Debug mode

```bash
# Tüm Node.js events'leri gör
NODE_DEBUG=* npm run dev

# Sadece HTTP requests
NODE_DEBUG=http, npm run dev

# Profiling
node --prof src/app.js
node --prof-process isolate-*.log > profile.txt
```

---

## 🆘 Eğer Sorun Çözülmezse

### Debugging Adımları

1. **Error message'i tam oku** — "line X in file Y"
2. **Logs'ları kontrol et** — `docker-compose logs app`
3. **Health check çalışıyor mu?** — `curl http://localhost:3000/api/health`
4. **Database dosyası var mı?** — `ls -la middleware.db`
5. **Redis connect oluyor mu?** — `redis-cli ping`

### Issue Report Formatı

```markdown
## Başlık
[Sorunun kısa açıklaması]

## Adımlar
1. npm run dev
2. curl http://localhost:3000/api/health
3. Hata

## Geçerli Davranış
[Ne oluyor]

## Beklenen Davranış
[Ne olması gerekiyordu]

## Çevre
- OS: Windows / Mac / Linux
- Node: v18.0.0
- Docker: 20.10.0
- Docker Compose: 2.0.0

## Error Message
[Tam error log]
```

---

**Sorularınız varsa:** GitHub Issues → New Issue

**Yardım almak için:** https://github.com/hizir777/Middleware_selection/discussions
