import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import otpGenerator from 'otp-generator';
import { transporter } from '../utils/mailer';

const router = Router();

// --- 1. Sign Up (Register) ---
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Generate OTP
    const otp = otpGenerator.generate(6, { 
      upperCaseAlphabets: false, 
      specialChars: false,
      lowerCaseAlphabets: false // Generate a numeric 6-digit code
    });
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user in the database
    const user = await prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
        verificationOtp: otp,
        otpExpires: expires,
        isVerified: false // Explicitly set to false until OTP is verified
      },
    });

    // --- MOVE EMAIL LOGIC INSIDE THE ROUTE ---
    try {
      await transporter.sendMail({
        from: `"USC Ledger Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "YOUR_VERIFICATION_CODE",
        text: `Your code is: ${otp}. It expires in 10 minutes.`
      });
      console.log(`✅ OTP sent successfully to ${email}`);
    } catch (mailError: any) {
      console.error('❌ Mailer Error:', mailError.message);
    }

    res.status(201).json({ message: 'User created successfully. Please check your email.', userId: user.id });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 2. Verify OTP ---
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.verificationOtp !== otp || (user.otpExpires && new Date() > user.otpExpires)) {
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

// --- 3. Sign In (Login) ---
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check if verified
    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email before logging in' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Use 'id' to match your authMiddleware payload expectation
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.json({ message: 'Login successful', token: token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 4. Google Auth ---
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
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );
    
    res.redirect(`${process.env.FRONTEND_URL}?token=${token}`);
  }
);

export default router;