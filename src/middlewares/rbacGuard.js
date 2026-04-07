// ═══════════════════════════════════════════════════
// RBAC Guard Middleware — "Zabıta"
// ═══════════════════════════════════════════════════
//
// Pipeline'daki EN SON güvenlik bariyeri.
// Kimliği doğrulanmış kullanıcının gerekli role
// sahip olup olmadığını kontrol eder.
//
// ⚡ Maliyet: Orta (~1-2ms) — Sadece bellek kontrolü
// 🎯 Amaç:   Rol tabanlı yetki kontrolü (RBAC)
//
// Sıralama Zorunluluğu:
//   Bu middleware MUTLAKA authGuard'dan SONRA gelmelidir.
//   authGuard req.user nesnesini oluşturur; rbacGuard
//   bu nesneye ihtiyaç duyar. Önce gelirse req.user
//   undefined olur ve her isteği reddeder.
//
// RBAC Hiyerarşisi:
//   ADMIN  (seviye 3) — tüm erişime izin
//   EDITOR (seviye 2) — editor + student kaynaklarına erişim
//   STUDENT(seviye 1) — sadece student kaynaklarına erişim
//
// Kullanım:
//   router.get('/admin', authGuard(), rbacGuard(ROLES.ADMIN), ctrl);
//   router.get('/editor', authGuard(), rbacGuard(ROLES.EDITOR), ctrl);
// ═══════════════════════════════════════════════════

const { hasPermission } = require('../constants/roles');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');
const logger = require('../utils/logger');
const { logSecurityEvent, AUDIT_EVENTS } = require('../services/auditService');

/**
 * RBAC Guard — Minimum rol gereksinimi kontrolü.
 * @param {string} requiredRole - Rota için gereken minimum rol ('student', 'editor', 'admin')
 * @returns {Function} Express middleware
 *
 * @example
 * // Sadece admin erişebilir
 * router.get('/admin/panel', authGuard(), rbacGuard('admin'), adminController);
 *
 * // Editor ve üstü erişebilir
 * router.get('/editor/content', authGuard(), rbacGuard('editor'), editorController);
 */
function rbacGuard(requiredRole) {
  return async (req, res, next) => {
    // Auth Guard'dan gelen kullanıcı bilgisi olmalı
    if (!req.user) {
      logger.error('[RBAC] req.user bulunamadı — Auth Guard eksik mi?');
      return res.status(HTTP.UNAUTHORIZED).json({
        success: false,
        error: MESSAGES.AUTH.TOKEN_REQUIRED,
      });
    }

    const userRole = req.user.role;

    // ─── Yetki kontrolü ─────────────────────────
    if (!hasPermission(userRole, requiredRole)) {
      logger.warn(
        `[RBAC] ⛔ Yetkisiz erişim denemesi: user=${req.user.username}, ` +
        `role=${userRole}, required=${requiredRole}, path=${req.originalUrl}`
      );

      // Güvenlik olayı — Telegram bildirimi
      await logSecurityEvent({
        userId: req.user.id,
        action: AUDIT_EVENTS.PERMISSION_DENIED,
        details: `Gereken rol: ${requiredRole}, Mevcut rol: ${userRole}, Rota: ${req.originalUrl}`,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId,
      }, req.user.username);

      return res.status(HTTP.FORBIDDEN).json({
        success: false,
        error: MESSAGES.RBAC.FORBIDDEN,
        detail: `${MESSAGES.RBAC.ROLE_REQUIRED}${requiredRole}`,
      });
    }

    // ✅ Yetki var — Controller'a geç
    logger.debug(
      `[RBAC] ✅ Yetki onaylandı: user=${req.user.username}, role=${userRole}, path=${req.originalUrl}`
    );
    next();
  };
}

module.exports = rbacGuard;
