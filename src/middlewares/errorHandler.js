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

/**
 * Global Error Handler Middleware.
 * Catches any unhandled exceptions or explicitly passed errors from the middleware chain.
 * Normalizes the error response to a standard JSON format and logs the details via the logger utility.
 * In development mode, it also attaches the stack trace to the response for easier debugging.
 * 
 * @param {Error} err - The error object passed from previous middlewares or route handlers.
 * @param {import('express').Request} req - The Express request object, which may contain contextual info like requestId.
 * @param {import('express').Response} res - The Express response object used to send the formatted error JSON.
 * @param {import('express').NextFunction} _next - The next middleware function (unused in terminal error handlers but required by Express signature).
 */
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
