# Database Schema Documentation

## 📊 Users Table

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Authentication
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  
  -- Authorization
  role TEXT DEFAULT 'student' CHECK(role IN ('student', 'editor', 'admin')),
  
  -- Security
  fingerprint TEXT,  -- Device fingerprint (IP hash + User-Agent hash)
  is_active BOOLEAN DEFAULT 1,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME,
  
  -- Indexes
  UNIQUE(email),
  UNIQUE(username)
);

-- Query optimization indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
```

### Fields

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Primary key | AUTO_INCREMENT |
| `username` | TEXT | Unique username | UNIQUE NOT NULL |
| `email` | TEXT | Email address | UNIQUE NOT NULL |
| `password_hash` | TEXT | bcryptjs hash (60 chars) | NOT NULL |
| `role` | TEXT | Access level | student\|editor\|admin |
| `fingerprint` | TEXT | Device hash | SHA256 (IP+UA) |
| `is_active` | BOOLEAN | Account status | 1=active, 0=inactive |
| `created_at` | DATETIME | Creation date | Auto-set |
| `updated_at` | DATETIME | Last update | Auto-set |
| `last_login_at` | DATETIME | Last login timestamp | Nullable |

### Roles

| Role | Permissions | Access Level |
|------|-------------|--------------|
| `student` | Read dashboard, view content | Basic |
| `editor` | Create/edit content | Medium |
| `admin` | Full access, user management | High |

### Example Queries

```sql
-- Login: Find user by email
SELECT id, username, email, password_hash, role, fingerprint 
FROM users 
WHERE email = 'user@example.com';

-- Get all admins
SELECT username, email, role 
FROM users 
WHERE role = 'admin';

-- Change role
UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP 
WHERE id = 5;

-- Deactivate account
UPDATE users SET is_active = 0 
WHERE id = 5;
```

---

## 📋 Audit Logs Table

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- User reference
  user_id INTEGER,
  username TEXT,
  
  -- Action tracking
  action TEXT NOT NULL,  -- LOGIN, LOGOUT, REGISTER, CHANGE_PASSWORD, etc.
  details TEXT,  -- JSON or plain text details
  
  -- Security
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,  -- Correlation ID (UUID)
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Query optimization
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
```

### Fields

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `user_id` | INTEGER | User reference (nullable for system events) |
| `username` | TEXT | Username at time of action |
| `action` | TEXT | Event type (REGISTER, LOGIN, LOGOUT, etc.) |
| `details` | TEXT | Additional context (JSON or plain) |
| `ip_address` | TEXT | Client IP |
| `user_agent` | TEXT | Browser/client info |
| `request_id` | TEXT | UUID for request tracing |
| `created_at` | DATETIME | Event timestamp |

### Action Types

```
REGISTER            - User registration
LOGIN               - Successful login
LOGIN_FAILED        - Failed login attempt
LOGOUT              - User logout
CHANGE_PASSWORD     - Password changed
TOKEN_REVOKE        - Token(s) revoked
PASSWORD_RESET      - Password reset
ROLE_CHANGED        - User role changed
USER_DELETED        - Account deleted
SESSION_HIJACK_WARN - Fingerprint mismatch detected
API_ERROR           - API error occurred
```

### Example Queries

