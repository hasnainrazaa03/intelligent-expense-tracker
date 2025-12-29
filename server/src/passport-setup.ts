import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from './db';
import "dotenv/config";
import bcrypt from 'bcryptjs';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['profile', 'email'],
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
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
            isVerified: true,
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