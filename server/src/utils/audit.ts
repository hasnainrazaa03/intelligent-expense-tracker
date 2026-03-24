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
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n';
    await fs.appendFile(LOG_FILE, line, 'utf8');
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
