import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from './db';
import "dotenv/config";
import bcrypt from 'bcryptjs'; // <-- THIS WAS THE MISSING IMPORT

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: 'http://localhost:3001/api/auth/google/callback',
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        const user = await prisma.user.upsert({
          where: { email: email },
          update: {},
          create: {
            email: email,
            // This hash is for a random string, it will never be used
            password: await bcrypt.hash(Math.random().toString(36), 10),
          },
        });

        // Send the user object to the next step
        return done(null, user);

      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

// We're not using sessions, so these are just boilerplate
passport.serializeUser((user, done) => {
  // 'user' here is the full user object from the database
  done(null, (user as any).id);
});

// Add 'string' type to the id parameter
passport.deserializeUser((id: string, done) => {
  // This won't really be used in our JWT flow,
  // so we just pass a minimal user object back.
  done(null, { id: id, email: "" });
});