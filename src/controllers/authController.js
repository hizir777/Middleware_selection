// ═══════════════════════════════════════════════════
// Auth Controller — Kimlik Doğrulama Rotaları
// ═══════════════════════════════════════════════════

const authService = require('../services/authService');
const HTTP = require('../constants/httpCodes');
const MESSAGES = require('../constants/messages');

function validateRegister(username, email, password) {
  if (!username || !email || !password) {
    return { error: 'username, email ve password alanları zorunludur' };
  }
  if (username.trim().length < 3) {
    return { error: 'Kullanıcı adı en az 3 karakter olmalıdır' };
  }
  if (!email.includes('@') || !email.includes('.')) {
    return { error: 'Geçerli bir email adresi giriniz' };
  }
  if (password.length < 6) {
    return { error: 'Şifre en az 6 karakter olmalıdır' };
  }
  return { success: true };
}

/**
 * Handles new user registration.
 * Performs basic validation on the request body.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 */
async function register(req, res, next) {
  try {
    const { username, email, password, role } = req.body;

    const validation = validateRegister(username, email, password);
    if (validation.error) {
      return res.status(HTTP.BAD_REQUEST).json({
        success: false,
        error: MESSAGES.GENERAL.VALIDATION_ERROR,
        detail: validation.error,
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
 * Handles user login and session initialization.
 * Validates the presence of email and password credentials.
 * If credentials are correct, returns a JWT token for subsequent authenticated requests.
 * 
 * @param {import('express').Request} req - The Express request object containing login credentials.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 * @returns {Promise<Object>} JSON response with authentication token and user data.
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
 * Handles user logout by revoking the current active JWT token.
 * Extracts the token provided by the authGuard middleware and marks it as revoked in Redis.
 * This ensures the token cannot be reused even before its natural expiration.
 * 
 * @param {import('express').Request} req - The Express request object, must contain req.token from authGuard.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 * @returns {Promise<Object>} JSON response confirming successful logout.
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
 * Handles password change requests for currently authenticated users.
 * Requires the old password for verification and a new password adhering to length rules.
 * Automatically invalidates active sessions (revokes current token) upon successful change.
 * 
 * @param {import('express').Request} req - The Express request object containing req.user (from authGuard) and body.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 * @returns {Promise<Object>} JSON response indicating success or failure.
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
