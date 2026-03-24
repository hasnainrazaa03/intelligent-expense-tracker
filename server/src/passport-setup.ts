import passport from 'passport';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { prisma } from './db';
import "dotenv/config";
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Only register the Google strategy if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (accessToken: string, refreshToken: string, profile: Profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in Google profile'), undefined);
          }

          const user = await prisma.user.upsert({
            where: { email: email.toLowerCase().trim() },
            update: {},
            create: {
              email: email.toLowerCase().trim(),
              // Cryptographically secure random password (never used for login)
              password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
              isVerified: true,
            },
          });

          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
} else {
  console.warn('Google OAuth credentials not configured. Google login disabled.');
}