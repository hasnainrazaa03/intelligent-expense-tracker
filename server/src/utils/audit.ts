import { promises as fs } from 'fs';
import path from 'path';

export interface AuditEvent {
  action: string;
  userId: string;
  success: boolean;
  route?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

export async function writeAuditLog(event: AuditEvent): Promise<void> {
  const record = { timestamp: new Date().toISOString(), type: 'audit', ...event };

  // Always emit to stdout so the platform's log aggregator captures the event —
  // on ephemeral hosts (Render/Heroku) the local audit.log is wiped on every
  // restart/redeploy and interleaves across processes, so the file is a
  // best-effort local convenience only.
  console.log(JSON.stringify(record));

  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, JSON.stringify(record) + '\n', 'utf8');
  } catch (error) {
    console.error('Failed to write audit log file:', error);
  }
}
