// ═══════════════════════════════════════════════════
// Telegram Bot — Anlık Bildirim Sistemi
// ═══════════════════════════════════════════════════
// Kritik güvenlik olaylarında yöneticiye anlık
// Telegram mesajı gönderir.
// ═══════════════════════════════════════════════════

const config = require('../config');
const logger = require('./logger');

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Telegram üzerinden mesaj gönderir.
 * @param {string} message - Gönderilecek mesaj (Markdown destekli)
 */
async function sendTelegramAlert(message) {
  if (!config.telegram.enabled) {
    logger.debug('[Telegram] Bot yapılandırılmamış, mesaj gönderilmedi');
    return;
  }

  const url = `${TELEGRAM_API}${config.telegram.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error(`[Telegram] API hatası: ${response.status} - ${errorData}`);
    } else {
      logger.info('[Telegram] ✅ Bildirim gönderildi');
    }
  } catch (err) {
    // Telegram hatası uygulamayı durdurmamalı
    logger.error(`[Telegram] Gönderim hatası: ${err.message}`);
  }
}

/**
 * Güvenlik uyarısı formatında mesaj oluşturur.
 */
function formatSecurityAlert({ event, username, ip, details, requestId }) {
  const timestamp = new Date().toISOString();
  return [
    '🚨 *GÜVENLİK UYARISI*',
    '',
    `📋 *Olay:* ${event}`,
    `👤 *Kullanıcı:* ${username || 'Bilinmiyor'}`,
    `🌐 *IP:* \`${ip || 'N/A'}\``,
    `📝 *Detay:* ${details || '-'}`,
    `🆔 *Request ID:* \`${requestId || 'N/A'}\``,
    `⏱️ *Zaman:* ${timestamp}`,
  ].join('\n');
}

/**
 * Audit log formatında bilgilendirme mesajı.
 */
function formatAuditAlert({ event, username, ip, details }) {
  const timestamp = new Date().toISOString();
  return [
    '📋 *AUDIT LOG*',
    '',
    `📌 *Olay:* ${event}`,
    `👤 *Kullanıcı:* ${username || 'Bilinmiyor'}`,
    `🌐 *IP:* \`${ip || 'N/A'}\``,
    `📝 *Detay:* ${details || '-'}`,
    `⏱️ *Zaman:* ${timestamp}`,
  ].join('\n');
}

module.exports = {
  sendTelegramAlert,
  formatSecurityAlert,
  formatAuditAlert,
};
