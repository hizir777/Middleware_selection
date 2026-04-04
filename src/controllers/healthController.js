// ═══════════════════════════════════════════════════
// Health Controller — Sistem Durumu
// ═══════════════════════════════════════════════════

const { getRedis, isUsingFallback } = require('../config/redis');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');

/**
 * GET /api/health
 * Uygulama + Redis durumunu döner.
 */
async function getHealth(req, res) {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      app: 'healthy',
      redis: 'unknown',
    },
  };

  try {
    const redis = getRedis();
    const pong = await redis.ping();
    if (isUsingFallback()) {
      health.services.redis = 'fallback (in-memory)';
    } else {
      health.services.redis = pong === 'PONG' ? 'healthy' : 'unhealthy';
    }
  } catch (err) {
    health.services.redis = 'unhealthy';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? HTTP.OK : HTTP.SERVICE_UNAVAILABLE;

  return res.status(statusCode).json({
    success: true,
    message: MESSAGES.GENERAL.HEALTH_OK,
    data: health,
  });
}

module.exports = { getHealth };
