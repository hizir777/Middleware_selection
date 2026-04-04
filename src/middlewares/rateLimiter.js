// ═══════════════════════════════════════════════════
// Rate Limiter Middleware — "Yunus Polisi"
// ═══════════════════════════════════════════════════
// Pipeline'daki EN İLK bariyer. Redis tabanlı
// sliding window sayaçları kullanır.
//
// ⚡ Maliyet: ~0.1ms (sadece Redis GET/INCR)
// 🎯 Amaç:   Sahte istekleri Auth/DB'ye ulaşmadan
//             elemek. CPU/RAM koruması.
//
// ❌ Eğer bu middleware Auth'tan sonra olsaydı,
//    her bot isteğinde ağır JWT şifre çözme ve
//    veritabanı sorgusu yapılırdı!
// ═══════════════════════════════════════════════════

const config = require('../config');
const { getRedis } = require('../config/redis');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');
const logger = require('../utils/logger');
const { logAudit, AUDIT_EVENTS } = require('../services/auditService');

// Kritik rotalar — dakikada sadece 10 istek kabul edilir
const CRITICAL_ROUTES = ['/api/auth/login', '/api/auth/register'];

/**
 * Redis sliding window rate limiter.
 * Her IP için ayrı sayaç tutar.
 */
function rateLimiter() {
  return async (req, res, next) => {
    try {
      const redis = getRedis();
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const path = req.path;

      // Kritik rota mı kontrol et
      const isCritical = CRITICAL_ROUTES.some((route) => path.startsWith(route));
      const limit = isCritical ? config.rateLimit.critical : config.rateLimit.general;
      const windowMs = config.rateLimit.windowMs;
      const windowSec = Math.ceil(windowMs / 1000);

      // Redis key: ratelimit:<ip>:<route_type>
      const keyType = isCritical ? 'critical' : 'general';
      const key = `ratelimit:${ip}:${keyType}`;

      // Atomik INCR + EXPIRE
      const current = await redis.incr(key);

      if (current === 1) {
        // İlk istek — TTL ayarla
        await redis.expire(key, windowSec);
      }

      // Kalan süre (Retry-After header için)
      const ttl = await redis.ttl(key);

      // Response header'ları — istemciye bilgi verir
      res.set({
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(Math.max(0, limit - current)),
        'X-RateLimit-Reset': String(ttl),
      });

      // ─── Limit Aşıldı ─────────────────────────
      if (current > limit) {
        logger.warn(
          `[RateLimiter] ⚠️ Limit aşıldı: IP=${ip}, route=${path}, ` +
          `count=${current}/${limit}, type=${keyType}`
        );

        // Audit log (DB'ye yazma — ama Auth'a ulaşmadı!)
        logAudit({
          action: AUDIT_EVENTS.RATE_LIMIT_EXCEEDED,
          details: `IP=${ip}, route=${path}, count=${current}/${limit}`,
          ip,
          userAgent: req.headers['user-agent'],
          requestId: req.requestId,
        });

        return res.status(HTTP.TOO_MANY_REQUESTS).json({
          success: false,
          error: isCritical
            ? MESSAGES.RATE_LIMIT.EXCEEDED_CRITICAL
            : MESSAGES.RATE_LIMIT.EXCEEDED,
          retryAfter: ttl,
        });
        // ❌ next() ÇAĞRILMADI — Auth, RBAC, Controller'a hiç ulaşmaz!
      }

      // ✅ Limit aşılmadı — sonraki middleware'e geç
      next();
    } catch (err) {
      // Redis hatası durumunda isteği geçir (fail-open)
      // Aksi halde Redis çöktüğünde tüm istekler bloklanır
      logger.error(`[RateLimiter] Redis hatası — fail-open: ${err.message}`);
      next();
    }
  };
}

module.exports = rateLimiter;
