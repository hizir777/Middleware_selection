// ═══════════════════════════════════════════════════
// Dashboard Controller — Rol Tabanlı Sayfalar
// ═══════════════════════════════════════════════════

const authService = require('../services/authService');
const { getRecentAuditLogs } = require('../services/auditService');
const HTTP = require('../constants/httpCodes');

/**
 * GET /api/dashboard
 * Minimum rol: student (herkes erişebilir)
 */
function getDashboard(req, res) {
  return res.status(HTTP.OK).json({
    success: true,
    message: `Hoş geldin, ${req.user.username}!`,
    data: {
      user: req.user,
      sections: ['Profil', 'İstatistikler', 'Son Aktiviteler'],
    },
  });
}

/**
 * GET /api/admin/panel
 * Minimum rol: admin
 */
function getAdminPanel(req, res) {
  const users = authService.getAllUsers();
  const auditLogs = getRecentAuditLogs(100);

  return res.status(HTTP.OK).json({
    success: true,
    message: 'Admin paneline hoş geldiniz',
    data: {
      totalUsers: users.length,
      users,
      recentAuditLogs: auditLogs,
    },
  });
}

/**
 * GET /api/editor/content
 * Minimum rol: editor
 */
function getEditorContent(req, res) {
  return res.status(HTTP.OK).json({
    success: true,
    message: 'Editör içerik yönetimi',
    data: {
      user: req.user,
      features: ['İçerik Oluşturma', 'İçerik Düzenleme', 'Taslaklar'],
    },
  });
}

/**
 * GET /api/audit-logs
 * Minimum rol: admin
 */
function getAuditLogs(req, res) {
  const limit = parseInt(req.query.limit, 10) || 50;
  const logs = getRecentAuditLogs(Math.min(limit, 200));

  return res.status(HTTP.OK).json({
    success: true,
    data: logs,
    total: logs.length,
  });
}

/**
 * PUT /api/admin/users/:id/role
 * Minimum rol: admin
 */
async function updateUserRole(req, res, next) {
  try {
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!role || !['admin', 'editor', 'student'].includes(role)) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: 'Geçerli bir rol belirtmelisiniz: admin, editor, student',
      });
    }

    const result = await authService.updateUserRole(userId, role, req, req.user.username);

    if (!result.success) {
      return res.status(HTTP.NOT_FOUND).json({
        success: false,
        error: 'Kullanıcı bulunamadı',
      });
    }

    return res.status(HTTP.OK).json({
      success: true,
      message: `Kullanıcı rolü ${role} olarak güncellendi`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  getAdminPanel,
  getEditorContent,
  getAuditLogs,
  updateUserRole,
};
