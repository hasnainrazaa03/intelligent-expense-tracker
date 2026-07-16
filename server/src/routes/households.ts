import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sanitizeText, sanitizeEmail } from '../utils/sanitize';
import { sendError } from '../utils/http';
import { writeAuditLog } from '../utils/audit';

const router = Router();
router.use(authMiddleware);

const MAX_HOUSEHOLDS = 10;
const MAX_MEMBERS = 20;
const MAX_NAME = 60;

const activeMembership = (householdId: string, userId: string) =>
  prisma.householdMember.findFirst({ where: { householdId, userId, status: 'active' } });

// --- Create a household (creator becomes the owner) ---
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.user!.email.toLowerCase();
  const name = sanitizeText(req.body?.name);
  if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Household name is required.');
  if (name.length > MAX_NAME) return sendError(res, 400, 'VALIDATION_ERROR', `Name must be ${MAX_NAME} characters or less.`);

  const owned = await prisma.household.count({ where: { ownerId: userId } });
  if (owned >= MAX_HOUSEHOLDS) return sendError(res, 400, 'LIMIT_REACHED', 'You already own the maximum number of households.');

  const household = await prisma.household.create({
    data: {
      name,
      ownerId: userId,
      members: { create: [{ userId, invitedEmail: email, role: 'owner', status: 'active' }] },
    },
    include: { members: true },
  });
  await writeAuditLog({ action: 'household.create', userId, success: true, route: '/api/households' });
  res.status(201).json(household);
});

// --- List my households + pending invites addressed to me ---
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.user!.email.toLowerCase();

  const myMemberships = await prisma.householdMember.findMany({ where: { userId, status: 'active' } });
  const roleByHousehold = new Map(myMemberships.map((m) => [m.householdId, m.role]));
  const rows = await prisma.household.findMany({
    where: { id: { in: myMemberships.map((m) => m.householdId) } },
    include: { members: true },
  });
  const households = rows.map((h) => ({ ...h, myRole: roleByHousehold.get(h.id) ?? 'member' }));

  const inviteRows = await prisma.householdMember.findMany({ where: { invitedEmail: email, status: 'invited' } });
  const invites = await prisma.household.findMany({
    where: { id: { in: inviteRows.map((i) => i.householdId) } },
    select: { id: true, name: true },
  });

  res.json({ households, invites });
});

// --- Invite someone by email ---
router.post('/:id/invite', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const householdId = req.params.id;
  const email = sanitizeEmail(req.body?.email);
  if (!email || !email.includes('@')) return sendError(res, 400, 'VALIDATION_ERROR', 'A valid email is required.');

  const membership = await activeMembership(householdId, userId);
  if (!membership) return sendError(res, 403, 'FORBIDDEN', 'You are not a member of this household.');

  const count = await prisma.householdMember.count({ where: { householdId } });
  if (count >= MAX_MEMBERS) return sendError(res, 400, 'LIMIT_REACHED', 'This household is full.');

  const existing = await prisma.householdMember.findFirst({ where: { householdId, invitedEmail: email } });
  if (existing) return sendError(res, 409, 'CONFLICT', 'That email is already a member or has a pending invite.');

  const invitedUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  await prisma.householdMember.create({
    data: { householdId, invitedEmail: email, userId: invitedUser?.id ?? null, role: 'member', status: 'invited' },
  });
  await writeAuditLog({ action: 'household.invite', userId, success: true, route: '/api/households/:id/invite', metadata: { householdId } });
  res.status(201).json({ message: 'Invitation created.' });
});

// --- Accept an invite addressed to me ---
router.post('/:id/accept', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.user!.email.toLowerCase();
  const householdId = req.params.id;

  const invite = await prisma.householdMember.findFirst({
    where: { householdId, status: 'invited', OR: [{ userId }, { invitedEmail: email }] },
  });
  if (!invite) return sendError(res, 404, 'NOT_FOUND', 'No pending invite for this household.');

  await prisma.householdMember.update({ where: { id: invite.id }, data: { userId, status: 'active' } });
  await writeAuditLog({ action: 'household.accept', userId, success: true, route: '/api/households/:id/accept', metadata: { householdId } });
  res.json({ message: 'You joined the household.' });
});

// --- Decline an invite addressed to me ---
router.post('/:id/decline', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const email = req.user!.email.toLowerCase();
  const householdId = req.params.id;
  const invite = await prisma.householdMember.findFirst({
    where: { householdId, status: 'invited', OR: [{ userId }, { invitedEmail: email }] },
  });
  if (!invite) return sendError(res, 404, 'NOT_FOUND', 'No pending invite for this household.');
  await prisma.householdMember.delete({ where: { id: invite.id } });
  res.json({ message: 'Invite declined.' });
});

// --- Leave a household (owner must delete it instead) ---
router.delete('/:id/leave', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const householdId = req.params.id;
  const membership = await activeMembership(householdId, userId);
  if (!membership) return sendError(res, 404, 'NOT_FOUND', 'You are not a member of this household.');
  if (membership.role === 'owner') return sendError(res, 400, 'OWNER_CANNOT_LEAVE', 'Owners must delete the household instead of leaving.');
  await prisma.householdMember.delete({ where: { id: membership.id } });
  res.json({ message: 'You left the household.' });
});

// --- Owner removes a member ---
router.delete('/:id/members/:memberId', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const householdId = req.params.id;
  const owner = await prisma.householdMember.findFirst({ where: { householdId, userId, role: 'owner', status: 'active' } });
  if (!owner) return sendError(res, 403, 'FORBIDDEN', 'Only the owner can remove members.');
  const target = await prisma.householdMember.findFirst({ where: { id: req.params.memberId, householdId } });
  if (!target) return sendError(res, 404, 'NOT_FOUND', 'Member not found.');
  if (target.role === 'owner') return sendError(res, 400, 'CANNOT_REMOVE_OWNER', 'You cannot remove the owner.');
  await prisma.householdMember.delete({ where: { id: target.id } });
  res.json({ message: 'Member removed.' });
});

// --- Owner deletes the household ---
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const householdId = req.params.id;
  const household = await prisma.household.findUnique({ where: { id: householdId } });
  if (!household) return sendError(res, 404, 'NOT_FOUND', 'Household not found.');
  if (household.ownerId !== userId) return sendError(res, 403, 'FORBIDDEN', 'Only the owner can delete this household.');
  await prisma.household.delete({ where: { id: householdId } }); // cascades members
  await writeAuditLog({ action: 'household.delete', userId, success: true, route: '/api/households/:id', metadata: { householdId } });
  res.json({ message: 'Household deleted.' });
});

export default router;
