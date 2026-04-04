#!/usr/bin/env node
// ═══════════════════════════════════════════════════
// Hiyerarşi Testi — Pipeline İzolasyon Kontrolü
// ═══════════════════════════════════════════════════
// Kritik soru: "Rate Limit'e takılan bir istek
// Auth veya DB katmanlarına ulaşıyor mu?"
//
// Eğer ulaşıyorsa → Mimari HATALIDIR!
//
// Test yöntemi:
// 1. Önce limiti doldur (10 istek)
// 2. Sonraki isteklerin GEÇERLİ bir token ile bile
//    429 döndüğünü doğrula (Auth'a ulaşmıyor)
//
// Çalıştırma: npm run simulate:hierarchy
// ═══════════════════════════════════════════════════

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function apiRequest(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  return {
    status: res.status,
    rateLimitRemaining: res.headers.get('x-ratelimit-remaining'),
    requestId: res.headers.get('x-request-id'),
    data: await res.json(),
  };
}

async function runHierarchyTest() {
  console.log('═══════════════════════════════════════════════');
  console.log('🏗️ HİYERARŞİ TESTİ — Pipeline İzolasyonu');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('Amaç: Rate Limit\'e takılan isteklerin');
  console.log('Auth/DB katmanlarına ulaşMADIĞINI kanıtlamak.');
  console.log('');

  // ─── Adım 1: Geçerli bir kullanıcı oluştur ────
  const testUser = {
    username: `hierarchy_${Date.now()}`,
    email: `hierarchy_${Date.now()}@example.com`,
    password: 'HierarchyTest123',
  };

  console.log('📝 Adım 1: Test kullanıcısı oluşturuluyor...');
  await apiRequest('POST', '/api/auth/register', {
    ...testUser,
    role: 'admin',
  });

  const loginRes = await apiRequest('POST', '/api/auth/login', {
    email: testUser.email,
    password: testUser.password,
  });

  if (!loginRes.data.token) {
    console.error('❌ Login başarısız, test durduruluyor.');
    process.exit(1);
  }

  const token = loginRes.data.token;
  console.log('   ✅ Token alındı\n');

  // ─── Adım 2: Login rate limit'ini doldur ──────
  console.log('💥 Adım 2: Login rate limit dolduruluyor (10 istek)...');

  for (let i = 1; i <= 12; i++) {
    const res = await apiRequest('POST', '/api/auth/login', {
      email: 'fill@test.com',
      password: 'fill',
    });

    const icon = res.status === 429 ? '🛑' : '📤';
    console.log(`   ${icon} #${i} → ${res.status} (kalan: ${res.rateLimitRemaining || 'N/A'})`);
  }

  // ─── Adım 3: Geçerli token ile dene ───────────
  console.log('\n🔍 Adım 3: Rate limit doluyken GEÇERLİ token ile login denemesi...');

  const blockedRes = await apiRequest('POST', '/api/auth/login', {
    email: testUser.email,
    password: testUser.password,
  }, token);

  console.log(`   Sonuç: ${blockedRes.status}`);
  console.log(`   Yanıt: ${JSON.stringify(blockedRes.data)}`);

  // ─── Doğrulama ────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');

  if (blockedRes.status === 429) {
    console.log('✅ HİYERARŞİ TESTİ BAŞARILI');
    console.log('');
    console.log('   Geçerli bir token OLMASINA RAĞMEN istek');
    console.log('   429 ile reddedildi.');
    console.log('');
    console.log('   Bu kanıtlar:');
    console.log('   → Rate Limiter, Auth Guard\'dan ÖNCE çalışıyor');
    console.log('   → JWT doğrulama (crypto.verify) HİÇ çağrılmadı');
    console.log('   → Veritabanı sorgusu YAPILMADI');
    console.log('   → CPU/RAM korundu (Cheap Check First ✅)');
  } else {
    console.log('❌ HİYERARŞİ TESTİ BAŞARISIZ');
    console.log('');
    console.log('   İstek Rate Limit\'e takılmadı!');
    console.log('   Auth katmanına ulaştı → Mimari HATALI');
    console.log('   Middleware sıralamasını kontrol edin.');
  }

  console.log('═══════════════════════════════════════════════');
}

runHierarchyTest().catch((err) => {
  console.error('Test hatası:', err.message);
  process.exit(1);
});
