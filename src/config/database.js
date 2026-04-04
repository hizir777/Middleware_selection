// ═══════════════════════════════════════════════════
// Database — SQLite Kalıcı Veri Katmanı (sql.js)
// ═══════════════════════════════════════════════════
// Kullanıcı ve Audit Log verileri burada saklanır.
// sql.js (WebAssembly tabanlı) — native derleme gerektirmez.
// ═══════════════════════════════════════════════════

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DB_PATH = path.resolve(__dirname, '../../middleware.db');

let db = null;
let sqlJs = null;

/**
 * Veritabanını başlatır ve tabloları oluşturur.
 */
async function initDatabase() {
  if (db) return db;

  sqlJs = await initSqlJs();

  // Mevcut DB dosyası varsa yükle, yoksa yeni oluştur
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new sqlJs.Database(fileBuffer);
      logger.info('[Database] ✅ Mevcut SQLite veritabanı yüklendi');
    } else {
      db = new sqlJs.Database();
      logger.info('[Database] ✅ Yeni SQLite veritabanı oluşturuldu');
    }
  } catch (err) {
    db = new sqlJs.Database();
    logger.warn(`[Database] Yeni DB oluşturuldu (mevcut okunamadı): ${err.message}`);
  }

  // ─── Users Tablosu ─────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'student',
      fingerprint   TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ─── Audit Logs Tablosu ────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      action     TEXT    NOT NULL,
      details    TEXT,
      ip         TEXT,
      user_agent TEXT,
      request_id TEXT,
      timestamp  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // ─── İndeksler (Performans) ────────────────────
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);`);

  // Diske kaydet
  saveDatabase();

  logger.info('[Database] ✅ Tablolar ve indeksler hazır');
  return db;
}

/**
 * Veritabanını diske kaydeder.
 */
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    logger.error(`[Database] Diske kaydetme hatası: ${err.message}`);
  }
}

/**
 * Aktif veritabanı bağlantısını döner.
 */
function getDb() {
  if (!db) {
    throw new Error('Database henüz başlatılmadı. initDatabase() çağrılmalı.');
  }
  return db;
}

/**
 * sql.js için yardımcı: SELECT sorgusu — tüm satırlar
 */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * sql.js için yardımcı: SELECT sorgusu — tek satır
 */
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * sql.js için yardımcı: INSERT/UPDATE/DELETE çalıştırma
 */
function execute(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  // lastInsertRowid benzeri — sql.js farklı çalışıyor
  const result = queryOne('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: result ? result.id : 0 };
}

/**
 * Veritabanını kapatır (Graceful Shutdown).
 */
function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    logger.info('[Database] Bağlantı kapatıldı (graceful)');
  }
}

module.exports = { initDatabase, getDb, closeDatabase, queryAll, queryOne, execute, saveDatabase };
