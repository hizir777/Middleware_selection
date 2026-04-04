// ═══════════════════════════════════════════════════
// Config — Merkezi Konfigürasyon Yönetimi
// ═══════════════════════════════════════════════════
// Tüm çevre değişkenleri buradan okunur ve export edilir.
// .env dosyası yoksa varsayılan değerler kullanılır.
// ═══════════════════════════════════════════════════

const dotenv = require('dotenv');
const path = require('path');

// .env dosyasını yükle (proje kök dizininden)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  // ─── Sunucu ──────────────────────────────────
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // ─── JWT ─────────────────────────────────────
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_fallback_secret_NOT_FOR_PRODUCTION',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },

  // ─── Redis ───────────────────────────────────
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // ─── Rate Limiting ──────────────────────────
  rateLimit: {
    critical: parseInt(process.env.RATE_LIMIT_CRITICAL, 10) || 10,   // /login, /register
    general: parseInt(process.env.RATE_LIMIT_GENERAL, 10) || 2000,   // Diğer rotalar
    windowMs: 60 * 1000, // 1 dakika (sliding window)
  },

  // ─── Telegram ────────────────────────────────
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    get enabled() {
      return !!(this.botToken && this.chatId &&
        this.botToken !== 'YOUR_BOT_TOKEN_HERE' &&
        this.chatId !== 'YOUR_CHAT_ID_HERE');
    },
  },

  // ─── CORS ────────────────────────────────────
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};

module.exports = config;
