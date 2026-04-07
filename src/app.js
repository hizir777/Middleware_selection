// ═══════════════════════════════════════════════════
// App — Uygulama Giriş Noktası
// ═══════════════════════════════════════════════════
// Middleware Pipeline'ın "Cheap Check First" prensibi
// ile dizildiği ana dosya.
// ═══════════════════════════════════════════════════

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const { createRedisClient, closeRedis } = require('./config/redis');
const { initDatabase, closeDatabase } = require('./config/database');
const logger = require('./utils/logger');

// Middleware'ler
const rateLimiter = require('./middlewares/rateLimiter');
const corsHandler = require('./middlewares/corsHandler');
const requestLogger = require('./middlewares/logger');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// ══════════════════════════════════════════════════════════════
// MIDDLEWARE PIPELINE — "Cheap Check First" Prensibi
// ══════════════════════════════════════════════════════════════
//
// Sıralama kritiktir! Her katman bir öncekinden daha "pahalı"dır:
//
// ┌─────────────────────────────────────────────────────────┐
// │  1️⃣  Rate Limiter (Yunus Polisi)     ~0.1ms  │ Redis  │
// │      Neden en önde? Sahte/bot istekleri burada          │
// │      elenir. Auth/DB katmanlarına HİÇ ulaşmaz.         │
// │      DDoS altında sunucu CPU'su korunur.                │
// ├─────────────────────────────────────────────────────────┤
// │  2️⃣  CORS Handler                    ~0.01ms │ Bellek │
// │      Origin/method kontrolü.                            │
// ├─────────────────────────────────────────────────────────┤
// │  3️⃣  Helmet                          ~0.01ms │ Bellek │
// │      Güvenlik HTTP header'ları (XSS, Sniffing).         │
// ├─────────────────────────────────────────────────────────┤
// │  4️⃣  Body Parser                     ~0.5ms  │ CPU    │
// │      JSON parsing.                                      │
// ├─────────────────────────────────────────────────────────┤
// │  5️⃣  Request Logger (Kamera)         ~1ms    │ I/O    │
// │      Request ID atama + süre ölçümü.                    │
// ├─────────────────────────────────────────────────────────┤
// │  6️⃣  Auth Guard (Polis)              ~5-10ms │ CPU+IO │
// │      JWT crypto.verify + Redis revocation.              │
// │      ❌ Bu ÖNCE olsaydı her bot isteğinde ağır         │
// │      şifre çözme yapılırdı!                             │
// ├─────────────────────────────────────────────────────────┤
// │  7️⃣  RBAC Guard (Zabıta)             ~2ms    │ DB     │
// │      Rol kontrolü. En ağır bariyer.                     │
// ├─────────────────────────────────────────────────────────┤
// │  8️⃣  Controller (İş Mantığı)         Değişken│        │
// │      Temizlenmiş, doğrulanmış verilerle çalışır.        │
// └─────────────────────────────────────────────────────────┘
//
// ❌ YANLIŞ SIRA: Auth → RateLimit → Controller
//    Sonuç: Her sahte istekte crypto.verify çalışır → CPU tavan
//
// ✅ DOĞRU SIRA:  RateLimit → Auth → Controller
//    Sonuç: Sahte istekler 0.1ms'de elenir → CPU sakin
//
// ══════════════════════════════════════════════════════════════

// 1️⃣  Rate Limiter — "Yunus Polisi" (En ucuz kontrol)
app.use(rateLimiter());

// 2️⃣  CORS Handler — Köken kontrolü
app.use(corsHandler());

// 3️⃣  Helmet — Güvenlik header'ları
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

// 4️⃣  Body Parser — JSON ayrıştırma
app.use(express.json({ limit: '10kb' })); // Büyük payload koruması
app.use(express.urlencoded({ extended: false }));

// 5️⃣  Request Logger — Request ID + Timing
app.use(requestLogger());

// ─── Statik Dosyalar (Frontend Dashboard) ─────────
app.use(express.static(path.join(__dirname, '../public')));

// ─── Routes ──────────────────────────────────────────
const routes = require('./routes');
app.use('/api', routes);

// ─── 404 Handler ─────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'İstenen kaynak bulunamadı',
    path: req.originalUrl,
  });
});

// 8️⃣  Global Error Handler — Tüm hataları yakalar (EN SONDA)
app.use(errorHandler);

// ══════════════════════════════════════════════════════════════
// Server Startup & Graceful Shutdown
// ══════════════════════════════════════════════════════════════

/**
 * Initializes and starts the Express server.
 * Connects to Redis, initializes the SQLite database, and defines graceful shutdown handlers.
 */
async function startServer() {
  try {
    // Redis bağlantısı
    createRedisClient();

    // SQLite veritabanı başlatma (sql.js — async WASM yükleme)
    await initDatabase();

    // NOT: Production ortamında HTTPS SSL/TLS sertifika yapılandırması gereklidir.
    // Şu an Express sadece HTTP üzerinden çalışıyor, load balancer tarafında TLS yapıldı varsayılıyor.

    // HTTP sunucusu
    const server = app.listen(config.port, () => {
      logger.info('══════════════════════════════════════════════');
      logger.info(`🚀 Middleware Selection Server`);
      logger.info(`📍 http://localhost:${config.port}`);
      logger.info(`🌍 Ortam: ${config.nodeEnv}`);
      logger.info(`📊 Dashboard: http://localhost:${config.port}`);
      logger.info('══════════════════════════════════════════════');
      logger.info('Middleware Pipeline Sırası:');
      logger.info('  1. Rate Limiter (Yunus Polisi)  → Redis ~0.1ms');
      logger.info('  2. CORS Handler                 → Bellek ~0.01ms');
      logger.info('  3. Helmet                       → Bellek ~0.01ms');
      logger.info('  4. Body Parser                  → CPU ~0.5ms');
      logger.info('  5. Request Logger               → I/O ~1ms');
      logger.info('  6. Auth Guard (Polis)           → CPU+Redis ~5ms');
      logger.info('  7. RBAC Guard (Zabıta)          → DB ~2ms');
      logger.info('══════════════════════════════════════════════');
    });

    // ─── Graceful Shutdown ──────────────────────
    const shutdown = async (signal) => {
      logger.info(`\n${signal} alındı — Graceful shutdown başlatılıyor...`);

      server.close(async () => {
        await closeRedis();
        closeDatabase();
        logger.info('👋 Sunucu kapatıldı');
        process.exit(0);
      });

      // 10 saniye içinde kapanmazsa zorla kapat
      // FIXME: Zorla kapatma yerine süren işlemleri/requestleri tamamlamak (Graceful drain) için önceliklendirme yapılmalı.
      setTimeout(() => {
        logger.error('Zorla kapatma (timeout)');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err) {
    logger.error(`Sunucu başlatma hatası: ${err.message}`);
    process.exit(1);
  }
}

// ─── Modül olarak mı, doğrudan mı çalışıyor? ────
if (require.main === module) {
  startServer();
}

// Test için export
module.exports = { app, startServer };
