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
    // Check if key exists before sending
    if (!process.env.RESEND_API_KEY) {
      throw new Error("Cannot send email: RESEND_API_KEY is undefined.");
    }

    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM as string,
      to: email,
      subject: 'YOUR_VERIFICATION_CODE',
      text: `Your code is: ${otp}. It expires in 10 minutes.`,
    });

    if (error) return { success: false, error };
    return { success: true, data };
  } catch (err) {
    console.error("Resend internal error:", err);
    return { success: false, error: err };
  }
};