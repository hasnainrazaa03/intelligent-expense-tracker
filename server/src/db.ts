import { PrismaClient } from '@prisma/client';

// This creates a single, shared instance of the Prisma Client.
// Graceful shutdown (drain the HTTP server, then $disconnect) is owned by
// index.ts, where the server handle lives — disconnecting here first would drop
// in-flight requests.
export const prisma = new PrismaClient();