```sql
-- Get all logins for user in last 24 hours
SELECT * FROM audit_logs 
WHERE user_id = 5 AND action = 'LOGIN' AND created_at > datetime('now', '-1 day')
ORDER BY created_at DESC;

-- Failed login attempts
SELECT username, ip_address, COUNT(*) as attempts 
FROM audit_logs 
WHERE action = 'LOGIN_FAILED' AND created_at > datetime('now', '-1 hour')
GROUP BY username, ip_address
HAVING attempts > 3;

-- All admin actions
SELECT username, action, created_at 
FROM audit_logs 
WHERE action LIKE '%ROLE%' OR action LIKE '%DELETE%'
ORDER BY created_at DESC;

-- Session hijack warnings
SELECT user_id, username, ip_address, created_at 
FROM audit_logs 
WHERE action = 'SESSION_HIJACK_WARN'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🔐 Token Blacklist (Redis)

Redis'te depolanan iptal edilen token'lar. **Veritabanında değil.**

### Key Format

```
revoked:{jti}          → "1" (TTL: token expiry + 1 hour)
user_tokens:{user_id}  → SET of {jti's}  (TTL: 24 hours)
```

### Operations

```bash
# Token iptal et
SETEX revoked:abc123 3600 "1"

# Tüm user token'larını getir
SMEMBERS user_tokens:5
# Result: ["jti_1", "jti_2", "jti_3"]

# Tüm user token'larını revoke et
SMEMBERS user_tokens:5 → for each jti: SETEX revoked:{jti} 3600 "1"

# Token revoked mı kontrol et
EXISTS revoked:abc123
# Result: 1 (yes) or 0 (no)
```

### Automatic Cleanup

```
JWT exp: 3600s (1 hour)
→ Redis TTL: 3600s + 3600s = 7200s (2 hours)
→ After 2 hours, Redis key otomatik silinir
```

---

## 🎯 Data Model Diagram

```
┌─────────────────────────────────────────┐
│              Users (SQL)                │
├─────────────────────────────────────────┤
│ PK: id                                  │
│ username (UNIQUE)                       │
│ email (UNIQUE)                          │
│ password_hash (bcryptjs)                │
│ role (student|editor|admin)             │
│ fingerprint (SHA256)                    │
│ is_active                               │
│ created_at, updated_at, last_login_at   │
└────────┬────────────────────────────────┘
         │
         │ FK (user_id)
         │
         ▼
┌─────────────────────────────────────────┐
│          Audit Logs (SQL)               │
├─────────────────────────────────────────┤
│ PK: id                                  │
│ FK: user_id                             │
│ username                                │
│ action (REGISTER, LOGIN, etc.)          │
│ details (JSON)                          │
│ ip_address                              │
│ user_agent                              │
│ request_id (UUID)                       │
│ created_at                              │
└─────────────────────────────────────────┘

        Token Blacklist (Redis)
┌─────────────────────────────────────────┐
│ revoked:{jti} → "1" (TTL)               │
│ user_tokens:{id} → SET {jti's} (TTL)    │
└─────────────────────────────────────────┘
```

---

## 📈 Database Performance

### Query Performance Targets

| Query | Execution Time | Status |
|-------|----------------|--------|
| Find user by email | < 1ms | ✅ Indexed |
| Get audit logs (user) | < 5ms | ✅ Indexed |
| Count failed logins | < 10ms | ⚠️ Full scan |
| Get all admins | < 10ms | ✅ Indexed |

### Indexes

```sql
-- Performance critical
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### Maintenance

```bash
# Database integrity check
sqlite3 middleware.db "PRAGMA integrity_check;"

# Optimize (VACUUM)
sqlite3 middleware.db "VACUUM;"

# Statistics
sqlite3 middleware.db "PRAGMA database_list;"
```

---

## 🔄 Data Lifecycle

### User Lifecycle

```
Registration → Active → (Password Reset) → (Role Change) → (Deactivate) → Deleted?
```

### Token Lifecycle

```
Login (Create JWT)
    ↓
    ├─ Normal: Token expires after 1h
    │   → Redis entry auto-cleanup after 2h
    │
    ├─ Logout: Token revoked immediately
    │   → Redis: SET revoked:{jti} = "1" (TTL=1h)
    │
    ├─ Password Change: All tokens revoked
    │   → Redis: SMEMBERS user_tokens:{id}
    │   → SETEX revoked:{each_jti}
    │
    └─ Session Hijack: Manual revoke
        → Admin revokes token
        → User re-login required
```

---

## 🛡️ Security Notes

- ✅ Passwords: bcryptjs hash (never plain text)
- ✅ Tokens: JWT in Redis, not SQL
- ✅ IPs: Audit/log only (not for blocking yet)
- ✅ Fingerprints: SHA256 hash (not original device data)
- ✅ Audit trail: Immutable (append-only)

---

## 📝 Migration Path (Future)

### From SQLite → PostgreSQL

```sql
-- Drop current schema
-- Create on PostgreSQL
-- Dump from SQLite, restore to Postgres
pg_restore --dbname=middleware_selection backup.sql
```

### From sql.js → SQL.js + Worker Threads

```javascript
// Heavy queries in worker pool
const { Worker } = require('worker_threads');
// Prevent event loop blocking
```

---

**Schema Version:** 1.0.0  
**Last Updated:** 2026-04-05  
**Compatibility:** sql.js 1.11.0+, Node.js 18+
