// ═══════════════════════════════════════════════════
// Redis — Bellek İçi Veri Katmanı + Fallback
// ═══════════════════════════════════════════════════
// Rate Limiter sayaçları ve Token Revocation verisi
// burada tutulur. ~0.1ms erişim hızı sağlar.
//
// Redis bağlantısı başarısız olursa, in-memory Map
// tabanlı bir fallback devreye girer. Bu sayede
// geliştirme ortamında Docker/Redis olmadan da
// çalışılabilir.
// ═══════════════════════════════════════════════════

const config = require('./index');
const logger = require('../utils/logger');

let redis = null;
let usingFallback = false;

// ═══════════════════════════════════════════════════
// In-Memory Fallback — Redis yokken kullanılır
// ═══════════════════════════════════════════════════

class InMemoryStore {
  constructor() {
    this.store = new Map();
    this.expiries = new Map();
    this.sets = new Map();

    // Süresi dolan keyler için temizlik (her 10 saniye)
    this._cleanupInterval = setInterval(() => this._cleanup(), 10000);
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, expiry] of this.expiries) {
      if (expiry <= now) {
        this.store.delete(key);
        this.expiries.delete(key);
        this.sets.delete(key);
      }
    }
  }

  async get(key) {
    if (this.expiries.has(key) && this.expiries.get(key) <= Date.now()) {
      this.store.delete(key);
      this.expiries.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, ...args) {
    this.store.set(key, value);
    // Handle EX (seconds) TTL argument
    const exIdx = args.indexOf('EX');
    if (exIdx !== -1 && args[exIdx + 1]) {
      const ttlSeconds = parseInt(args[exIdx + 1], 10);
      this.expiries.set(key, Date.now() + ttlSeconds * 1000);
    }
    return 'OK';
  }

  async incr(key) {
    let val = parseInt(this.store.get(key), 10) || 0;
    val++;
    this.store.set(key, String(val));
    return val;
  }

  async expire(key, seconds) {
    if (this.store.has(key)) {
      this.expiries.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }

  async ttl(key) {
    if (!this.expiries.has(key)) return -1;
    const remaining = Math.ceil((this.expiries.get(key) - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async del(key) {
    this.store.delete(key);
    this.expiries.delete(key);
    this.sets.delete(key);
    return 1;
  }

  async sadd(key, ...members) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const set = this.sets.get(key);
    members.forEach((m) => set.add(m));
    return members.length;
  }

  async smembers(key) {
    const set = this.sets.get(key);
    return set ? [...set] : [];
  }

  async ping() {
    return 'PONG';
  }

  async quit() {
    clearInterval(this._cleanupInterval);
  }

  on() {} // Uyumluluk — ioredis event listener
}

// ═══════════════════════════════════════════════════
// Redis Client oluşturma
// ═══════════════════════════════════════════════════

function createRedisClient() {
  if (redis) return redis;

  try {
    const Redis = require('ioredis');

    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          // 3 denemeden sonra fallback'e geç
          logger.warn('[Redis] Bağlantı kurulamadı — In-Memory fallback devreye giriyor');
          switchToFallback();
          return null; // Yeniden denemeyi durdur
        }
        return Math.min(times * 200, 2000);
      },
      connectTimeout: 3000,
      lazyConnect: false,
    });

    client.on('connect', () => {
      logger.info('[Redis] ✅ Bağlantı başarılı');
      usingFallback = false;
    });

    client.on('error', (err) => {
      if (!usingFallback) {
        logger.warn(`[Redis] Bağlantı hatası: ${err.message}`);
      }
    });

    redis = client;

    // 5 saniye içinde bağlanamazsa fallback'e geç
    setTimeout(() => {
      if (client.status !== 'ready' && !usingFallback) {
        logger.warn('[Redis] 5s içinde bağlanılamadı — In-Memory fallback devreye giriyor');
        switchToFallback();
      }
    }, 5000);

    return redis;
  } catch (err) {
    logger.warn(`[Redis] ioredis yüklenemedi — In-Memory fallback: ${err.message}`);
    return switchToFallback();
  }
}

function switchToFallback() {
  if (usingFallback) return redis;

  // Eski bağlantıyı kapat (hata log spam'ini durdur)
  if (redis && redis.disconnect) {
    try { redis.disconnect(); } catch {}
  }

  usingFallback = true;
  redis = new InMemoryStore();
  logger.info('[Redis] 🔄 In-Memory fallback aktif (Geliştirme modu)');
  return redis;
}

/**
 * Aktif Redis/Fallback client'ı döner.
 */
function getRedis() {
  if (!redis) {
    return createRedisClient();
  }
  return redis;
}

/**
 * Redis bağlantısını kapatır.
 */
async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('[Redis] Bağlantı kapatıldı (graceful)');
  }
}

function isUsingFallback() {
  return usingFallback;
}

module.exports = { createRedisClient, getRedis, closeRedis, isUsingFallback };
