import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import otpGenerator from 'otp-generator';
import crypto from 'crypto';
import { sendVerificationEmail, sendPasswordResetEmail, sendTwoFactorEmail } from '../utils/mailer';
import { authLimiter, loginLimiter, otpLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';
import { sendError } from '../utils/http';
import { sanitizeEmail } from '../utils/sanitize';
import { authMiddleware } from '../middleware/auth';
import { csrfProtection } from '../middleware/csrf';
import { lockedForMs, recordLoginFailure, clearLoginFailures } from '../utils/loginLockout';

const router = Router();

// Fail-fast: ensure JWT_SECRET is set
const JWT_SECRET = SERVER_CONFIG.jwtSecret;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set.');
  process.exit(1);
}

// Simple email validation
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// S4: Input length limits
const MAX_EMAIL_LENGTH = SERVER_CONFIG.limits.maxEmailLength;
const MAX_PASSWORD_LENGTH = SERVER_CONFIG.limits.maxPasswordLength;
const MIN_PASSWORD_LENGTH = Math.max(SERVER_CONFIG.limits.minPasswordLength, 8);

const passwordPolicy = {
  lower: /[a-z]/,
  upper: /[A-Z]/,
  digit: /\d/,
  symbol: /[^A-Za-z0-9]/,
};

const isStrongPassword = (password: string): boolean => {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH &&
    passwordPolicy.lower.test(password) &&
    passwordPolicy.upper.test(password) &&
    passwordPolicy.digit.test(password) &&
    passwordPolicy.symbol.test(password)
  );
};


// SRV-M4: per-account failed-OTP ceiling. After this many wrong codes the active
// OTP is invalidated (forcing a resend), bounding brute-force of 6-digit codes
// beyond the per-IP limiter.
const MAX_OTP_ATTEMPTS = 5;

// Every outstanding one-time code. Issuing any new code clears ALL of them along
// with the shared attempt counter. Before, forgot-password (or a login that sends
// a 2FA code) reset the counter while an older code stayed valid, buying fresh
// guesses against it.
const CLEAR_ALL_CODES = {
  verificationOtp: null,
  otpExpires: null,
  twoFactorOtp: null,
  twoFactorOtpExpires: null,
  resetToken: null,
  resetTokenExpires: null,
};

// Count one guess against the active code BEFORE checking it, and return the
// codes as they stand after that atomic update. Parallel guesses each get their
// own number (the old read-modify-write let them all read the same count), and
// each compares against the CURRENT code, not a copy read before another request
// burned or replaced it.
const countOtpGuess = (userId: string) =>
  prisma.user.update({
    where: { id: userId },
    data: { otpAttempts: { increment: 1 } },
    select: {
      otpAttempts: true,
      verificationOtp: true, otpExpires: true,
      twoFactorOtp: true, twoFactorOtpExpires: true,
      resetToken: true, resetTokenExpires: true,
    },
  });
// Burning clears the codes but NOT the counter: resetting it here let requests
// already in flight start counting from zero again. Only issuing a new code
// (which clears every old one) resets the counter.
const burnCodes = (userId: string) =>
  prisma.user.update({ where: { id: userId }, data: { ...CLEAR_ALL_CODES } });
const isLive = (hash: string | null, expires: Date | null): hash is string =>
  Boolean(hash) && (!expires || new Date() <= expires);

const newOtp = () => otpGenerator.generate(6, { upperCaseAlphabets: false, specialChars: false, lowerCaseAlphabets: false });

// The SPA's origin for redirects. FRONTEND_URL may be a comma-separated CORS
// allowlist; redirecting to the raw value produced "https://a,https://b?auth=1".
const frontendBase = (): string => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');

// SRV-L3: a fixed bcrypt hash used to equalize login timing for unknown emails.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('unused-timing-equalizer-password', 10);

const buildCookieOptions = (httpOnly: boolean) => ({
  httpOnly,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: SERVER_CONFIG.auth.cookieMaxAgeMs,
  path: '/',
});

const signSessionToken = (user: { id: string; email: string; tokenVersion?: number }): string =>
  jwt.sign(
    { id: user.id, email: user.email, tokenVersion: user.tokenVersion ?? 0 },
    JWT_SECRET,
    // jti: a per-session id, so logout can revoke just this session (S18).
    { expiresIn: '7d', jwtid: crypto.randomBytes(16).toString('hex') }
  );

