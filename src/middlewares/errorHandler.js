// ═══════════════════════════════════════════════════
// Global Error Handler Middleware
// ═══════════════════════════════════════════════════
// Middleware zincirinin herhangi bir noktasında
// oluşan hatayı yakalar, standart JSON formatında
// döner ve arka planda detaylıca loglar.
// ═══════════════════════════════════════════════════

const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');
const logger = require('../utils/logger');
const config = require('../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Durum kodu (hata nesnesi taşıyorsa onu kullan)
  const statusCode = err.statusCode || err.status || HTTP.INTERNAL_SERVER_ERROR;

  // Hata mesajı
  const message = err.message || MESSAGES.GENERAL.SERVER_ERROR;

  // Detaylı hata logu
  logger.error(`[ErrorHandler] ${statusCode} — ${message}`, {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    stack: err.stack,
  });

  // İstemciye dönen yanıt
  const response = {
    success: false,
    error: message,
    requestId: req.requestId,
  };

  // Stack trace sadece development modda gösterilir
  if (config.isDev && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
