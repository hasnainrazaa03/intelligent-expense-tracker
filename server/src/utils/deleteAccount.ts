import { prisma } from '../db';

/**
 * Delete an account and everything that belongs to it, in one transaction.
 *
 * Households the user owns are deleted for everyone, the same as the owner
 * deleting them: the other members keep their own expenses, untagged.
 * Memberships in other people's households, and invitations sent to this
 * email, are removed. Returns what was removed, for the audit log.
 */
export const deleteAccountData = async (userId: string, email: string) =>
  prisma.$transaction(
    async (tx) => {
      const owned = (await tx.household.findMany({ where: { ownerId: userId }, select: { id: true } })).map((h) => h.id);
      if (owned.length) {
        await tx.expense.updateMany({ where: { householdId: { in: owned } }, data: { householdId: null } });
        await tx.householdMember.deleteMany({ where: { householdId: { in: owned } } });
        await tx.household.deleteMany({ where: { id: { in: owned } } });
      }
      const memberships = await tx.householdMember.deleteMany({ where: { OR: [{ userId }, { invitedEmail: email }] } });

      // Installments hang off semesters; receipts reference expenses by id only.
      await tx.tuitionInstallment.deleteMany({ where: { semesterUserId: userId } });
      const semesters = await tx.semester.deleteMany({ where: { userId } });
      const receipts = await tx.receipt.deleteMany({ where: { userId } });
      const expenses = await tx.expense.deleteMany({ where: { userId } });
      const incomes = await tx.income.deleteMany({ where: { userId } });
      const budgets = await tx.budget.deleteMany({ where: { userId } });
      await tx.userSettings.deleteMany({ where: { userId } });
      await tx.revokedToken.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });

      return {
        expenses: expenses.count,
        incomes: incomes.count,
        budgets: budgets.count,
        semesters: semesters.count,
        receipts: receipts.count,
        householdsDeleted: owned.length,
        membershipsRemoved: memberships.count,
      };
    },
    { timeout: 20000 }
  );
