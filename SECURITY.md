# 🔒 Güvenlik Rehberi — Middleware Selection

> **Bu belge:** Projenin güvenlik mimarisini, tehditleri ve azaltma stratejilerini açıklar.

---

## 🛡️ Tehdit Modeli (Threat Model)

### 1. Brute Force Attack (Şifre Kırma)

**Tehdit:** Saldırgan login endpoint'e saniyede binlerce istek gönderiyor.

**Risk:** Hesap ele geçirilme, veri sızıntısı.

**Azaltma:**
- ✅ Rate Limiter: `/api/auth/login` = 10 istek/dakika per IP
- ✅ bcryptjs Round 10: Şifre hash'lemesi 0.5-1 saniye alır
- ✅ Failed login attempt logging: 3 başarısız deneme = Telegram alert

**Test:**
```bash
npm run simulate:attack
```

**Threshold Ayarla** (`.env`):
```ini
RATE_LIMIT_LOGIN_ATTEMPTS=10
RATE_LIMIT_LOGIN_WINDOW=60000  # 1 dakika
```

---

### 2. DDoS (Distributed Denial of Service)

**Tehdit:** 100+ IP'den eşzamanlı istek bombardımanı.

**Risk:** Sunucu crashing, hizmet kesintisi.

**Azaltma:**
- ✅ Rate Limiter (Redis): Global + per-IP limit
- ✅ Helmet: Slowdown attack'lara karşı
- ✅ Docker resource limits (`.env`):
  ```bash
  MEMORY_LIMIT=512M
  CPU_LIMIT=1.0
  ```

**Monitoring:**
```bash
# Redis memory kullanımı
redis-cli INFO memory

# Node.js process memory
ps aux | grep npm
```

---

### 3. Session Hijacking (Oturum Hırsızlığı)

**Tehdit:** Saldırgan JWT token'ı ele geçiriyor.

**Risk:** Başka kullanıcı'nın hesabında işlem yapma.

**Azaltma:**
- ✅ Fingerprinting: IP + User-Agent + Ekran Çözünürlüğü
- ✅ Telegram Alert: Parmak izi uyumsuzunca uyarı gönderilir
- ✅ Token TTL: 1 saat (uzun oturum = yüksek risk)
- ✅ HTTPS Only: `.env` → `NODE_ENV=production` (enforceHTTPS)

**Test:**
```bash
npm run simulate:session
```

**Düzeltme:** Şifreli HTTP-Only cookies ile JWT transfer et:
```javascript
// httpOnly + secure flags
res.cookie('jwt', token, {
  httpOnly: true,    // JavaScript'ten erişilemez
  secure: true,      // HTTPS-only
  sameSite: 'strict' // CSRF koruması
});
```

---

### 4. CSRF (Cross-Site Request Forgery)

**Tehdit:** Başka site'den sizin hesabınız kullanılıyor.

**Risk:** Para transferi, şifre değişimi, veri silme.

**Azaltma:**
- ✅ CORS: Sadece güvenilir origins'den istek kabul
- ✅ SameSite Cookie: `sameSite=strict`
- ✅ CSRF Token: POST/PUT/DELETE operasyonlarında

**Eksik:** CSRF token validation ekle:
```bash
npm install csurf
```

---

### 5. SQL Injection

**Tehdit:** Veritabanı sorgusuna malicious SQL kodu enjekte edilmiş.

**Risk:** Veri sızıntısı, veritabanı silinmesi.

**Azaltma:**
- ✅ Parameterized Queries: `?` placeholders
- ✅ sql.js: In-memory SQLite (SQL enjeksiyona karşı güvenli)

**Kontrol:**
```javascript
// ✅ GÜVENLI (parameterized)
queryOne('SELECT * FROM users WHERE email = ?', [email])

// ❌ KULLANMA (vulnerable)
queryOne(`SELECT * FROM users WHERE email = '${email}'`)
```

---

### 6. XSS (Cross-Site Scripting)

**Tehdit:** Saldırgan web sayfasına JavaScript kodu enjekte ediyor.

**Risk:** Oturum cookie'si çalınması, keylogger, malware.

**Azaltma:**
- ✅ Helmet Content-Security-Policy: Inline script'ler engellendi
- ✅ Input Sanitization: HTML özel karakterleri escape edilir
- ✅ HTTP-only Cookies: JavaScript erişiminden korunur

**Uygulanması:**
```javascript
// Frontend'de input validation
const sanitize = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};
```

---

### 7. Sensitive Data Exposure

**Tehdit:** Şifreler, token'lar, API key'ler açıkta bırakılmış.

**Risk:** Accounts hijacking, sistem penetrasyonu.

