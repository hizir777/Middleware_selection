// ═══════════════════════════════════════════════════
// Request Logger Middleware — Gözetleme Kamerası
// ═══════════════════════════════════════════════════
// Her isteğe benzersiz Request ID atar ve işlem
// süresini (ms) ölçer. Winston ile loglar.
//
// ⚡ Maliyet: Düşük (~1ms)
// 🎯 Amaç:   Gözlemlenebilirlik (Observability)
// ═══════════════════════════════════════════════════

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

function requestLogger() {
  return (req, res, next) => {
    // ─── Request ID ataması ────────────────────
    const requestId = req.headers['x-request-id'] || uuidv4();
    req.requestId = requestId;
    res.set('X-Request-ID', requestId);

    // ─── Zamanlama başlat ──────────────────────
    const startTime = process.hrtime.bigint();
    req.startTime = startTime;

    // ─── Response bittiğinde log yaz ───────────
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;

      const logData = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: durationMs.toFixed(2),
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '-',
      };

      // Durum koduna göre log seviyesi seç
      if (res.statusCode >= 500) {
        logger.error(`[Request] ${logData.method} ${logData.path} — ${logData.statusCode} (${logData.durationMs}ms)`, logData);
      } else if (res.statusCode >= 400) {
        logger.warn(`[Request] ${logData.method} ${logData.path} — ${logData.statusCode} (${logData.durationMs}ms)`, logData);
      } else {
        logger.info(`[Request] ${logData.method} ${logData.path} — ${logData.statusCode} (${logData.durationMs}ms)`, logData);
      }
    });

    next();
  };
}

module.exports = requestLogger;
