# Changelog

Projedeki tüm önemli değişiklikler burada belgelenir.

## [1.0.0] — 2026-04-05

### ✨ Eklenen
- **Middleware Pipeline**: "Cheap Check First" prensibi ile sıralı middleware hiyerarşisi
  - Rate Limiter (Redis tabanlı sliding window)
  - CORS Handler
  - Helmet güvenlik header'ları
  - Request Logger (UUID Request ID + timing)
  - Auth Guard (JWT + Token Revocation + Fingerprint)
  - RBAC Guard (Rol tabanlı yetki kontrolü)
  - Global Error Handler

- **Kimlik Doğrulama**
  - Kayıt (bcryptjs ile güvenli parola hash)
  - Giriş (JWT token oluşturma)
  - Çıkış (Redis üzerinden token iptal)
  - Şifre değiştirme (tüm eski token'lar iptal edilir)

- **Cihaz Parmak İzi (Fingerprinting)**
  - IP + User-Agent + Ekran Çözünürlüğü ile oturum hırsızlığı tespiti
  - Uyumsuzlukta Telegram bildirimi

- **Audit Logging**
  - Kritik olaylar SQLite'a kaydedilir
  - Telegram Bot API ile anlık bildirimler

- **Frontend Dashboard**
  - Glassmorphism tasarımlı premium dark theme
  - Kimlik doğrulama arayüzü
  - Pipeline görselleştirmesi
  - API test aracı
  - Saldırı simülasyonu (tarayıcıdan)
  - Audit log görüntüleyici
  - Sistem sağlık monitörü

- **Docker**
  - Multi-stage Dockerfile (non-root user)
  - Docker Compose (Redis + App)

- **Simülasyon Betikleri**
  - `attack_simulation.js` — Rate Limiter testi
  - `session_test.js` — Token revocation testi
  - `hierarchy_test.js` — Pipeline izolasyon testi

- **CI/CD**
  - GitHub Actions (test + security audit)

- **Testler**
  - Jest + Supertest ile unit ve entegrasyon testleri
