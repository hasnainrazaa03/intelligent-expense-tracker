import { PrismaClient } from '@prisma/client';

// This creates a single, shared instance of the Prisma Client
export const prisma = new PrismaClient();