**Azaltma:**
- ✅ .env dosyası: Secrets burada tutulur
- ✅ .gitignore: `.env` commit edilmez
- ✅ Environment Variables: Üretimde Vault/Secrets Manager kullan
- ✅ HTTPS: Tüm trafiğin şifreli

**Kontrol Listesi:**
```bash
# ✅ Şifreler veritabanında hash'li mi?
SELECT password_hash FROM users LIMIT 1;

# ✅ Token'lar Redis'te TTL ile mi?
PTTL user_tokens:1

# ✅ .env dosyası .gitignore'de mi?
grep ".env" .gitignore
```

---

## 🔑 Secret Management (Gizli Bilgi Yönetimi)

### Development (Geliştirme)

```bash
# .env dosyasını oluştur
cp .env.example .env

# Kendi JWT_SECRET oluştur (256-bit random)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Production (Üretim)

**ASLA .env dosyasını push etme!**

**Alternatif Yollar:**

#### Option 1: Docker secrets
```yaml
services:
  app:
    environment:
      - JWT_SECRET=/run/secrets/jwt_secret
    secrets:
      - jwt_secret

secrets:
  jwt_secret:
    file: /etc/secrets/jwt_secret
```

#### Option 2: HashiCorp Vault
```bash
# Vault'tan secret oku
vault kv get secret/middleware-selection/jwt-secret
```

#### Option 3: AWS Secrets Manager
```javascript
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
  return secretsManager.getSecretValue({ SecretId: secretName }).promise();
}
```

---

## 📋 Security Checklist (Güvenlik Kontrol Listesi)

### Pre-Deployment

- [ ] JWT_SECRET en az 32 karakter, random oluşturulmuş mı?
- [ ] Login rate limit 10/dakika/IP ayarlanmış mı?
- [ ] Telegram bot token `.env`'de, `.gitignore`'de `.env` mı?
- [ ] HTTPS sertifikası valid ve güvenli mi?
- [ ] Redis password set edilmiş mi?
- [ ] Database backups otomatikte alınıyor mu?
- [ ] Audit logs en az 30 gün saklanıyor mu?
- [ ] Error messages sensitif veri expose etmiyor mu?

### Runtime

- [ ] HTTPS enforced mi? (Redirect HTTP → HTTPS)
- [ ] CORS sadece trusted origins'den mi?
- [ ] Rate limits Redis'ten okuyor mu? (memory'de değil)
- [ ] Tokenlar süresi dolduktan sonra revoked mi?
- [ ] Failed login attempts logged mi?
- [ ] CPU/Memory alerts configured mi?
- [ ] Log rotation ayarlanmış mı?

### Code Review

- [ ] `.env.example` sensitive values içermiyor mu?
- [ ] `console.log()` passwords/tokens içermiyor mu?
- [ ] SQL sorguları parameterized mi?
- [ ] Input validation her endpoint'te mi?
- [ ] Error handler sensitive details expose etmiyor mu?

---

## 🔑 Key Rotation (Anahtar Döndürme)

### JWT_SECRET Değişimi

```bash
# 1. Yeni secret oluştur
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Tüm active token'ları iptal et
# Redis'te: FLUSHDB (tüm users için)

# 3. .env güncelle
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" .env

# 4. Sunucu restart et
docker-compose restart app
```

---

## 🚨 Incident Response (İçişleri Müdahale)

### Account Breach Detected

```text
1️⃣ Kullanıcıya bildir (email + in-app notification)
2️⃣ Şifresi reset'le (verify email ile)
3️⃣ Tüm aktif token'ları revoke et
4️⃣ IP'si başka loginlerde block et
5️⃣ Audit log'ları analiz et
6️⃣ Telegram alert'leri kontrol et
```

### Suspicious Activity

```bash
# Audit log'dan şüpheli activites filtrele
SELECT * FROM audit_logs 
WHERE action = 'LOGIN_FAILED' AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## 📚 Referanslar

- **OWASP Top 10 2021:** https://owasp.org/Top10/
- **OWASP Authentication Cheat Sheet:** https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- **JWT Best Practices:** https://tools.ietf.org/html/rfc8725
- **NIST Password Guidelines:** https://pages.nist.gov/800-63-3/sp800-63b.html
- **bcryptjs Docs:** https://github.com/dcodeIO/bcrypt.js

---

## ✅ Regular Security Updates

Tüm bağımlılıkları güncel tutun:

```bash
# Güvenlik açıklarını kontrol et
npm audit

# Vulnerable packages yükselt
npm audit fix

# Monthly update schedule
0 0 1 * * npm update && npm audit fix
```

---

**Son güncellenme:** {{ date }}  
**Durum:** ✅ Production-Ready
