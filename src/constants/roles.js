// ═══════════════════════════════════════════════════
// Roller ve Yetki Hiyerarşisi
// ═══════════════════════════════════════════════════
// Hiyerarşi: ADMIN > EDITOR > STUDENT
// Daha yüksek seviye, alt seviyelerin yetkilerini kapsar.
// ═══════════════════════════════════════════════════

const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  STUDENT: 'student',
};

// Yetki seviyesi — sayı ne kadar yüksekse yetki o kadar geniş
const ROLE_HIERARCHY = {
  [ROLES.STUDENT]: 1,
  [ROLES.EDITOR]: 2,
  [ROLES.ADMIN]: 3,
};

/**
 * Kullanıcının rolü, gereken minimum rolü karşılıyor mu?
 * @param {string} userRole    - Kullanıcının mevcut rolü
 * @param {string} requiredRole - Rota için gereken minimum rol
 * @returns {boolean}
 */
function hasPermission(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 999;
  return userLevel >= requiredLevel;
}

module.exports = { ROLES, ROLE_HIERARCHY, hasPermission };