const issueSessionCookies = (res: Response, token: string): string => {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie(SERVER_CONFIG.auth.cookieName, token, buildCookieOptions(true));
  res.cookie(SERVER_CONFIG.auth.csrfCookieName, csrfToken, buildCookieOptions(false));
  return csrfToken;
};

const clearSessionCookies = (res: Response): void => {
  const baseOptions = {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  };
  res.clearCookie(SERVER_CONFIG.auth.cookieName, baseOptions);
  res.clearCookie(SERVER_CONFIG.auth.csrfCookieName, baseOptions);
};

// --- 0. CSRF bootstrap (cross-origin) ---
// When the SPA is served from a different origin than the API (e.g. a Vercel
// frontend + Render backend), the browser sends the csrf cookie automatically
// with credentialed requests, but JS on the frontend origin CANNOT read that
// cookie via document.cookie to echo it in the header. This endpoint sets the
// csrf cookie AND returns its value so the client can hold it in memory and send
// it as x-csrf-token. Double-submit still holds: the auto-sent cookie must equal
// the header. GET is a safe method, so it's exempt from the CSRF check itself.
router.get('/csrf', (_req: Request, res: Response) => {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie(SERVER_CONFIG.auth.csrfCookieName, csrfToken, buildCookieOptions(false));
  return res.json({ csrfToken });
});

