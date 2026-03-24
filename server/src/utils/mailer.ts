import { Resend } from 'resend';

// Helper to get the key safely
const getResendKey = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("⚠️ WARNING: RESEND_API_KEY is missing from environment variables.");
  }
  return key || ""; 
};

export const resend = new Resend(getResendKey());

export const sendVerificationEmail = async (email: string, otp: string) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Cannot send email: RESEND_API_KEY is undefined.");
    }

    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
      throw new Error("Cannot send email: EMAIL_FROM is undefined.");
    }

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Your Verification Code',
      html: `
        <div style="font-family: monospace; max-width: 400px; margin: 0 auto; border: 3px solid #111; padding: 32px;">
          <h2 style="color: #990000; margin-top: 0;">Verification Code</h2>
          <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; background: #f5f0e8; padding: 16px; border: 2px solid #111;">${otp}</p>
          <p style="color: #666; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
        </div>
      `,
      text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
    });

    if (error) return { success: false, error };
    return { success: true, data };
  } catch (err) {
    console.error("Resend internal error:", err);
    return { success: false, error: err };
  }
};

export const sendPasswordResetEmail = async (email: string, resetCode: string) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Cannot send email: RESEND_API_KEY is undefined.");
    }

    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
      throw new Error("Cannot send email: EMAIL_FROM is undefined.");
    }

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Password Reset Code',
      html: `
        <div style="font-family: monospace; max-width: 400px; margin: 0 auto; border: 3px solid #111; padding: 32px;">
          <h2 style="color: #990000; margin-top: 0;">Password Reset</h2>
          <p>Use this code to reset your password:</p>
          <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; background: #f5f0e8; padding: 16px; border: 2px solid #111;">${resetCode}</p>
          <p style="color: #666; font-size: 12px;">This code expires in 15 minutes. If you didn't request this, please ignore this email.</p>
        </div>
      `,
      text: `Your password reset code is: ${resetCode}. It expires in 15 minutes.`,
    });

    if (error) return { success: false, error };
    return { success: true, data };
  } catch (err) {
    console.error("Resend internal error:", err);
    return { success: false, error: err };
  }
};

export const sendTwoFactorEmail = async (email: string, code: string) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Cannot send email: RESEND_API_KEY is undefined.');
    }

    const emailFrom = process.env.EMAIL_FROM;
    if (!emailFrom) {
      throw new Error('Cannot send email: EMAIL_FROM is undefined.');
    }

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Your Login Verification Code',
      html: `
        <div style="font-family: monospace; max-width: 400px; margin: 0 auto; border: 3px solid #111; padding: 32px;">
          <h2 style="color: #990000; margin-top: 0;">Login Verification</h2>
          <p>Enter this code to complete your login:</p>
          <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; text-align: center; background: #f5f0e8; padding: 16px; border: 2px solid #111;">${code}</p>
          <p style="color: #666; font-size: 12px;">This code expires in 10 minutes.</p>
        </div>
      `,
      text: `Your login verification code is: ${code}. It expires in 10 minutes.`,
    });

    if (error) return { success: false, error };
    return { success: true, data };
  } catch (err) {
    console.error('Resend internal error:', err);
    return { success: false, error: err };
  }
};