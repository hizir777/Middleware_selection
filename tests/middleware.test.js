// ═══════════════════════════════════════════════════
// Middleware Tests — Unit & Integration
// ═══════════════════════════════════════════════════

const request = require('supertest');

// Mock Redis before app loads
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

describe('Middleware Pipeline Tests', () => {
  const uniqueTestUser = `testuser_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const uniqueTestEmail = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`;

  // ─── Health Endpoint ──────────────────────────
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.services).toBeDefined();
    });
  });

  // ─── Auth: Register ──────────────────────────
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
    });

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
    });

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
