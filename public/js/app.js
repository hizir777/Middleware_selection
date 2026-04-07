// ═══════════════════════════════════════════════════
// Dashboard — Client-Side JavaScript
// ═══════════════════════════════════════════════════
//
// Bu modül, Middleware Selection uygulamasının frontend
// mantığını yönetir. Tek sayfa uygulama (SPA) mimarisi
// kullanılarak aşağıdaki işlevler sağlanır:
//
//  - Kimlik doğrulama (kayıt, giriş, çıkış, şifre değişimi)
//  - Gerçek zamanlı API test aracı
//  - Rate limiter saldırı simülasyonu
//  - Audit log görüntüleyici
//  - Sistem sağlık durumu izleme
//
// State Yönetimi:
//  Token ve kullanıcı bilgisi localStorage'da tutulur.
//  Sayfa yenilendiğinde oturum kaybolmaz.
//
// Güvenlik:
//  Tüm API isteklerinde Authorization: Bearer <token>
//  başlığı otomatik olarak eklenir.
// ═══════════════════════════════════════════════════

/** Tüm API istekleri için temel URL öneki. */
const API_BASE = '/api';

// ─── State ──────────────────────────────────────
let authToken = localStorage.getItem('mw_token') || null;
let currentUser = JSON.parse(localStorage.getItem('mw_user') || 'null');

// ─── DOM Ready ──────────────────────────────────
// DOMContentLoaded: HTML ayrıştırma tamamlandığında,
// harici kaynaklar (resim, CSS) beklenmeden tetiklenir.
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initAuth();
  initApiTest();
  initAttackSimulation();
  checkServerHealth();
  updateUserUI();

  // Her 30 saniyede sistem durumunu kontrol et
  setInterval(checkServerHealth, 30000);
});

// ═══════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════

/**
 * Kenar çubuğu navigasyon öğelerini başlatır.
 * Her nav öğesine tıklama olay dinleyicisi ekler.
 * Aktif sekmeye göre ilgili içerik bölümünü gösterir.
 */
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetSection = item.dataset.section;

      // Aktif nav'ı güncelle
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');

      // Aktif section'ı güncelle
      document.querySelectorAll('.content-section').forEach((s) => s.classList.remove('active'));
      document.getElementById(targetSection).classList.add('active');

      // Header güncelle
      updateHeader(targetSection);

      // Section'a özel veri yükle
      if (targetSection === 'audit-section') loadAuditLogs();
      if (targetSection === 'health-section') checkServerHealth();
    });
  });
}

/**
 * Sayfa başlığını ve alt başlığını aktif bölüme göre günceller.
 * @param {string} section - Aktif bölümün data-section değeri
 */
function updateHeader(section) {
  const headers = {
    'auth-section': { title: 'Kimlik Doğrulama', subtitle: 'Kayıt olun veya giriş yapın' },
    'pipeline-section': { title: 'Pipeline Görselleştirme', subtitle: 'Cheap Check First prensibi' },
    'test-section': { title: 'API Test', subtitle: 'Endpoint\'leri test edin' },
    'audit-section': { title: 'Audit Logları', subtitle: 'Güvenlik olay kayıtları' },
    'attack-section': { title: 'Saldırı Simülasyonu', subtitle: 'Rate Limiter testi' },
    'health-section': { title: 'Sistem Durumu', subtitle: 'Servis sağlık kontrolleri' },
  };

  const h = headers[section] || { title: 'Dashboard', subtitle: '' };
  document.getElementById('page-title').textContent = h.title;
  document.getElementById('page-subtitle').textContent = h.subtitle;
}

// ═══════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════

/**
 * Kimlik doğrulama formu düğmelerini başlatır.
 * Kayıt, giriş, çıkış ve şifre değiştirme işleyicilerini
 * ilgili düğmelere bağlar.
 */
function initAuth() {
  document.getElementById('btn-register').addEventListener('click', handleRegister);
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-change-password').addEventListener('click', handleChangePassword);
}

/**
 * Kullanıcı kayıt formunu işler.
 * Girdi doğrulaması yapar (uzunluk, email format),
 * doğrulama geçerse /api/auth/register endpoint'ine POST gönderir.
 * Başarılı kayıt sonrası formu temizler ve bildirim gösterir.
 * @returns {Promise<void>}
 */
