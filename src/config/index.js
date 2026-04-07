// ═══════════════════════════════════════════════════
// Config — Merkezi Konfigürasyon Yönetimi
// ═══════════════════════════════════════════════════
//
// Tüm ortam değişkenleri buradan okunur, tip dönüşümü
// yapılır ve varsayılan değerler atanır.
//
// Konfigürasyon Kategorileri:
//   Sunucu  : PORT, NODE_ENV
//   Auth    : JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_ROUNDS
//   Redis   : REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
//   Database: DB_PATH (SQLite dosya yolu)
//   Telegram: BOT_TOKEN, CHAT_ID (opsiyonel)
// ═══════════════════════════════════════════════════

const dotenv = require('dotenv');
const path = require('path');

// .env dosyasını yükle (proje kök dizininden).
// Dosya yoksa hata vermez; process.env değerleri kullanılır.
// CI/CD ortamında değerler doğrudan ortam değişkeni olarak enjekte edilir.
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
