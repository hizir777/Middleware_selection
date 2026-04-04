// ═══════════════════════════════════════════════════
// Fingerprint — Cihaz Parmak İzi
// ═══════════════════════════════════════════════════
// IP + User-Agent + Screen Resolution verilerinden
// benzersiz bir parmak izi oluşturur.
// Oturum hırsızlığı (Session Hijacking) tespiti için
// kullanılır.
// ═══════════════════════════════════════════════════

const crypto = require('crypto');

/**
 * İstek bilgilerinden parmak izi oluşturur.
 * @param {object} req - Express request nesnesi
 * @returns {string} - SHA-256 hash (hex)
 */
function generateFingerprint(req) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const screenResolution = req.headers['x-screen-resolution'] || 'unknown';

  const raw = `${ip}|${userAgent}|${screenResolution}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * İki parmak izini karşılaştırır.
 * @param {string} stored     - Kayıtlı parmak izi
 * @param {string} incoming   - Yeni istekten gelen parmak izi
 * @returns {boolean}
 */
function compareFingerprints(stored, incoming) {
  if (!stored || !incoming) return false;
  return crypto.timingSafeEqual(
    Buffer.from(stored, 'hex'),
    Buffer.from(incoming, 'hex')
  );
}

/**
 * Parmak izi bileşenlerini ayrıştırılmış döner (debug/log için).
 */
function getFingerprintComponents(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    screenResolution: req.headers['x-screen-resolution'] || 'unknown',
  };
}

module.exports = {
  generateFingerprint,
  compareFingerprints,
  getFingerprintComponents,
};
