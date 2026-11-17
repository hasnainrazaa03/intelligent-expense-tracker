import { it, expect } from 'vitest';
import { describeApi, signedInClient } from '../helpers';

const expense = (householdId: string, title = 'Shared groceries') =>
  ({ title, amount: 42, category: 'Groceries', date: '2026-11-10', householdId });

const setup = async () => {
  const owner = await signedInClient();
  const member = await signedInClient();
  const household = (await owner.client.post('/api/households', { name: 'Flat 4B' })).body;
  await owner.client.post(`/api/households/${household.id}/invite`, { email: member.user.email });
  expect((await member.client.post(`/api/households/${household.id}/accept`)).status).toBe(200);
  return { owner, member, household };
};

const expenseOf = async (client: Awaited<ReturnType<typeof signedInClient>>['client'], id: string) =>
  (await client.get('/api/data/all')).body.expenses.find((e: { id: string }) => e.id === id);

describeApi('households (S10)', () => {
  it('leaving untags your expenses, and editing one with the old tag still works', async () => {
    const { member, household } = await setup();
    const created = (await member.client.post('/api/expenses', expense(household.id))).body;
    expect(created.householdId).toBe(household.id);

    expect((await member.client.delete(`/api/households/${household.id}/leave`)).status).toBe(200);
    expect((await expenseOf(member.client, created.id)).householdId).toBeFalsy();

    // The form still holds the old tag; the save succeeds and stays untagged.
    const edit = await member.client.put(`/api/expenses/${created.id}`, expense(household.id, 'Edited'));
    expect(edit.status).toBe(200);
    expect(edit.body.householdId).toBeFalsy();
  });

  it("a non-member's expense is never tagged into the household, and they can't read its pool", async () => {
    const { owner, household } = await setup();
    const outsider = await signedInClient();
    const res = await outsider.client.post('/api/expenses', expense(household.id, 'Sneaky'));
    expect(res.status).toBe(201);
    expect(res.body.householdId).toBeFalsy();

    const pool = await owner.client.get(`/api/households/${household.id}/expenses`);
    const titles = (pool.body.expenses ?? pool.body).map((e: { title: string }) => e.title);
    expect(titles).not.toContain('Sneaky');
    expect((await outsider.client.get(`/api/households/${household.id}/expenses`)).status).toBeGreaterThanOrEqual(403);
  });

  it('deleting the household untags every member\'s expenses', async () => {
    const { owner, member, household } = await setup();
    const created = (await member.client.post('/api/expenses', expense(household.id))).body;
    expect((await owner.client.delete(`/api/households/${household.id}`)).status).toBe(200);
    expect((await expenseOf(member.client, created.id)).householdId).toBeFalsy();
  });
});
