import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import passport from 'passport';

const router = Router();

// --- 1. Sign Up (Register) ---
// POST /api/auth/register
router.post('/register', async (req, res) => {
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

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user in the database
    const user = await prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
      },
    });

    // Don't send the password back
    res.status(201).json({ message: 'User created successfully', userId: user.id });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 2. Sign In (Login) ---
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Check the password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Create a JSON Web Token (JWT)
    // This token is the "pass" the client will use for future requests
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    // Send the token to the client
    res.json({ message: 'Login successful', token: token });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 3. Google Auth - Step 1: Start the process ---
// GET /api/auth/google
// This route is called when the user clicks the "Sign in with Google" button.
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'], // Request email and profile
    session: false // We are using JWTs, not sessions
  })
);

// --- 4. Google Auth - Step 2: The Callback ---
// GET /api/auth/google/callback
// Google redirects the user here after they log in.
router.get('/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: 'http://localhost:3000/login', // Redirect to login on fail
    session: false 
  }),
  (req, res) => {
    // --- THIS IS THE KEY ---
    // The user is authenticated! `req.user` is now the user from our database.
    // We will now create a JWT and send it back to the client.

    const user = req.user as any; // Cast from passport's user
    
    // Create the JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    // Redirect the user back to the React app with the token
    // Our React app will look for this token in the URL.
    res.redirect(`http://localhost:3000?token=${token}`);
  }
);

export default router;