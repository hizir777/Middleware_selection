// ═══════════════════════════════════════════════════
// CORS Handler Middleware
// ═══════════════════════════════════════════════════
// Köken (Origin) kontrolü. Cross-Origin istekleri
// yönetir. Pipeline'da Rate Limiter'dan sonra gelir.
// ═══════════════════════════════════════════════════

const cors = require('cors');
const config = require('../config');

function corsHandler() {
  return cors({
    origin: config.cors.origin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Screen-Resolution', // Fingerprinting için özel header
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // Preflight cache: 24 saat
  });
}

module.exports = corsHandler;
