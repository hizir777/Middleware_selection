// ═══════════════════════════════════════════════════
// Health Controller — Sistem Durumu
// ═══════════════════════════════════════════════════

const { getRedis, isUsingFallback } = require('../config/redis');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');

/**
 * Retrieves the overall system health status.
 * Checks the status of the Node.js application and tests connectivity to the Redis instance.
 * Returns an 'ok' status if everything is running, or 'degraded' if a service (like Redis) is failing.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<Object>} JSON response containing detailed health metrics including uptime and service statuses.
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
