import { PrismaClient } from '@prisma/client';

// This creates a single, shared instance of the Prisma Client
export const prisma = new PrismaClient();

// Graceful shutdown: disconnect Prisma on process exit
const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);