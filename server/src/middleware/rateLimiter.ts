import rateLimit from 'express-rate-limit';

// Auth endpoints: 10 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again after 15 minutes.' },
});

// Login-specific: stricter - 5 per 15 minutes
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
});

// OTP verification/resend endpoints: 6 requests per 15 minutes
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP attempts. Please try again after 15 minutes.' },
});

// Forgot-password endpoint: 3 requests per 30 minutes
export const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Please try again later.' },
});

// AI endpoint: 20 requests per hour
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'AI analysis rate limit reached. Please try again later.' },
});

// General API: 100 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});
