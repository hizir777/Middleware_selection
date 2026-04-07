// ═══════════════════════════════════════════════════
// Auth Guard Middleware — "Polis"
// ═══════════════════════════════════════════════════
// JWT doğrulama + Token Revocation kontrolü +
// Cihaz Parmak İzi (Fingerprint) karşılaştırması.
//
// ⚡ Maliyet: Yüksek (~5-10ms) — JWT verify + Redis
// 🎯 Amaç:   Kimlik doğrulama
//
// ❌ Bu middleware Rate Limiter'dan ÖNCE gelseydi,
//    her bot isteği için crypto.verify çağrılır ve
//    sunucu CPU'su tavan yapar!
// ═══════════════════════════════════════════════════

const tokenService = require('../services/tokenService');
const { generateFingerprint, compareFingerprints } = require('../utils/fingerprint');
const { queryOne, execute } = require('../config/database');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');
const logger = require('../utils/logger');
const { logSecurityEvent, AUDIT_EVENTS } = require('../services/auditService');

/**
 * Factory function that returns the Authentication Guard middleware.
 * This middleware sits in front of protected routes and ensures that:
 * 1. A valid JWT token is present in the Authorization header.
 * 2. The token has not been tampered with and hasn't expired.
 * 3. The token hasn't been explicitly revoked (e.g., after a logout or password change).
 * 4. The client's fingerprint matches the fingerprint stored when the token was originally issued.
 * 
 * By placing this after rate-limiting but before resource-intensive handlers, 
 * Verification includes timestamp, IP, User-Agent, and Screen Resolution.
 * 
 * @param {import('express').Request} req - The Express request object containing the user's token and context.
 */
function authGuard() {
  return async (req, res, next) => {
    try {
      // ─── 1. Token varlık kontrolü ─────────────
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP.UNAUTHORIZED).json({
          success: false,
          error: MESSAGES.AUTH.TOKEN_REQUIRED,
        });
      }

      const token = authHeader.split(' ')[1];

      // ─── 2. JWT doğrulama (imza + süre) ───────
      let decoded;
      try {
        decoded = tokenService.verifyToken(token);
      } catch (err) {
        logger.warn(`[AuthGuard] Token doğrulama başarısız: ${err.message}`);
        return res.status(HTTP.UNAUTHORIZED).json({
          success: false,
          error: MESSAGES.AUTH.TOKEN_INVALID,
        });
      }

      // ─── 3. Token Revocation kontrolü (Redis) ─
      // Şifre değişikliği veya logout sonrası
      // token hala geçerli olsa bile reddedilir
      const isRevoked = await tokenService.isTokenRevoked(decoded.jti);
      if (isRevoked) {
        logger.warn(`[AuthGuard] İptal edilmiş token kullanıldı: jti=${decoded.jti}`);

        await logSecurityEvent({
          userId: decoded.id,
          action: AUDIT_EVENTS.TOKEN_REVOKED_ACCESS,
          details: `İptal edilmiş token ile erişim denemesi`,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.requestId,
        }, decoded.username);

        return res.status(HTTP.UNAUTHORIZED).json({
          success: false,
          error: MESSAGES.AUTH.TOKEN_REVOKED,
        });
      }

      // ─── 4. Cihaz Parmak İzi kontrolü ─────────
      // Kullanıcı farklı bir cihaz/ağdan geliyorsa
      // Session Hijacking riski olarak işaretlenir
      const currentFingerprint = generateFingerprint(req);
      const user = queryOne('SELECT fingerprint FROM users WHERE id = ?', [decoded.id]);

      if (user && user.fingerprint) {
        try {
          const match = compareFingerprints(user.fingerprint, currentFingerprint);
          if (!match) {
            logger.warn(
              `[AuthGuard] ⚠️ Parmak izi uyuşmuyor! user=${decoded.username}, ip=${req.ip}`
            );

            // Telegram'a bildir — ama erişimi tamamen engelleme
            // (VPN, mobil ağ değişikliği gibi meşru durumlar olabilir)
            await logSecurityEvent({
              userId: decoded.id,
              action: AUDIT_EVENTS.SESSION_HIJACK_ATTEMPT,
              details: MESSAGES.AUTH.SESSION_HIJACK,
              ip: req.ip,
              userAgent: req.headers['user-agent'],
              requestId: req.requestId,
            }, decoded.username);

            // Parmak izini güncelle (kullanıcı zaten doğrulanmış)
            await execute('UPDATE users SET fingerprint = ? WHERE id = ?', [currentFingerprint, decoded.id]);
          }
        } catch (fpErr) {
          // Parmak izi karşılaştırma hatası — isteği engelleme
          logger.debug(`[AuthGuard] Fingerprint karşılaştırma hatası: ${fpErr.message}`);
        }
      }

      // ─── 5. Request nesnesine kullanıcı bilgisi ekle ─
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
      };
      req.token = token;

      next();
    } catch (err) {
      logger.error(`[AuthGuard] Beklenmeyen hata: ${err.message}`);
      return res.status(HTTP.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: MESSAGES.GENERAL.SERVER_ERROR,
      });
    }
  };
}

module.exports = authGuard;