async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;

  if (!username || !email || !password) {
    showNotification('Tüm alanları doldurun', 'warning');
    return;
  }

  if (username.trim().length < 3) {
    showNotification('Kullanıcı adı en az 3 karakter olmalıdır', 'warning');
    return;
  }

  if (!email.includes('@') || !email.includes('.')) {
    showNotification('Geçerli bir email adresi giriniz', 'warning');
    return;
  }

  if (password.length < 6) {
    showNotification('Şifre en az 6 karakter olmalıdır', 'warning');
    return;
  }

  try {
    const res = await apiRequest('POST', '/auth/register', { username, email, password, role });
    if (res.success) {
      showNotification(`✅ ${res.message} — Şimdi giriş yapabilirsiniz`, 'success');
      // Formu temizle
      document.getElementById('reg-username').value = '';
      document.getElementById('reg-email').value = '';
      document.getElementById('reg-password').value = '';
    } else {
      showNotification(`❌ ${res.error}`, 'error');
    }
  } catch (err) {
    showNotification(`Kayıt hatası: ${err.message}`, 'error');
  }
}

/**
 * Kullanıcı giriş formunu işler.
 * Başarılı girişte JWT token ve kullanıcı bilgisini
 * localStorage'a kaydeder, UI'ı günceller.
 * @returns {Promise<void>}
 */
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showNotification('Email ve şifre gerekli', 'warning');
    return;
  }

  try {
    const res = await apiRequest('POST', '/auth/login', { email, password });
    if (res.success) {
      authToken = res.token;
      currentUser = res.user;
      localStorage.setItem('mw_token', authToken);
      localStorage.setItem('mw_user', JSON.stringify(currentUser));
      updateUserUI();
      showNotification(`✅ Hoş geldin, ${res.user.username}!`, 'success');
      // Formu temizle
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
    } else {
      showNotification(`❌ ${res.error}`, 'error');
    }
  } catch (err) {
    showNotification(`Giriş hatası: ${err.message}`, 'error');
  }
}

/**
 * Kullanıcı oturumunu sonlandırır.
 * Sunucuya logout isteği gönderir (token sunucu tarafında iptal edilir),
 * ardından localStorage'dan token ve kullanıcı bilgisini siler.
 * @returns {Promise<void>}
 */
async function handleLogout() {
  try {
    await apiRequest('POST', '/auth/logout');
  } catch { }

  authToken = null;
  currentUser = null;
  localStorage.removeItem('mw_token');
  localStorage.removeItem('mw_user');
  updateUserUI();
  showNotification('👋 Çıkış yapıldı', 'info');
}

/**
 * Şifre değiştirme işlemini yönetir.
 * Başarılı değişimde mevcut token geçersiz kılınır ve
 * kullanıcı otomatik olarak çıkış yapılmış duruma getirilir.
 * (Sunucu tüm aktif oturumları iptal eder.)
 * @returns {Promise<void>}
 */
async function handleChangePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;

  if (!oldPassword || !newPassword) {
    showNotification('Her iki şifre alanı da zorunludur', 'warning');
    return;
  }

  try {
    const res = await apiRequest('POST', '/auth/change-password', { oldPassword, newPassword });
    if (res.success) {
      showNotification('✅ Şifre değiştirildi — Tüm oturumlar sonlandırıldı', 'success');
      // Mevcut token artık geçersiz, logout yap
      authToken = null;
      currentUser = null;
      localStorage.removeItem('mw_token');
      localStorage.removeItem('mw_user');
      updateUserUI();
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
    } else {
      showNotification(`❌ ${res.error}`, 'error');
    }
  } catch (err) {
    showNotification(`Şifre değiştirme hatası: ${err.message}`, 'error');
  }
}

/**
 * Kullanıcı arayüzünü mevcut oturum durumuna göre günceller.
 * Oturum açıksa kullanıcı adı, rolü ve avatar harfini gösterir.
 * Oturum kapalıysa misafir görünümüne döner.
 */
