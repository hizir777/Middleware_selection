// ═══════════════════════════════════════════════════
// Auth Service — Kimlik Doğrulama İş Mantığı
// ═══════════════════════════════════════════════════
// Register, Login, Logout, Change Password işlemleri.
// bcryptjs ile güvenli parola yönetimi.
// ═══════════════════════════════════════════════════

const bcrypt = require('bcryptjs');
const { queryOne, queryAll, execute } = require('../config/database');
const tokenService = require('./tokenService');
const { logAuditEvent, logSecurityEvent, AUDIT_EVENTS } = require('./auditService');
const { generateFingerprint } = require('../utils/fingerprint');
const logger = require('../utils/logger');

const SALT_ROUNDS = 10;

/**
 * Yeni kullanıcı kaydı.
 */
async function register({ username, email, password, role = 'student' }, req) {
  // Mevcut kullanıcı kontrolü
  const existing = queryOne(
    'SELECT id FROM users WHERE email = ? OR username = ?',
    [email, username]
  );

  if (existing) {
    return { success: false, error: 'USER_EXISTS' };
  }

  // Şifre hashleme (bcryptjs — kasıtlı olarak yavaş, brute-force koruması)
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Parmak izi
  const fingerprint = req ? generateFingerprint(req) : null;

  const result = execute(
    `INSERT INTO users (username, email, password_hash, role, fingerprint)
     VALUES (?, ?, ?, ?, ?)`,
    [username, email, passwordHash, role, fingerprint]
  );

  // Audit log
  await logAuditEvent({
    userId: result.lastInsertRowid,
    action: AUDIT_EVENTS.REGISTER,
    details: `Yeni kullanıcı: ${username} (${role})`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    requestId: req?.requestId,
  }, username);

  logger.info(`[Auth] Yeni kayıt: ${username} (${role})`);

  return {
    success: true,
    user: {
      id: result.lastInsertRowid,
      username,
      email,
      role,
    },
  };
}

/**
 * Kullanıcı girişi.
 */
async function login({ email, password }, req) {
  const user = queryOne(
    'SELECT id, username, email, password_hash, role, fingerprint FROM users WHERE email = ?',
    [email]
  );

  if (!user) {
    // Audit: Başarısız giriş
    await logSecurityEvent({
      action: AUDIT_EVENTS.LOGIN_FAILED,
      details: `Geçersiz email: ${email}`,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      requestId: req?.requestId,
    }, email);

    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Şifre karşılaştırma
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    await logSecurityEvent({
      userId: user.id,
      action: AUDIT_EVENTS.LOGIN_FAILED,
      details: `Hatalı şifre denemesi`,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      requestId: req?.requestId,
    }, user.username);

    return { success: false, error: 'INVALID_CREDENTIALS' };
  }

  // Parmak izi güncelle
  const fingerprint = req ? generateFingerprint(req) : null;
  if (fingerprint) {
    execute(
      'UPDATE users SET fingerprint = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [fingerprint, user.id]
    );
  }

  // JWT oluştur
  const { token, jti } = tokenService.signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  });

  // Audit log
  await logAuditEvent({
    userId: user.id,
    action: AUDIT_EVENTS.LOGIN,
    details: `Başarılı giriş`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    requestId: req?.requestId,
  }, user.username);

  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Oturum kapatma — Token'ı Redis'te iptal eder.
 */
async function logout(token, req) {
  const decoded = require('jsonwebtoken').decode(token);

  await tokenService.revokeToken(token);

  if (decoded) {
    await logAuditEvent({
      userId: decoded.id,
      action: AUDIT_EVENTS.LOGOUT,
      details: 'Oturum kapatıldı',
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      requestId: req?.requestId,
    }, decoded.username);
  }

  return { success: true };
}

/**
 * Şifre değiştirme — Eski tüm token'lar iptal edilir.
 */
async function changePassword({ userId, oldPassword, newPassword }, req) {
  const user = queryOne(
    'SELECT id, username, password_hash FROM users WHERE id = ?',
    [userId]
  );

  if (!user) {
    return { success: false, error: 'USER_NOT_FOUND' };
  }

  // Eski şifre doğrulama
  const isValid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!isValid) {
    return { success: false, error: 'INVALID_OLD_PASSWORD' };
  }

  // Yeni şifre hash
  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  execute(
    'UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [newHash, userId]
  );

  // TÜM eski token'ları iptal et (Redis'ten)
  await tokenService.revokeAllUserTokens(userId);

  // Audit log + Telegram
  await logSecurityEvent({
    userId: user.id,
    action: AUDIT_EVENTS.PASSWORD_CHANGE,
    details: 'Şifre değiştirildi — tüm oturumlar sonlandırıldı',
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    requestId: req?.requestId,
  }, user.username);

  return { success: true };
}

/**
 * Tüm kullanıcıları döner (Admin dashboard için).
 */
function getAllUsers() {
  return queryAll(
    'SELECT id, username, email, role, created_at, updated_at FROM users ORDER BY created_at DESC'
  );
}

/**
 * Kullanıcı rolünü günceller.
 */
async function updateUserRole(userId, newRole, req, adminUsername) {
  const user = queryOne('SELECT id, username, role FROM users WHERE id = ?', [userId]);

  if (!user) return { success: false, error: 'USER_NOT_FOUND' };

  execute(
    'UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?',
    [newRole, userId]
  );

  await logSecurityEvent({
    userId: user.id,
    action: 'ROLE_CHANGE',
    details: `Rol değişikliği: ${user.role} → ${newRole} (Admin: ${adminUsername})`,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    requestId: req?.requestId,
  }, user.username);

  return { success: true };
}

module.exports = {
  register,
  login,
  logout,
  changePassword,
  getAllUsers,
  updateUserRole,
};
