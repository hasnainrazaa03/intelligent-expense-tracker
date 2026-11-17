import { it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

// A small daily AI budget for this file. vi.hoisted runs before the imports
// below, which load utils/aiBudget (it reads the budget at import).
vi.hoisted(() => { process.env.AI_DAILY_CALL_BUDGET = '3'; });

import { describeApi, signedInClient } from '../helpers';

// A stand-in for the Gemini REST API that records each prompt it receives.
const prompts: string[] = [];
let server: http.Server;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      prompts.push((parsed.contents ?? []).flatMap((c: { parts?: { text?: string }[] }) => c.parts ?? []).map((p: { text?: string }) => p.text).join('\n'));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '### Mock analysis\nAll good.' }] }, finishReason: 'STOP', index: 0 }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describeApi('AI analyst', () => {
  it('needs a session', async () => {
    const { newClient } = await import('../helpers');
    const anon = newClient();
    await anon.csrf();
    expect((await anon.post('/api/ai/analyze', {})).status).toBe(401);
  });

  it('sends monthly figures and says budgets are monthly (S9)', async () => {
    const { client } = await signedInClient();
    const now = new Date();
    const day = (monthsAgo: number) => new Date(now.getFullYear(), now.getMonth() - monthsAgo, 5).toLocaleDateString('en-CA');
    await client.post('/api/budgets', [{ category: 'Groceries', amount: 300 }]);
    for (const m of [3, 2, 1]) await client.post('/api/expenses', { title: `Shop ${m}`, amount: 250, category: 'Groceries', date: day(m) });
    await client.post('/api/expenses', { title: 'Shop now', amount: 100, category: 'Groceries', date: day(0) });

    const res = await client.post('/api/ai/analyze', {});
    expect(res.status).toBe(200);
    const prompt = prompts[prompts.length - 1]!.replace(/\s+/g, '');
    expect(prompt).toContain(`"currentMonth":{"month":"${day(0).slice(0, 7)}","byCategory":{"Groceries":100}`);
    expect(prompt).toContain('"monthlyLimit":300');
    expect(prompts[prompts.length - 1]).toMatch(/Never compare a budget with the 6-month categoryBreakdown/);
  });

  it('stops at the per-user daily budget, without affecting other users', async () => {
    // Each user needs data: with none, chat answers without calling the model.
    const withData = async () => {
      const s = await signedInClient();
      await s.client.post('/api/expenses', { title: 'Coffee', amount: 4, category: 'Dining Out', date: new Date().toLocaleDateString('en-CA') });
      return s;
    };
    const heavy = await withData();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await heavy.client.post('/api/ai/chat', { message: 'How am I doing?' })).status);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);

    const light = await withData();
    expect((await light.client.post('/api/ai/chat', { message: 'Hi' })).status).toBe(200);
  });
});
