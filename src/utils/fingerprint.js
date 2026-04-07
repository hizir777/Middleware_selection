// ═══════════════════════════════════════════════════
// Fingerprint — Cihaz Parmak İzi
// ═══════════════════════════════════════════════════
//
// İstemci tarafında toplanan işaretleri birleştirerek
// bir cihaza özgü SHA-256 karma değeri üretir.
//
// Kullanılan Sinyaller:
//   ip_address       — IPv4/IPv6 adresi
//   user_agent       — Tarayıcı/istemci kimliği
//   screen_resolution— Ekran boyutu (X-Screen-Resolution)
//
// Session Hijacking Koruması:
//   Giriş sırasında üretilen parmak izi token payload'ına
//   eklenir. Her istekte authGuard bu değeri yeniden
//   hesaplar ve karşılaştırır. Farklılık = hijack girişimi.
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
 * @param {string} stored     - Kayıtlı parmak izi (SHA-256 hex string)
 * @param {string} incoming   - Yeni istekten gelen parmak izi (SHA-256 hex string)
 * @returns {boolean}
 */
function compareFingerprints(stored, incoming) {
  if (!stored || !incoming) return false;
  // Hex string karşılaştırması (timing-safe)
  if (stored.length !== incoming.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(stored),
      Buffer.from(incoming)
    );
  } catch (err) {
    // Buffer oluşturma hatası — strings eşit değil
    return false;
  }
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
