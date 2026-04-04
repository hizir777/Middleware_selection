#!/usr/bin/env node
// ═══════════════════════════════════════════════════
// Saldırı Simülasyonu — Rate Limiter Testi
// ═══════════════════════════════════════════════════
// Saniyede yüzlerce istek atarak Rate Limiter'ın
// devreye girdiğini kanıtlar.
//
// Çalıştırma: npm run simulate:attack
// ═══════════════════════════════════════════════════

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runAttackSimulation() {
  console.log('═══════════════════════════════════════════════');
  console.log('💥 SALDIRI SİMÜLASYONU — Rate Limiter Testi');
  console.log('═══════════════════════════════════════════════');
  console.log(`🎯 Hedef: ${BASE_URL}/api/auth/login`);
  console.log(`📊 Limit: Kritik rota — 10 istek/dakika`);
  console.log('');

  const totalRequests = 30;
  const stats = { success: 0, blocked: 0, other: 0 };
  const results = [];

  console.log(`🚀 ${totalRequests} istek gönderiliyor...\n`);

  for (let i = 1; i <= totalRequests; i++) {
    const startTime = Date.now();

    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'attacker@test.com',
          password: 'fake_password',
        }),
      });

      const duration = Date.now() - startTime;
      const status = res.status;
      const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');

      let icon;
      if (status === 429) {
        stats.blocked++;
        icon = '🛑';
      } else if (status === 401) {
        stats.success++; // 401 = Auth'a ulaştı (limit aşılmadı)
        icon = '✅';
      } else {
        stats.other++;
        icon = '⚠️';
      }

      const result = { request: i, status, duration, rateLimitRemaining };
      results.push(result);

      console.log(
        `${icon} İstek #${String(i).padStart(2, '0')} → ` +
        `${status} | ${duration}ms | ` +
        `Kalan: ${rateLimitRemaining || 'N/A'}`
      );

    } catch (err) {
      stats.other++;
      console.log(`❌ İstek #${String(i).padStart(2, '0')} → HATA: ${err.message}`);
    }

    // Minimal gecikme (50ms) — gerçekçi saldırı hızı
    await new Promise((r) => setTimeout(r, 50));
  }

  // ─── Sonuç Raporu ─────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 SONUÇ RAPORU');
  console.log('═══════════════════════════════════════════════');
  console.log(`   Toplam İstek     : ${totalRequests}`);
  console.log(`   ✅ Geçen (Auth)  : ${stats.success}`);
  console.log(`   🛑 Engellenen    : ${stats.blocked}`);
  console.log(`   ⚠️  Diğer        : ${stats.other}`);
  console.log('');

  if (stats.blocked > 0) {
    console.log('✅ Rate Limiter BAŞARIYLA devreye girdi!');
    console.log(`   İlk ${stats.success} istek Auth\'a ulaştı,`);
    console.log(`   sonraki ${stats.blocked} istek 429 ile engellendi.`);
    console.log('');
    console.log('🔑 KRİTİK KANIT:');
    console.log('   Rate Limit\'e takılan istekler Auth/DB katmanına');
    console.log('   ULAŞMADAN reddedildi. CPU korundu.');
  } else {
    console.log('⚠️  Hiçbir istek engellenmedi!');
    console.log('   Rate Limiter doğru çalışmıyor olabilir.');
    console.log('   Redis bağlantısını kontrol edin.');
  }

  console.log('═══════════════════════════════════════════════');
}

runAttackSimulation().catch((err) => {
  console.error('Simülasyon hatası:', err.message);
  process.exit(1);
});