// --- 1. Sign Up (Register) ---
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;
    
    if (!rawEmail || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Email and password are required');
    }

    const email = sanitizeEmail(rawEmail);

    if (!isValidEmail(email) || email.length > MAX_EMAIL_LENGTH) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid email format');
    }

    if (!isStrongPassword(password)) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} chars and include uppercase, lowercase, number, and symbol`
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    
    // If user exists but is NOT verified, allow re-registration (resend OTP)
    if (existingUser && existingUser.isVerified) {
      return sendError(res, 400, 'CONFLICT', 'User with this email already exists');
    }

    const otp = otpGenerator.generate(6, { 
      upperCaseAlphabets: false, 
      specialChars: false,
      lowerCaseAlphabets: false 
    });
    const expires = new Date(Date.now() + 10 * 60 * 1000); 
    const hashedPassword = await bcrypt.hash(password, 10);
    // S3: Hash OTP before storing
    const hashedOtp = await bcrypt.hash(otp, 10);

    if (existingUser && !existingUser.isVerified) {
      // Update the existing unverified user with new password and OTP
      await prisma.user.update({
        where: { email },
        data: {
          ...CLEAR_ALL_CODES,
          password: hashedPassword,
          verificationOtp: hashedOtp,
          otpExpires: expires,
          otpAttempts: 0,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          verificationOtp: hashedOtp,
          otpExpires: expires,
          isVerified: false,
        },
      });
    }

    const emailResult = await sendVerificationEmail(email, otp);
    
    if (!emailResult.success) {
      // Only log a masked hint in non-production
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[DEV_MODE] Email send failed for ${email}. Check RESEND_API_KEY.`);
      }
    }

    res.status(201).json({ 
      message: 'Registration successful. Please check your email for the verification code.',
    });

  } catch (error) {
    console.error('Registration error:', error);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

// --- 2. Verify OTP ---
router.post('/verify-otp', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, otp, password } = req.body || {};

    if (!rawEmail || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const email = sanitizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.verificationOtp || (user.otpExpires && new Date() > user.otpExpires)) {
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }

    const fresh = await countOtpGuess(user.id);
    if (fresh.otpAttempts > MAX_OTP_ATTEMPTS) {
      await burnCodes(user.id);
      return res.status(429).json({ message: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE' });
    }
    if (!isLive(fresh.verificationOtp, fresh.otpExpires)) {
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }

    // S3: Compare against hashed OTP
    const otpValid = await bcrypt.compare(String(otp), fresh.verificationOtp);
    if (!otpValid) {
      if (fresh.otpAttempts >= MAX_OTP_ATTEMPTS) {
        // Invalidate the code so it can no longer be brute-forced.
        await burnCodes(user.id);
        return res.status(429).json({ message: 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE' });
      }
      return res.status(400).json({ message: 'INVALID_OR_EXPIRED_CODE' });
    }

    // Verification activates the password stored at registration, so it must
    // come from whoever set it. Otherwise someone could register YOUR email with
    // THEIR password; when you later verified (code from your inbox) the account
    // went live with their password. Code (your inbox) + password (theirs) now
    // can't both be supplied by one person.
    const passwordOk =
      typeof password === 'string' &&
      password.length <= MAX_PASSWORD_LENGTH &&
      (await bcrypt.compare(password, user.password));
    if (!passwordOk) {
      return res.status(400).json({
        message: "That password doesn't match this registration. If you didn't set it, register again with your own password.",
      });
    }

    await prisma.user.update({
      where: { email },
      data: { isVerified: true, verificationOtp: null, otpExpires: null, otpAttempts: 0 }
    });

    res.json({ message: "ACCOUNT_VERIFIED_SUCCESSFULLY" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// --- 3. Resend OTP ---
router.post('/resend-otp', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail } = req.body;

    if (!rawEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const email = sanitizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Don't reveal whether user exists
      return res.json({ message: 'If an account exists, a new code has been sent.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Account is already verified' });
    }

    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
    });
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    const hashedOtp = await bcrypt.hash(otp, 10);

    await prisma.user.update({
      where: { email },
      data: { ...CLEAR_ALL_CODES, verificationOtp: hashedOtp, otpExpires: expires, otpAttempts: 0 },
    });

    await sendVerificationEmail(email, otp);

    res.json({ message: 'If an account exists, a new code has been sent.' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
  }
});

// --- 4. Sign In (Login) ---
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const email = sanitizeEmail(rawEmail);

    // Lockout is per (account, IP) with a higher account-wide ceiling (see
    // utils/loginLockout); an attacker's failures no longer lock the owner out.
    const lockMs = lockedForMs(email, req.ip);
    if (lockMs > 0) {
      const remainingMin = Math.ceil(lockMs / 60000);
      await writeAuditLog({
        action: 'login',
        userId: 'unknown',
        success: false,
        route: '/api/auth/login',
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
        metadata: { email, reason: 'locked_out', remainingMin },
      });
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.` });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // SRV-L3: run a dummy hash comparison so an unknown email takes about the
      // same time as a known one, removing the user-enumeration timing oracle.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      recordLoginFailure(email, req.ip);
      await writeAuditLog({
        action: 'login',
        userId: 'unknown',
        success: false,
        route: '/api/auth/login',
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
        metadata: { email, reason: 'user_not_found' },
      });
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const justLocked = recordLoginFailure(email, req.ip);

      if (justLocked) {
        await writeAuditLog({
          action: 'login',
          userId: user.id,
          success: false,
          route: '/api/auth/login',
          ip: req.ip,
          userAgent: req.get('user-agent') || undefined,
          metadata: { email, reason: 'too_many_attempts' },
        });
        return res.status(429).json({ message: 'Too many failed attempts. Account locked for 15 minutes.' });
      }

      await writeAuditLog({
        action: 'login',
        userId: user.id,
        success: false,
        route: '/api/auth/login',
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
        metadata: { email, reason: 'invalid_password' },
      });
      
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    clearLoginFailures(email, req.ip);
    // Clear the retired account-wide lock fields if an old lock is still recorded.
    if (user.loginAttempts > 0 || user.lockUntil) {
      await prisma.user.update({ where: { email }, data: { loginAttempts: 0, lockUntil: null } });
    }

    // Checked after the password, so "verify your email" is only told to whoever
    // holds this registration's password.
    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email before logging in' });
    }

    if (user.twoFactorEnabled) {
      const loginOtp = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        specialChars: false,
        lowerCaseAlphabets: false,
      });
      const hashedLoginOtp = await bcrypt.hash(loginOtp, 10);
      const twoFactorOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { ...CLEAR_ALL_CODES, twoFactorOtp: hashedLoginOtp, twoFactorOtpExpires, otpAttempts: 0 },
      });

      await sendTwoFactorEmail(email, loginOtp);

      return res.json({
        message: 'Two-factor verification required',
        requiresTwoFactor: true,
        email,
      });
    }

    const token = signSessionToken(user);
    // Session + CSRF tokens are delivered via cookies only; never echo the JWT
    // in the response body (an XSS could otherwise exfiltrate a 7-day credential).
    issueSessionCookies(res, token);

    await writeAuditLog({
      action: 'login',
      userId: user.id,
      success: true,
      route: '/api/auth/login',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { email },
    });

    res.json({
      message: 'Login successful',
      requiresTwoFactor: false,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch (error) {
    console.error('Login error:', error);

    await writeAuditLog({
      action: 'login',
      userId: 'unknown',
      success: false,
      route: '/api/auth/login',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { reason: 'server_error' },
    });

    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/verify-login-otp', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, otp } = req.body;
    if (!rawEmail || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const email = sanitizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.twoFactorEnabled || !user.twoFactorOtp || !user.twoFactorOtpExpires) {
      return res.status(400).json({ message: 'Invalid verification attempt' });
    }

    if (new Date() > user.twoFactorOtpExpires) {
      return res.status(400).json({ message: 'Verification code expired' });
    }

    const fresh = await countOtpGuess(user.id);
    if (fresh.otpAttempts > MAX_OTP_ATTEMPTS) {
      await burnCodes(user.id);
      return res.status(429).json({ message: 'Too many attempts. Please log in again to receive a new code.' });
    }
    if (!isLive(fresh.twoFactorOtp, fresh.twoFactorOtpExpires)) {
      return res.status(400).json({ message: 'Invalid verification attempt' });
    }
    const valid = await bcrypt.compare(String(otp), fresh.twoFactorOtp);
    if (!valid) {
      if (fresh.otpAttempts >= MAX_OTP_ATTEMPTS) {
        await burnCodes(user.id);
        return res.status(429).json({ message: 'Too many attempts. Please log in again to receive a new code.' });
      }
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorOtp: null, twoFactorOtpExpires: null, loginAttempts: 0, lockUntil: null, otpAttempts: 0 },
    });

    const token = signSessionToken(user);
    issueSessionCookies(res, token);

    return res.json({
      message: 'Login successful',
      requiresTwoFactor: false,
      twoFactorEnabled: true,
    });
  } catch (error) {
    console.error('Verify login OTP error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/session', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true, twoFactorEnabled: true } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ authenticated: true, email: user.email, twoFactorEnabled: user.twoFactorEnabled });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/2fa/toggle', csrfProtection, authMiddleware, async (req: Request, res: Response) => {
  try {
    const { enabled, password } = req.body || {};

    // Require an explicit boolean so a missing/mistyped body can't be coerced
    // (undefined -> false) into silently disabling two-factor auth.
    if (typeof enabled !== 'boolean') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'enabled (boolean) is required');
    }

    // Disabling 2FA is security-sensitive: require the current password so a
    // hijacked session alone cannot weaken the account.
    if (enabled === false) {
      if (typeof password !== 'string' || !password) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Password is required to disable two-factor authentication');
      }
      const account = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { password: true },
      });
      const passwordValid = account?.password ? await bcrypt.compare(password, account.password) : false;
      if (!passwordValid) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Incorrect password');
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        twoFactorEnabled: enabled,
        twoFactorOtp: null,
        twoFactorOtpExpires: null,
      },
      select: { twoFactorEnabled: true },
    });

    return res.status(200).json({ message: `Two-factor ${updated.twoFactorEnabled ? 'enabled' : 'disabled'}`, twoFactorEnabled: updated.twoFactorEnabled });
  } catch (error) {
    console.error('2FA toggle error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Logout revokes this session's token server-side. Clearing the cookie alone left
// the token valid for up to 7 days, so a copied cookie kept working (S18).
router.post('/logout', csrfProtection, async (req: Request, res: Response) => {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SERVER_CONFIG.auth.cookieName];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true }) as any;
      if (payload?.jti && payload?.id && payload?.exp) {
        await prisma.revokedToken.upsert({
          where: { jti: String(payload.jti) },
          update: {},
          create: { jti: String(payload.jti), userId: String(payload.id), expiresAt: new Date(payload.exp * 1000) },
        });
        // Prune rows whose token would have expired anyway.
        await prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      }
    } catch {
      // Not our token, or the DB is unreachable: still clear the cookies below.
    }
  }
  clearSessionCookies(res);
  return res.status(200).json({ message: 'Logged out' });
});

// "Sign out everywhere": bumping tokenVersion invalidates every session token
// this account has been issued, on every device.
router.post('/logout-all', csrfProtection, authMiddleware, async (req: Request, res: Response) => {
  try {
    await prisma.user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } });
    clearSessionCookies(res);
    await writeAuditLog({
      action: 'logout_all',
      userId: req.user!.id,
      success: true,
      route: '/api/auth/logout-all',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    });
    return res.status(200).json({ message: 'Signed out on every device' });
  } catch (error) {
    console.error('Logout-all error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 5. Forgot Password ---
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail } = req.body;
    if (!rawEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const email = sanitizeEmail(rawEmail);
    // Always return success to prevent email enumeration
    const genericMsg = 'If an account exists with this email, a reset code has been sent.';

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isVerified) {
      return res.json({ message: genericMsg });
    }

    // Generate 6-digit reset code
    const resetCode = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
    });
    const hashedCode = await bcrypt.hash(resetCode, 10);
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { email },
      data: { ...CLEAR_ALL_CODES, resetToken: hashedCode, resetTokenExpires: expires, otpAttempts: 0 },
    });

    await sendPasswordResetEmail(email, resetCode);

    res.json({ message: genericMsg });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 6. Reset Password ---
router.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, code, newPassword } = req.body;

    if (!rawEmail || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and new password are required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} chars and include uppercase, lowercase, number, and symbol`,
      });
    }

    const email = sanitizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetToken || !user.resetTokenExpires || new Date() > user.resetTokenExpires) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const fresh = await countOtpGuess(user.id);
    if (fresh.otpAttempts > MAX_OTP_ATTEMPTS) {
      await burnCodes(user.id);
      return res.status(429).json({ message: 'Too many attempts. Please request a new reset code.' });
    }
    if (!isLive(fresh.resetToken, fresh.resetTokenExpires)) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }
    const codeValid = await bcrypt.compare(String(code), fresh.resetToken);
    if (!codeValid) {
      if (fresh.otpAttempts >= MAX_OTP_ATTEMPTS) {
        // Invalidate the reset code after too many wrong guesses (guards account takeover).
        await burnCodes(user.id);
        return res.status(429).json({ message: 'Too many attempts. Please request a new reset code.' });
      }
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        ...CLEAR_ALL_CODES,
        otpAttempts: 0,
        loginAttempts: 0,
        lockUntil: null,
        // Invalidate every previously issued session token (SRV-M2), so anyone
        // holding an old JWT (including a would-be attacker) is logged out.
        tokenVersion: { increment: 1 },
      },
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 7. Google Auth ---
// OAuth `state` (S17): a random value in a short-lived cookie, echoed by Google
// and checked on the callback, so a callback this browser didn't start (login
// CSRF: signing the victim into the attacker's account) is rejected.
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_PATH = '/api/auth/google';

