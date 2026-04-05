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
});

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
      await request(app).post('/api/auth/register').send(testUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'invalid_email_user',
          email: 'not-an-email',
          password: 'Password@123',
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should enforce password requirements', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'weak_password_user',
          email: `weak_${timestamp}@example.com`,
          password: 'weak',  // Too short
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
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
      expect(res.body.token).toMatch(/^eyJ/);  // JWT regex

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

    it('should reject request with expired token', async () => {
      // Create token with very short expiry
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzY0MjJ9.invalid';

      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${expiredToken}`);

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

    it('should enforce rate limit on login', async () => {
      const loginAttempts = [];
      for (let i = 0; i < 15; i++) {
        loginAttempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: `test_${i}@example.com`,
              password: 'password',
            })
        );
      }

      const results = await Promise.all(loginAttempts);
      const rateLimited = results.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
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

    it('should list endpoints by role', async () => {
      // Available routes for student
      const studentRoutes = [
        '/api/dashboard',
        '/api/auth/logout',
        '/api/auth/change-password',
      ];

      for (const route of studentRoutes) {
        const res = await request(app)
          .get(route)
          .set('Authorization', `Bearer ${authToken}`);

        // Either allowed (200) or method not allowed (405), not forbidden (403)
        expect(res.status).not.toBe(403);
      }
    });
  });

  // ─────────────────────────────────────────────────────
  // PASSWORD CHANGE & TOKEN REVOCATION
  // ─────────────────────────────────────────────────────
  describe('Step 6: Password Change & Token Revocation', () => {
    it('should change password successfully', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          oldPassword: testUser.password,
          newPassword: 'NewPassword@456',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should revoke old token after password change', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(401);
    });

    it('should login with new password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'NewPassword@456',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();

      authToken = res.body.token;
    });
  });

  // ─────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────
  describe('Step 7: User Logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should revoke token after logout', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(401);
    });
  });
});
