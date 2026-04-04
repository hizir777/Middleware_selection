// ═══════════════════════════════════════════════════
// Audit Service — Güvenlik Günlüğü
// ═══════════════════════════════════════════════════
// Kritik olaylar (register, login, logout, password
// change, yetki aşımı) kaydedilir ve Telegram ile
// bildirim gönderilir.
// ═══════════════════════════════════════════════════

const { execute, queryAll } = require('../config/database');
const logger = require('../utils/logger');
const { sendTelegramAlert, formatAuditAlert, formatSecurityAlert } = require('../utils/telegram');

// Kayıt altına alınacak olay tipleri
const AUDIT_EVENTS = {
  REGISTER: 'REGISTER',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SESSION_HIJACK_ATTEMPT: 'SESSION_HIJACK_ATTEMPT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOKEN_REVOKED_ACCESS: 'TOKEN_REVOKED_ACCESS',
};

/**
 * Audit log kaydı oluşturur.
 */
async function logAudit(entry) {
  try {
    await execute(
      `INSERT INTO audit_logs (user_id, action, details, ip, user_agent, request_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.userId || null,
        entry.action,
        entry.details || null,
        entry.ip || null,
        entry.userAgent || null,
        entry.requestId || null,
      ]
    );

    logger.info(`[Audit] ${entry.action} — user:${entry.userId || 'N/A'}, ip:${entry.ip || 'N/A'}`);
  } catch (err) {
    logger.error(`[Audit] Kayıt hatası: ${err.message}`);
  }
}

/**
 * Audit log + Telegram bildirimi (güvenlik olayları için).
 */
async function logSecurityEvent(entry, username) {
  await logAudit(entry);

  const alert = formatSecurityAlert({
    event: entry.action,
    username: username || 'Bilinmiyor',
    ip: entry.ip,
    details: entry.details,
    requestId: entry.requestId,
  });

  await sendTelegramAlert(alert);
}

/**
 * Audit log + Telegram bildirimi (genel audit olayları için).
 */
async function logAuditEvent(entry, username) {
  await logAudit(entry);

  const alert = formatAuditAlert({
    event: entry.action,
    username: username || 'Bilinmiyor',
    ip: entry.ip,
    details: entry.details,
  });

  await sendTelegramAlert(alert);
}

/**
 * Son audit loglarını getirir (Dashboard için).
 */
function getRecentAuditLogs(limit = 50) {
  try {
    return queryAll(
      `SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.details,
        al.ip,
        al.user_agent,
        al.request_id,
        al.timestamp
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
      LIMIT ?`,
      [limit]
    );
  } catch (err) {
    logger.error(`[Audit] Sorgu hatası: ${err.message}`);
    return [];
  }
}

module.exports = {
  AUDIT_EVENTS,
  logAudit,
  logSecurityEvent,
  logAuditEvent,
  getRecentAuditLogs,
};
