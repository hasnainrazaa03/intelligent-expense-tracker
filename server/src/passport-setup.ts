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

          const normalizedEmail = email.toLowerCase().trim();
          const randomPassword = () => bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
          const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });

          let user;
          if (!existing) {
            user = await prisma.user.create({
              data: {
                email: normalizedEmail,
                // Cryptographically secure random password (never used for login)
                password: await randomPassword(),
                isVerified: true,
              },
            });
          } else if (!existing.isVerified) {
            // SRV-M7: a pre-existing UNVERIFIED record may be a pre-registration
            // attempt by someone who set a password they know. Verify the account
            // (Google proved ownership) AND rotate the password so that password
            // can no longer be used to log in.
            user = await prisma.user.update({
              where: { email: normalizedEmail },
              data: { isVerified: true, password: await randomPassword() },
            });
          } else {
            // Legitimate, already-verified account: leave its credentials intact.
            user = existing;
          }

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