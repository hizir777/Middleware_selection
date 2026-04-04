// ═══════════════════════════════════════════════════
// Hata ve Başarı Mesajları
// ═══════════════════════════════════════════════════

module.exports = {
  // ─── Auth Mesajları ──────────────────────────
  AUTH: {
    REGISTER_SUCCESS: 'Kayıt başarılı',
    LOGIN_SUCCESS: 'Giriş başarılı',
    LOGOUT_SUCCESS: 'Çıkış başarılı',
    PASSWORD_CHANGED: 'Şifre başarıyla değiştirildi',
    INVALID_CREDENTIALS: 'Geçersiz email veya şifre',
    TOKEN_REQUIRED: 'Erişim token\'ı gerekli',
    TOKEN_INVALID: 'Geçersiz veya süresi dolmuş token',
    TOKEN_REVOKED: 'Bu token iptal edilmiş',
    USER_EXISTS: 'Bu kullanıcı adı veya email zaten kayıtlı',
    SESSION_HIJACK: '⚠️ Oturum parmak izi uyuşmuyor — olası oturum hırsızlığı!',
  },

  // ─── Rate Limit Mesajları ───────────────────
  RATE_LIMIT: {
    EXCEEDED: 'Çok fazla istek gönderdiniz. Lütfen bekleyin.',
    EXCEEDED_CRITICAL: 'Kritik rota için istek sınırı aşıldı. Lütfen daha sonra deneyin.',
  },

  // ─── RBAC Mesajları ─────────────────────────
  RBAC: {
    FORBIDDEN: 'Bu kaynağa erişim yetkiniz yok',
    ROLE_REQUIRED: 'Gereken minimum rol: ',
  },

  // ─── Genel Mesajlar ─────────────────────────
  GENERAL: {
    SERVER_ERROR: 'Sunucu hatası oluştu',
    NOT_FOUND: 'İstenen kaynak bulunamadı',
    VALIDATION_ERROR: 'Doğrulama hatası',
    HEALTH_OK: 'Sistem çalışıyor',
  },
};
