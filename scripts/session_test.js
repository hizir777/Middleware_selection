#!/usr/bin/env node
// ═══════════════════════════════════════════════════
// Oturum İptali Testi — Token Revocation
// ═══════════════════════════════════════════════════
// Senaryo:
// 1. Kullanıcı register olur
// 2. Login yapar, token alır
// 3. Token ile korumalı endpoint'e erişir (başarılı)
// 4. Şifresini değiştirir → tüm tokenlar iptal edilir
// 5. ESKİ token ile tekrar dener → 401 Unauthorized
//
// Çalıştırma: npm run simulate:session
// ═══════════════════════════════════════════════════

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function apiRequest(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();
  return { status: res.status, data };
}

async function runSessionTest() {
  console.log('═══════════════════════════════════════════════');
  console.log('🔐 OTURUM İPTALİ TESTİ — Token Revocation');
  console.log('═══════════════════════════════════════════════\n');

  const testUser = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123',
    newPassword: 'NewPassword456',
  };

  // ─── Adım 1: Register ─────────────────────────
  console.log('📝 Adım 1: Kullanıcı kaydı...');
  const regResult = await apiRequest('POST', '/api/auth/register', {
    username: testUser.username,
    email: testUser.email,
    password: testUser.password,
    role: 'student',
  });
  console.log(`   Sonuç: ${regResult.status} — ${regResult.data.message || regResult.data.error}`);

  if (regResult.status !== 201) {
    console.error('❌ Kayıt başarısız, test durduruluyor.');
    process.exit(1);
  }

  // ─── Adım 2: Login ────────────────────────────
  console.log('\n🔑 Adım 2: Giriş yapılıyor...');
  const loginResult = await apiRequest('POST', '/api/auth/login', {
    email: testUser.email,
    password: testUser.password,
  });
  console.log(`   Sonuç: ${loginResult.status} — ${loginResult.data.message || loginResult.data.error}`);

  if (!loginResult.data.token) {
    console.error('❌ Token alınamadı, test durduruluyor.');
    process.exit(1);
  }

  const oldToken = loginResult.data.token;
  console.log(`   Token: ${oldToken.substring(0, 30)}...`);

  // ─── Adım 3: Korumalı endpoint erişimi ────────
  console.log('\n🛡️ Adım 3: ESKİ token ile dashboard erişimi...');
  const dashResult = await apiRequest('GET', '/api/dashboard', null, oldToken);
  console.log(`   Sonuç: ${dashResult.status} — ${dashResult.data.message || dashResult.data.error}`);

  if (dashResult.status !== 200) {
    console.error('❌ Dashboard erişimi başarısız olmamalıydı!');
    process.exit(1);
  }
  console.log('   ✅ Token geçerli, erişim sağlandı.');

  // ─── Adım 4: Şifre değiştirme ─────────────────
  console.log('\n🔄 Adım 4: Şifre değiştiriliyor...');
  const pwResult = await apiRequest('POST', '/api/auth/change-password', {
    oldPassword: testUser.password,
    newPassword: testUser.newPassword,
  }, oldToken);
  console.log(`   Sonuç: ${pwResult.status} — ${pwResult.data.message || pwResult.data.error}`);

  if (pwResult.status !== 200) {
    console.error('❌ Şifre değiştirme başarısız!');
  } else {
    console.log('   ✅ Şifre değiştirildi, tüm tokenlar iptal edildi.');
  }

  // ─── Adım 5: ESKİ token ile tekrar dene ───────
  console.log('\n⚠️ Adım 5: ESKİ token ile dashboard erişimi (iptal edilmiş olmalı)...');

  // Kısa bir bekleme (Redis'e yazılma süresi)
  await new Promise((r) => setTimeout(r, 500));

  const revokedResult = await apiRequest('GET', '/api/dashboard', null, oldToken);
  console.log(`   Sonuç: ${revokedResult.status} — ${revokedResult.data.error || revokedResult.data.message}`);

  if (revokedResult.status === 401) {
    console.log('   ✅ BAŞARILI: Eski token reddedildi (401 Unauthorized)');
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('✅ TEST BAŞARILI');
    console.log('   Şifre değişikliğinden sonra eski token');
    console.log('   Redis\'ten temizlendi ve erişim engellendi.');
    console.log('═══════════════════════════════════════════════');
  } else {
    console.log('   ❌ BAŞARISIZ: Eski token hala çalışıyor!');
    console.log('   Token Revocation mekanizması sorunlu.');
    console.log('═══════════════════════════════════════════════');
    process.exit(1);
  }
}

runSessionTest().catch((err) => {
  console.error('Test hatası:', err.message);
  process.exit(1);
});
