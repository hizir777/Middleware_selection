// ═══════════════════════════════════════════════════
// Routes — API Rota Tanımları
// ═══════════════════════════════════════════════════
// Middleware zinciri burada rotalarla eşleştirilir.
// Auth ve RBAC guard'ları rota bazlı uygulanır.
// ═══════════════════════════════════════════════════

const { Router } = require('express');
const authGuard = require('../middlewares/authGuard');
const rbacGuard = require('../middlewares/rbacGuard');
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const healthController = require('../controllers/healthController');
const { ROLES } = require('../constants/roles');

const router = Router();

// ═══════════════════════════════════════════════════
// PUBLIC ROTALAR — Auth gerektirmez
// ═══════════════════════════════════════════════════

// Sağlık kontrolü
router.get('/health', healthController.getHealth);

// Kimlik doğrulama
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// ═══════════════════════════════════════════════════
// PROTECTED ROTALAR — Auth + RBAC gerektirir
// ═══════════════════════════════════════════════════

// Logout — giriş yapmış herkes
router.post('/auth/logout', authGuard(), authController.logout);

// Şifre değiştirme — giriş yapmış herkes
router.post('/auth/change-password', authGuard(), authController.changePassword);

// Dashboard — tüm roller (student+)
router.get('/dashboard', authGuard(), rbacGuard(ROLES.STUDENT), dashboardController.getDashboard);

// Editor içerik — editor ve üstü
router.get('/editor/content', authGuard(), rbacGuard(ROLES.EDITOR), dashboardController.getEditorContent);

// Admin panel — sadece admin
router.get('/admin/panel', authGuard(), rbacGuard(ROLES.ADMIN), dashboardController.getAdminPanel);

// Audit logları — sadece admin
router.get('/audit-logs', authGuard(), rbacGuard(ROLES.ADMIN), dashboardController.getAuditLogs);

// Kullanıcı rolü güncelleme — sadece admin
router.put('/admin/users/:id/role', authGuard(), rbacGuard(ROLES.ADMIN), dashboardController.updateUserRole);

module.exports = router;
