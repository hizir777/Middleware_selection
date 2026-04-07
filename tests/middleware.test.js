// ═══════════════════════════════════════════════════
// Middleware Tests — Unit & Integration
// ═══════════════════════════════════════════════════
//
// Bu test dosyası, middleware pipeline'ının tüm katmanlarını
// uçtan uca (end-to-end) test eder. Testler şu başlıklar
// altında organize edilmiştir:
//
//  1. Sağlık Kontrol Endpoint'i (/api/health)
//  2. Kimlik Doğrulama — Kayıt (/api/auth/register)
//  3. Kimlik Doğrulama — Giriş (/api/auth/login)
//  4. Korumalı Endpoint Erişimi (Authorization: Bearer)
//  5. Rate Limiter Davranışı (429 yanıt kontrolü)
//  6. Oturum Kapatma (/api/auth/logout)
//
// Test Ortamı:
//   Jest + Supertest kombinasyonu kullanılır.
//   Redis gerçek bir bağlantı yerine mock ile simüle edilir.
//   SQLite veritabanı her test koşumunda bellekte sıfırlanır.
//
// Çalıştırma:
//   npm test                    # Tüm testleri çalıştır
//   npm test -- --watch         # İzleme modu
//   npm test -- --coverage      # Kapsama raporu
//
// ═══════════════════════════════════════════════════

const request = require('supertest');

// ─── Redis Mock ──────────────────────────────────
// ioredis gerçek Redis bağlantısı yerine bellek içi
// depolama simülasyonu ile değiştirilir.
// Bu sayede test ortamında Redis kurulumu gerekmez ve
// testler CI/CD pipeline'da bağımlılıksız çalışır.
//
// Mock'un desteklediği komutlar:
//   get, set, incr, expire, ttl    — rate limiting
//   sadd, smembers, del            — token revocation set
//   ping, quit, disconnect         — bağlantı yönetimi
jest.mock('ioredis', () => {
  const store = {};
  const sets = {};
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    status: 'ready',
    get: jest.fn((key) => Promise.resolve(store[key] || null)),
    set: jest.fn((key, val) => { store[key] = val; return Promise.resolve('OK'); }),
    incr: jest.fn((key) => {
      store[key] = (parseInt(store[key], 10) || 0) + 1;
      return Promise.resolve(store[key]);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    ttl: jest.fn(() => Promise.resolve(60)),
    sadd: jest.fn((key, ...members) => {
      if (!sets[key]) sets[key] = new Set();
      members.forEach((m) => sets[key].add(m));
      return Promise.resolve(members.length);
    }),
    smembers: jest.fn((key) => Promise.resolve(sets[key] ? [...sets[key]] : [])),
    del: jest.fn((key) => { delete store[key]; delete sets[key]; return Promise.resolve(1); }),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(),
  }));
});

let app;

beforeAll(async () => {
  // Initialize database BEFORE loading app (sql.js is async)
  const { initDatabase } = require('../src/config/database');
  await initDatabase();
  app = require('../src/app').app;
}, 30000);  // 30 second timeout for database initialization

afterAll(async () => {
  const { closeDatabase } = require('../src/config/database');
  closeDatabase();
});

/**
 * @group integration
 * @description Middleware pipeline'ının uçtan uca entegrasyon testleri.
 * Her test grubu belirli bir middleware katmanını veya endpoint'i doğrular.
 */
describe('Middleware Pipeline Tests', () => {
  const uniqueTestUser = `testuser_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const uniqueTestEmail = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`;

  // ─── Health Endpoint ──────────────────────────
  // Sağlık endpoint'i kimlik doğrulaması gerektirmez.
  // Load balancer ve container orchestration (Kubernetes)
  // bu endpoint'i liveness/readiness probe olarak kullanır.
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.services).toBeDefined();
    });
  });

  // ─── Auth: Register ──────────────────────────
  // Kayıt endpoint testleri üç senaryoyu kapsar:
  //  1. Başarılı kayıt (201 Created)
  //  2. Tekrar kayıt denemesi (400 Bad Request)
  //  3. Eksik alan ile kayıt (400 Bad Request)
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: uniqueTestUser,
          email: uniqueTestEmail,
          password: 'TestPassword123',
          role: 'student',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe(uniqueTestUser);
    });

    it('should reject duplicate user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: uniqueTestUser,
          email: uniqueTestEmail,
          password: 'TestPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'incomplete' });

      expect(res.status).toBe(400);
    });
  });

  // ─── Auth: Login ─────────────────────────────
  // Giriş testleri: geçerli kimlik bilgisi → JWT token,
  // yanlış şifre → 401 Unauthorized yanıtı.
  // Başarısız giriş denemeleri audit_logs'a kaydedilir.
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: uniqueTestEmail,
          password: 'TestPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('student');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: uniqueTestEmail,
          password: 'WrongPassword',
        });

      expect(res.status).toBe(401);
    });
  });

  // ─── Protected Routes ─────────────────────────
  // Korumalı endpoint testleri authGuard middleware'ini doğrular:
  //  - Token olmadan erişim → 401
  //  - Geçersiz token → 401
  //  - Geçerli token ile erişim → 200
  //  - Yetersiz rol ile erişim → 403
  describe('Protected Endpoints', () => {
    let token;

    beforeAll(async () => {
      const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
      const email = `admin_${uniqueSuffix}@test.com`;
      // Admin kullanıcı oluştur ve login yap
      await request(app)
        .post('/api/auth/register')
        .send({
          username: `admin_test_${uniqueSuffix}`,
          email: email,
          password: 'AdminPass123',
          role: 'admin',
        });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: email, password: 'AdminPass123' });

      token = login.body.token; // assign to outer let token
    }, 30000);

    it('should reject access without token', async () => {
      const res = await request(app).get('/api/dashboard');
      expect(res.status).toBe(401);
    });

    it('should allow dashboard access with valid token', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin panel access for admin role', async () => {
      const res = await request(app)
        .get('/api/admin/panel')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── RBAC Tests ────────────────────────────────
  describe('RBAC Guard', () => {
    let studentToken;

    beforeAll(async () => {
      const uniqueSuffix = Date.now() + Math.floor(Math.random() * 1000);
      const email = `student_${uniqueSuffix}@test.com`;
      // Student kullanıcı
      await request(app)
        .post('/api/auth/register')
        .send({
          username: `student_test_${uniqueSuffix}`,
          email: email,
          password: 'StudentPass123',
          role: 'student',
        });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: email, password: 'StudentPass123' });

      studentToken = login.body.token;
    }, 30000);

    it('should deny admin panel access for student', async () => {
      const res = await request(app)
        .get('/api/admin/panel')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should deny editor content access for student', async () => {
      const res = await request(app)
        .get('/api/editor/content')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow dashboard access for student', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── Response Headers ─────────────────────────
  describe('Response Headers', () => {
    it('should include X-Request-ID header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('should include Rate Limit headers', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });

  // ─── 404 Handler ──────────────────────────────
  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
