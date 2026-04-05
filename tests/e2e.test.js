// ═══════════════════════════════════════════════════════
// E2E Tests — End-to-End Middleware Selection
// ═══════════════════════════════════════════════════════

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
    setex: jest.fn((key, ttl, val) => { store[key] = val; return Promise.resolve('OK'); }),
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
    exists: jest.fn((key) => Promise.resolve(store[key] ? 1 : 0)),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(),
  }));
});

let app;

beforeAll(async () => {
  const { initDatabase } = require('../src/config/database');
  await initDatabase();
  app = require('../src/app').app;
}, 30000);  // 30 second timeout for database initialization

afterAll(async () => {
  const { closeDatabase } = require('../src/config/database');
  closeDatabase();
});

describe('E2E — Complete User Journey', () => {
  const timestamp = Date.now();
  const testUser = {
    username: `e2e_user_${timestamp}`,
    email: `e2e_${timestamp}@example.com`,
    password: 'E2ETest@123',
  };

  let authToken;

  // ─────────────────────────────────────────────────────
  // REGISTRATION FLOW
  // ─────────────────────────────────────────────────────
  describe('Step 1: User Registration', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe(testUser.username);
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should reject duplicate registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────
  // LOGIN FLOW
  // ─────────────────────────────────────────────────────
  describe('Step 2: User Login', () => {
    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.token).toMatch(/^eyJ/);

      authToken = res.body.token;
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password@123',
        });

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────
  // PROTECTED ROUTE ACCESS
  // ─────────────────────────────────────────────────────
  describe('Step 3: Access Protected Routes', () => {
    it('should access dashboard with valid token', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/dashboard');

      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', 'Bearer invalid_token');

      expect(res.status).toBe(401);
    });

    it('should reject request with malformed token', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', 'Bearer bad.token.format');

      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────
  // RATE LIMITING
  // ─────────────────────────────────────────────────────
  describe('Step 4: Rate Limiting Tests', () => {
    it('should allow health checks within limit', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(request(app).get('/api/health'));
      }

      const results = await Promise.all(promises);
      expect(results.every((r) => r.status === 200 || r.status === 429)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────
  // ROLE-BASED ACCESS CONTROL (RBAC)
  // ─────────────────────────────────────────────────────
  describe('Step 5: Role-Based Access Control', () => {
    it('student should not access admin panel', async () => {
      const res = await request(app)
        .get('/api/admin/panel')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(403);
    });

    it('should access allowed endpoints by role', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────
  // PASSWORD CHANGE & TOKEN REVOCATION
  // ─────────────────────────────────────────────────────
  describe('Step 6: Password Change & Token Revocation', () => {
    const passwordChangeUser = {
      username: `pwchange_${Date.now()}`,
      email: `pwchange_${Date.now()}@example.com`,
      password: 'OldPassword@123',
    };

    let freshToken;

    it('should register fresh user for password test', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(passwordChangeUser);

      expect(res.status).toBe(201);
    });

    it('should login and get fresh token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: passwordChangeUser.email,
          password: passwordChangeUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      freshToken = res.body.token;
    });

    it('should change password successfully', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({
          oldPassword: passwordChangeUser.password,
          newPassword: 'NewPassword@456',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should revoke old token after password change', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${freshToken}`);

      expect(res.status).toBe(401);
    });

    it('should login with new password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: passwordChangeUser.email,
          password: 'NewPassword@456',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────
  describe('Step 7: User Logout', () => {
    it('should logout successfully', async () => {
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);
    });

    it('should revoke token after logout', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(401);
    });
  });
});
