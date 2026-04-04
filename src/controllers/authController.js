// ═══════════════════════════════════════════════════
// Auth Controller — Kimlik Doğrulama Rotaları
// ═══════════════════════════════════════════════════

const authService = require('../services/authService');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { username, email, password, role } = req.body;

    // Basit validasyon
    if (!username || !email || !password) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: MESSAGES.GENERAL.VALIDATION_ERROR,
        detail: 'username, email ve password alanları zorunludur',
      });
    }

    const result = await authService.register({ username, email, password, role }, req);

    if (!result.success) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: MESSAGES.AUTH.USER_EXISTS,
      });
    }

    return res.status(HTTP.CREATED).json({
      success: true,
      message: MESSAGES.AUTH.REGISTER_SUCCESS,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: MESSAGES.GENERAL.VALIDATION_ERROR,
        detail: 'email ve password alanları zorunludur',
      });
    }

    const result = await authService.login({ email, password }, req);

    if (!result.success) {
      return res.status(HTTP.UNAUTHORIZED).json({
        success: false,
        error: MESSAGES.AUTH.INVALID_CREDENTIALS,
      });
    }

    return res.status(HTTP.OK).json({
      success: true,
      message: MESSAGES.AUTH.LOGIN_SUCCESS,
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res, next) {
  try {
    const token = req.token; // authGuard'dan gelir

    await authService.logout(token, req);

    return res.status(HTTP.OK).json({
      success: true,
      message: MESSAGES.AUTH.LOGOUT_SUCCESS,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 */
async function changePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: MESSAGES.GENERAL.VALIDATION_ERROR,
        detail: 'oldPassword ve newPassword alanları zorunludur',
      });
    }

    if (newPassword.length < 6) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: MESSAGES.GENERAL.VALIDATION_ERROR,
        detail: 'Yeni şifre en az 6 karakter olmalıdır',
      });
    }

    const result = await authService.changePassword({
      userId: req.user.id,
      oldPassword,
      newPassword,
    }, req);

    if (!result.success) {
      const errorMap = {
        USER_NOT_FOUND: 'Kullanıcı bulunamadı',
        INVALID_OLD_PASSWORD: 'Mevcut şifre hatalı',
      };

      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: errorMap[result.error] || result.error,
      });
    }

    return res.status(HTTP.OK).json({
      success: true,
      message: MESSAGES.AUTH.PASSWORD_CHANGED,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, changePassword };