router.get('/google', (req: Request, res: Response, next) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax is sent on Google's top-level redirect back to the callback.
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: OAUTH_STATE_PATH,
  });
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state })(req, res, next);
});

router.get('/google/callback',
  (req: Request, res: Response, next) => {
    const expected = (req as Request & { cookies?: Record<string, string> }).cookies?.[OAUTH_STATE_COOKIE] || '';
    const got = typeof req.query.state === 'string' ? req.query.state : '';
    res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_PATH });
    const ok = expected.length > 0 && expected.length === got.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
    if (!ok) return res.redirect(`${frontendBase()}/login?error=oauth_state`);
    next();
  },
  passport.authenticate('google', {
    failureRedirect: `${frontendBase()}/login`,
    session: false
  }),
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const frontendUrl = frontendBase();
    if (!frontendUrl) {
      return res.status(500).json({ message: 'Server misconfiguration: FRONTEND_URL not set' });
    }

    // Google proves the email address, not the second factor. Accounts with 2FA
    // get the same emailed code a password login gets, instead of a session.
    if (user.twoFactorEnabled) {
      const loginOtp = newOtp();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...CLEAR_ALL_CODES,
          twoFactorOtp: await bcrypt.hash(loginOtp, 10),
          twoFactorOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
          otpAttempts: 0,
        },
      });
      await sendTwoFactorEmail(user.email, loginOtp);
      return res.redirect(`${frontendUrl}/login?twofactor=1&email=${encodeURIComponent(user.email)}`);
    }

    const token = signSessionToken(user);
    issueSessionCookies(res, token);
    res.redirect(`${frontendUrl}?auth=1`);
  }
);

export default router;