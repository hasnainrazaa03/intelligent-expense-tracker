import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import otpGenerator from 'otp-generator';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer';
import { authLimiter, loginLimiter, otpLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { writeAuditLog } from '../utils/audit';
import { SERVER_CONFIG } from '../config';
import { sendError } from '../utils/http';

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

// S5: Account lockout constants
const MAX_LOGIN_ATTEMPTS = SERVER_CONFIG.auth.maxLoginAttempts;
const LOCKOUT_DURATION_MS = SERVER_CONFIG.auth.lockoutDurationMs;

// --- 1. Sign Up (Register) ---
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;
    
    if (!rawEmail || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Email and password are required');
    }

    const email = rawEmail.toLowerCase().trim();

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
          password: hashedPassword,
          verificationOtp: hashedOtp,
          otpExpires: expires,
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
    const { email: rawEmail, otp } = req.body;
    
    if (!rawEmail || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const email = rawEmail.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.verificationOtp || (user.otpExpires && new Date() > user.otpExpires)) {
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }

    // S3: Compare against hashed OTP
    const otpValid = await bcrypt.compare(otp, user.verificationOtp);
    if (!otpValid) {
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }

    await prisma.user.update({
      where: { email },
      data: { isVerified: true, verificationOtp: null, otpExpires: null }
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

    const email = rawEmail.toLowerCase().trim();
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
      data: { verificationOtp: hashedOtp, otpExpires: expires },
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

    const email = rawEmail.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
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

    // S5: Check account lockout
    if (user.lockUntil && new Date() < user.lockUntil) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      await writeAuditLog({
        action: 'login',
        userId: user.id,
        success: false,
        route: '/api/auth/login',
        ip: req.ip,
        userAgent: req.get('user-agent') || undefined,
        metadata: { email, reason: 'account_locked', remainingMin },
      });
      return res.status(429).json({ message: `Account locked. Try again in ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.` });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email before logging in' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // S5: Increment login attempts
      const attempts = (user.loginAttempts || 0) + 1;
      const updateData: any = { loginAttempts: attempts };
      
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        updateData.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        updateData.loginAttempts = 0;
      }
      
      await prisma.user.update({ where: { email }, data: updateData });
      
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
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

    // S5: Reset login attempts on successful login
    if (user.loginAttempts > 0 || user.lockUntil) {
      await prisma.user.update({ where: { email }, data: { loginAttempts: 0, lockUntil: null } });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await writeAuditLog({
      action: 'login',
      userId: user.id,
      success: true,
      route: '/api/auth/login',
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      metadata: { email },
    });

    res.json({ message: 'Login successful', token });
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

// --- 5. Forgot Password ---
router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail } = req.body;
    if (!rawEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const email = rawEmail.toLowerCase().trim();
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
      data: { resetToken: hashedCode, resetTokenExpires: expires },
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

    const email = rawEmail.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetToken || !user.resetTokenExpires || new Date() > user.resetTokenExpires) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const codeValid = await bcrypt.compare(code, user.resetToken);
    if (!codeValid) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        loginAttempts: 0,
        lockUntil: null,
      },
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 7. Google Auth ---
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  })
);

router.get('/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
    session: false 
  }),
  (req: Request, res: Response) => {
    const user = req.user as any; 
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      return res.status(500).json({ message: 'Server misconfiguration: FRONTEND_URL not set' });
    }
    
    // Put token in URL fragment so it is not sent in referrer/query logs.
    res.redirect(`${frontendUrl}#token=${token}`);
  }
);

export default router;