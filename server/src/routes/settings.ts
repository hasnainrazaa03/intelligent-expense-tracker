import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendError } from '../utils/http';
import { ValidationError } from '../utils/errors';
import { parseSettingsPatch, settingsToClient, SettingsData } from '../utils/settings';

// Per-account settings and planning data (goals, accounts, categories, …),
// which used to live only in one browser's localStorage. See utils/settings.ts.

const router = Router();
router.use(authMiddleware);

/** Write `data` to the user's settings document, creating it on first use. */
export const saveSettings = async (userId: string, data: SettingsData) => {
  const write = () => prisma.userSettings.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  try {
    return await write();
  } catch (error) {
    // Two first-ever writes at once: both tried to create. The loser updates.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return write();
    throw error;
  }
};

// GET /api/settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId: req.user!.id } });
    return res.json({ settings: settingsToClient(row) });
  } catch (error) {
    console.error('Failed to load settings:', error);
    return sendError(res, 500, 'SETTINGS_LOAD_FAILED', 'Failed to load settings.');
  }
});

// PATCH /api/settings  { savingsGoals: [...], displayCurrency: "EUR", ... }
// Replaces each key it names (null clears it) and leaves the others alone, so
// two devices changing different settings don't overwrite each other.
router.patch('/', async (req: Request, res: Response) => {
  let data: SettingsData;
  try {
    data = parseSettingsPatch(req.body);
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, 'VALIDATION_ERROR', error.message);
    throw error;
  }
  try {
    const row = await saveSettings(req.user!.id, data);
    return res.json({ settings: settingsToClient(row) });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return sendError(res, 500, 'SETTINGS_SAVE_FAILED', 'Failed to save settings.');
  }
});

export default router;
