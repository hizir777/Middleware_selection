// ═══════════════════════════════════════════════════
// Winston Logger — Yapılandırılmış Loglama
// ═══════════════════════════════════════════════════
// Console (renkli) + Dosya (JSON) çift katmanlı log.
// ═══════════════════════════════════════════════════

const winston = require('winston');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../logs');

// ─── Özel Format: Zaman + Seviye + Mesaj ─────────
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${stack ? `\n${stack}` : ''}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  transports: [
    // ─── Konsol (Geliştirme) ──────────────────
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),

    // ─── Dosya: Tüm loglar ───────────────────
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
    }),

    // ─── Dosya: Sadece hatalar ────────────────
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
