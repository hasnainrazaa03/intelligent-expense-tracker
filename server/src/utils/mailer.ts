// server/src/utils/mailer.ts
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (email: string, otp: string) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM as string, // Force TypeScript to treat it as a string
      to: email,
      subject: 'YOUR_VERIFICATION_CODE',
      text: `Your code is: ${otp}. It expires in 10 minutes.`,
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err };
  }
};