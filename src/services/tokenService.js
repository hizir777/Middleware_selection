// ═══════════════════════════════════════════════════
// Token Service — JWT Yönetimi & Revocation
// ═══════════════════════════════════════════════════
// Token oluşturma, doğrulama ve Redis üzerinden
// anlık iptal (revocation) mekanizması.
// ═══════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

// Redis key prefix
const REVOKED_PREFIX = 'revoked:';
const USER_TOKENS_PREFIX = 'user_tokens:';

/**
 * JWT oluşturur.
 * @param {object} payload - Token verisi { id, username, email, role }
 * @returns {Promise<{token: string, jti: string}>}
 */
async function signToken(payload) {
  const jti = uuidv4(); // Benzersiz token kimliği

  const token = jwt.sign(
    { ...payload, jti },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  // Kullanıcının aktif token'larını Redis'e kaydet (şifre değişikliğinde toplu iptal için)
  const redis = getRedis();
  const decoded = jwt.decode(token);
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);

  await redis.sadd(`${USER_TOKENS_PREFIX}${payload.id}`, jti);
  await redis.expire(`${USER_TOKENS_PREFIX}${payload.id}`, ttl);

  return { token, jti };
}

/**
 * JWT doğrular.
 * @param {string} token - JWT string
 * @returns {object} - Decoded payload
 * @throws {Error} - Token geçersizse
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

/**
 * Token'ın iptal edilip edilmediğini kontrol eder.
 * @param {string} jti - Token benzersiz kimliği
 * @returns {Promise<boolean>}
 */
async function isTokenRevoked(jti) {
  const redis = getRedis();
  const result = await redis.get(`${REVOKED_PREFIX}${jti}`);
  return result !== null;
}

/**
 * Tek bir token'ı iptal eder (logout).
 * Token'ın kalan ömrü kadar Redis'te tutulur.
 * @param {string} token - JWT string
 */
async function revokeToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.jti) return;

    const redis = getRedis();
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);

    if (ttl > 0) {
      await redis.set(`${REVOKED_PREFIX}${decoded.jti}`, '1', 'EX', ttl);
      logger.info(`[TokenService] Token iptal edildi: jti=${decoded.jti}, TTL=${ttl}s`);
    }
  } catch (err) {
    logger.error(`[TokenService] Token iptal hatası: ${err.message}`);
  }
}

/**
 * Kullanıcının TÜM token'larını iptal eder (şifre değişikliği).
 * @param {number} userId  - Kullanıcı ID
 */
async function revokeAllUserTokens(userId) {
  try {
    const redis = getRedis();
    const jtiSet = await redis.smembers(`${USER_TOKENS_PREFIX}${userId}`);

    for (const jti of jtiSet) {
      // Her token'ı 1 saat boyunca blacklist'te tut
      await redis.set(`${REVOKED_PREFIX}${jti}`, '1', 'EX', 3600);
    }

    // Token set'ini temizle
    await redis.del(`${USER_TOKENS_PREFIX}${userId}`);

    logger.info(`[TokenService] Kullanıcı ${userId} için ${jtiSet.length} token iptal edildi`);
  } catch (err) {
    logger.error(`[TokenService] Toplu iptal hatası: ${err.message}`);
  }
}

module.exports = {
  signToken,
  verifyToken,
  isTokenRevoked,
  revokeToken,
  revokeAllUserTokens,
};
