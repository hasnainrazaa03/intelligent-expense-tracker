// Starts the API: builds the app (app.ts), listens, and shuts down gracefully.
import app from './app';
import { SERVER_CONFIG } from './config';
import { prisma } from './db';

const HOST = SERVER_CONFIG.host;
const PORT = SERVER_CONFIG.port;

// --- Start the server ---
const isProd = process.env.NODE_ENV === 'production';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(
    `[SECURITY] mode=${isProd ? 'production' : 'development'} · secure-cookies=${isProd} · cors=${isProd ? 'strict-allowlist' : 'any-localhost'} · trust-proxy=${String(SERVER_CONFIG.trustProxy)}`
  );
  if (!isProd) {
    console.warn('[SECURITY] Non-production mode — cookies are NOT Secure and CORS is permissive. Do NOT expose this process publicly.');
  }
});

// --- Graceful shutdown: stop accepting connections, drain in-flight requests,
// then disconnect Prisma. A hard timeout guarantees the process still exits. ---
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully…`);
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error during Prisma disconnect:', err);
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Last-resort guards for non-request code paths (Express 5 already forwards
// async route rejections to the error handler above).
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});