function updateUserUI() {
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');
  const logoutBtn = document.getElementById('btn-logout');

  if (currentUser) {
    nameEl.textContent = currentUser.username;
    roleEl.textContent = currentUser.role.toUpperCase();
    avatarEl.textContent = currentUser.username[0].toUpperCase();
    logoutBtn.style.display = 'block';
  } else {
    nameEl.textContent = 'Giriş Yapın';
    roleEl.textContent = 'Misafir';
    avatarEl.textContent = '?';
    logoutBtn.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════
// API Test
// ═══════════════════════════════════════════════════

/**
 * API test bölümünü başlatır.
 * "Gönder" düğmesine tıklama işleyicisini bağlar.
 */
function initApiTest() {
  document.getElementById('btn-test-api').addEventListener('click', handleApiTest);
}

/**
 * Seçilen method ve endpoint'e test isteği gönderir.
 * Yanıt durum kodu, süresi, Request ID ve rate limit bilgilerini
 * gerçek zamanlı olarak ekranda gösterir.
 * @returns {Promise<void>}
 */
async function handleApiTest() {
  const method = document.getElementById('test-method').value;
  const endpoint = document.getElementById('test-endpoint').value;
  const statusEl = document.getElementById('response-status');
  const metaEl = document.getElementById('response-meta');
  const bodyEl = document.getElementById('response-body');

  statusEl.textContent = '⏳ Gönderiliyor...';
  statusEl.style.background = 'var(--bg-glass)';
  statusEl.style.color = 'var(--text-muted)';

  const startTime = performance.now();

  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const res = await fetch(endpoint, { method, headers });
    const duration = (performance.now() - startTime).toFixed(1);
    const data = await res.json();

    // Status badge
    if (res.status < 300) {
      statusEl.textContent = `${res.status} ${res.statusText}`;
      statusEl.style.background = 'rgba(16, 185, 129, 0.15)';
      statusEl.style.color = 'var(--accent-green)';
    } else if (res.status < 500) {
      statusEl.textContent = `${res.status} ${res.statusText}`;
      statusEl.style.background = 'rgba(245, 158, 11, 0.15)';
      statusEl.style.color = 'var(--accent-orange)';
    } else {
      statusEl.textContent = `${res.status} ${res.statusText}`;
      statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
      statusEl.style.color = 'var(--accent-red)';
    }

    // Meta
    const requestId = res.headers.get('X-Request-ID') || '-';
    const rateRemaining = res.headers.get('X-RateLimit-Remaining') || '-';
    const rateLimit = res.headers.get('X-RateLimit-Limit') || '-';
    metaEl.innerHTML = `
      <div>⏱️ Süre: ${duration}ms | 🆔 Request ID: ${requestId}</div>
      <div>📊 Rate Limit: ${rateRemaining}/${rateLimit} kalan</div>
    `;

    bodyEl.textContent = JSON.stringify(data, null, 2);

  } catch (err) {
    statusEl.textContent = 'HATA';
    statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
    statusEl.style.color = 'var(--accent-red)';
    metaEl.textContent = '';
    bodyEl.textContent = `Bağlantı hatası: ${err.message}`;
  }
}

// ═══════════════════════════════════════════════════
// Attack Simulation
// ═══════════════════════════════════════════════════

/**
 * Saldırı simülasyonu bölümünü başlatır.
 * "Saldırıyı Başlat" düğmesine işleyici bağlar.
 */
function initAttackSimulation() {
  document.getElementById('btn-start-attack').addEventListener('click', handleAttack);
}

/**
 * Rate limiter stres testini çalıştırır.
 * Belirtilen endpoint'e art arda istek göndererek
 * kaç tanesinin başarılı geçtiğini, kaç tanesinin
 * 429 ile engellendiğini istatistiksel olarak gösterir.
 * @returns {Promise<void>}
 */
async function handleAttack() {
  const target = document.getElementById('attack-target').value;
  const count = parseInt(document.getElementById('attack-count').value, 10) || 20;
  const delay = parseInt(document.getElementById('attack-delay').value, 10) || 50;

  const btn = document.getElementById('btn-start-attack');
  btn.disabled = true;
  btn.textContent = '⏳ Saldırı devam ediyor...';

  // Reset stats
  let stats = { total: 0, success: 0, blocked: 0, other: 0 };
  document.getElementById('stat-total').textContent = '0';
  document.getElementById('stat-success').textContent = '0';
  document.getElementById('stat-blocked').textContent = '0';
  document.getElementById('stat-other').textContent = '0';
  document.getElementById('attack-log').innerHTML = '';

  const progressEl = document.getElementById('attack-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  progressEl.style.display = 'flex';
  progressFill.style.width = '0%';

  const logEl = document.getElementById('attack-log');

  for (let i = 0; i < count; i++) {
    try {
      const startTime = performance.now();
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com', password: 'test123' }),
      });
      const duration = (performance.now() - startTime).toFixed(1);

      stats.total++;

      let logClass = 'log-other';
      let status = res.status;

      if (status === 200 || status === 201) {
        stats.success++;
        logClass = 'log-success';
      } else if (status === 429) {
        stats.blocked++;
        logClass = 'log-blocked';
      } else {
        stats.other++;
      }

      // Update UI
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-success').textContent = stats.success;
      document.getElementById('stat-blocked').textContent = stats.blocked;
      document.getElementById('stat-other').textContent = stats.other;

      const pct = Math.round(((i + 1) / count) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `${pct}%`;

      const entry = document.createElement('div');
      entry.className = `log-entry ${logClass}`;
      entry.textContent = `#${i + 1} → ${status} (${duration}ms)`;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;

    } catch (err) {
      stats.total++;
      stats.other++;
      const entry = document.createElement('div');
      entry.className = 'log-entry log-other';
      entry.textContent = `#${i + 1} → HATA: ${err.message}`;
      logEl.appendChild(entry);
    }

    // Delay between requests
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  btn.disabled = false;
  btn.textContent = '🚀 Saldırıyı Başlat';

  // Sonuç bildirimi
  showNotification(
    `Simülasyon tamamlandı: ${stats.success} başarılı, ${stats.blocked} engellendi`,
    stats.blocked > 0 ? 'success' : 'warning'
  );
}

// ═══════════════════════════════════════════════════
// Audit Logs
// ═══════════════════════════════════════════════════

document.getElementById('btn-refresh-audit')?.addEventListener('click', loadAuditLogs);

/**
 * Güvenlik olay loglarını sunucudan yükler ve tabloya render eder.
 * Kimlik doğrulaması gerektirir; token yoksa uyarı gösterilir.
 * @returns {Promise<void>}
 */
async function loadAuditLogs() {
  if (!authToken) {
    document.getElementById('audit-tbody').innerHTML = `
      <tr><td colspan="5" class="empty-state">Giriş yapmalısınız</td></tr>
    `;
    return;
  }

  try {
    const res = await apiRequest('GET', '/audit-logs?limit=100');
    const tbody = document.getElementById('audit-tbody');

    if (!res.success || !res.data || res.data.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="empty-state">${res.error || 'Kayıt bulunamadı'}</td></tr>
      `;
      return;
    }

    tbody.innerHTML = res.data.map((log) => {
      const eventBadge = getEventBadge(log.action);
      return `
        <tr>
          <td>${formatDate(log.timestamp)}</td>
          <td>${log.username || '-'}</td>
          <td>${eventBadge}</td>
          <td>${log.details || '-'}</td>
          <td><code>${log.ip || '-'}</code></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    document.getElementById('audit-tbody').innerHTML = `
      <tr><td colspan="5" class="empty-state">Yükleme hatası: ${err.message}</td></tr>
    `;
  }
}

/**
 * Olay tipine göre renklendirilmiş HTML badge oluşturur.
 * Bilinmeyen olay tipleri için varsayılan gri badge döndürür.
 * @param {string} action - Audit log olay tipi (ör. 'LOGIN', 'LOGIN_FAILED')
 * @returns {string} Renkli badge HTML string'i
 */
function getEventBadge(action) {
  const badges = {
    'REGISTER': '<span class="badge badge-success">KAYIT</span>',
    'LOGIN': '<span class="badge badge-success">GİRİŞ</span>',
    'LOGOUT': '<span class="badge badge-warning">ÇIKIŞ</span>',
    'LOGIN_FAILED': '<span class="badge badge-danger">BAŞARISIZ GİRİŞ</span>',
    'PASSWORD_CHANGE': '<span class="badge badge-warning">ŞİFRE DEĞİŞİM</span>',
    'PERMISSION_DENIED': '<span class="badge badge-danger">YETKİSİZ ERİŞİM</span>',
    'SESSION_HIJACK_ATTEMPT': '<span class="badge badge-danger">OTURUM HIRSIZLIĞI</span>',
    'RATE_LIMIT_EXCEEDED': '<span class="badge badge-danger">RATE LIMIT</span>',
    'TOKEN_REVOKED_ACCESS': '<span class="badge badge-danger">İPTAL TOKEN</span>',
    'ROLE_CHANGE': '<span class="badge badge-warning">ROL DEĞİŞİM</span>',
  };
  return badges[action] || `<span class="badge">${action}</span>`;
}

// ═══════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════

/**
 * Sunucu sağlık durumunu kontrol eder ve UI'ı günceller.
 * /api/health endpoint'ini sorgular; uygulama ve Redis
 * servislerinin durumunu ayrı kartlarda gösterir.
 * Her 30 saniyede bir otomatik olarak çalışır.
 * @returns {Promise<void>}
 */
async function checkServerHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    const dot = document.getElementById('server-status-dot');
    const text = document.getElementById('server-status-text');

    if (data.data?.status === 'ok') {
      dot.className = 'status-dot healthy';
      text.textContent = 'Çevrimiçi';
    } else {
      dot.className = 'status-dot unhealthy';
      text.textContent = 'Sorunlu';
    }

    // Health cards
    updateHealthCard('health-app', data.data?.services?.app, 'Uygulama');
    updateHealthCard('health-redis', data.data?.services?.redis, 'Redis');

    // Uptime
    const uptimeEl = document.getElementById('health-uptime-status');
    const uptimeDetailEl = document.getElementById('health-uptime-detail');
    const uptimeCard = document.getElementById('health-uptime-card');
    const uptime = data.data?.uptime || 0;
    uptimeEl.textContent = formatUptime(uptime);
    uptimeDetailEl.textContent = `${Math.floor(uptime)} saniye`;
    uptimeCard.classList.add('healthy');

  } catch {
    document.getElementById('server-status-dot').className = 'status-dot unhealthy';
    document.getElementById('server-status-text').textContent = 'Çevrimdışı';
  }
}

/**
 * Tek bir sağlık servis kartını günceller.
 * @param {string} prefix - DOM element ID öneki (ör. 'health-redis')
 * @param {string} status - Servis durumu ('healthy' veya başka değer)
 * @param {string} label  - İnsan okunur servis adı
 */
function updateHealthCard(prefix, status, label) {
  const statusEl = document.getElementById(`${prefix}-status`);
  const detailEl = document.getElementById(`${prefix}-detail`);
  const card = document.getElementById(`${prefix}-card`);

  if (status === 'healthy') {
    statusEl.textContent = '✅ Sağlıklı';
    statusEl.style.color = 'var(--accent-green)';
    card.className = 'card glass-card health-card healthy';
  } else {
    statusEl.textContent = '❌ Sorunlu';
    statusEl.style.color = 'var(--accent-red)';
    card.className = 'card glass-card health-card unhealthy';
  }
  detailEl.textContent = status || 'Bilinmiyor';
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

/**
 * Merkezi API istek yardımcısı.
 * Authorization başlığını otomatik ekler, JSON döndürür.
 * @param {string} method - HTTP metodu (GET, POST, PUT, DELETE)
 * @param {string} path   - API yolu (ör. '/auth/login')
 * @param {Object|null} body - İstek gövdesi (POST/PUT için)
 * @returns {Promise<Object>} Sunucu JSON yanıtı
 */
async function apiRequest(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Screen-Resolution': `${screen.width}x${screen.height}`,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = { method, headers };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, options);
  return res.json();
}

/**
 * Ekranın sağ alt köşesinde geçici bildirim gösterir.
 * 4 saniye sonra otomatik olarak kaybolur.
 * @param {string} message - Gösterilecek mesaj metni
 * @param {'success'|'error'|'warning'|'info'} type - Bildirim tipi
 */
function showNotification(message, type = 'info') {
  const el = document.getElementById('notification');
  const iconEl = document.getElementById('notification-icon');
  const textEl = document.getElementById('notification-text');

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  iconEl.textContent = icons[type] || 'ℹ️';
  textEl.textContent = message;
  el.className = `notification ${type}`;

  // Animasyon
  requestAnimationFrame(() => {
    el.classList.add('show');
  });

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      el.className = 'notification hidden';
    }, 400);
  }, 4000);
}

/**
 * ISO 8601 tarih string'ini Türkçe yerel formata dönüştürür.
 * @param {string|null} iso - ISO 8601 tarih string'i (ör. '2024-01-15T10:30:00Z')
 * @returns {string} Yerel formatlı tarih veya '-' (null/undefined için)
 */
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Saniye cinsinden çalışma süresini okunabilir formata çevirir.
 * Örnek: 3661 → "1s 1dk 1sn"
 * @param {number} seconds - Saniye cinsinden uptime değeri
 * @returns {string} Biçimlendirilmiş süre metni
 */
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}s ${m}dk ${s}sn`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}
