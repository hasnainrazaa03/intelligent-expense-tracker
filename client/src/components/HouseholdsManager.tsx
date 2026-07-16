import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from './ui';
import {
  listHouseholds,
  createHousehold,
  inviteToHousehold,
  acceptHouseholdInvite,
  declineHouseholdInvite,
  leaveHousehold,
  deleteHousehold,
  getHouseholdExpenses,
  type Household,
  type HouseholdPool,
} from '../services/api';

const money = (n: number) => `$${n.toFixed(2)}`;

const fieldCls =
  'bg-surface border border-app-border rounded-lg px-3 py-2 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50';

/** Shared/household accounts: create households, invite members by email, accept
 *  invites, and manage membership. (Shared expense pooling is a follow-up.) */
const HouseholdsManager: React.FC = () => {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [invites, setInvites] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pools, setPools] = useState<Record<string, HouseholdPool>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const togglePool = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const pool = await getHouseholdExpenses(id);
      setPools((p) => ({ ...p, [id]: pool }));
    } catch {
      /* leave collapsed content empty */
    }
  };

  const refresh = async () => {
    try {
      const r = await listHouseholds();
      setHouseholds(r.households);
      setInvites(r.invites);
    } catch {
      /* non-fatal — panel just shows empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-app-border bg-surface-2 p-4 md:p-5">
      <p className="font-display text-sm font-semibold text-app-text mb-3">Households · shared budgeting</p>

      {/* Create */}
      <div className="flex gap-2 mb-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className={`flex-1 ${fieldCls}`}
          placeholder="New household name"
          aria-label="New household name"
        />
        <Button
          size="sm"
          disabled={busy || !newName.trim()}
          onClick={() => run(async () => { await createHousehold(newName.trim()); setNewName(''); }, 'Household created.')}
          className="px-4"
        >
          Create
        </Button>
      </div>

      {/* Pending invites addressed to me */}
      {invites.length > 0 && (
        <div className="space-y-2 mb-3">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary-soft px-3 py-2.5 gap-2">
              <span className="text-sm text-app-text truncate">Invite to <span className="font-medium">{inv.name}</span></span>
              <span className="flex gap-1.5 flex-shrink-0">
                <Button size="sm" disabled={busy} onClick={() => run(() => acceptHouseholdInvite(inv.id), 'Joined household.')} className="px-3">Accept</Button>
                <button disabled={busy} onClick={() => run(() => declineHouseholdInvite(inv.id), 'Invite declined.')} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-app-muted hover:text-app-text">Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* My households */}
      <div className="space-y-3">
        {loading && <p className="text-xs text-app-muted">Loading…</p>}
        {!loading && households.length === 0 && invites.length === 0 && (
          <p className="text-xs text-app-muted">No households yet. Create one and invite people by email.</p>
        )}
        {households.map((h) => {
          const active = h.members.filter((m) => m.status === 'active');
          const pending = h.members.filter((m) => m.status === 'invited');
          const isOwner = h.myRole === 'owner';
          return (
            <div key={h.id} className="rounded-lg border border-app-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-app-text truncate">{h.name}{isOwner && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-app-faint">owner</span>}</p>
                {isOwner ? (
                  <button disabled={busy} onClick={() => run(() => deleteHousehold(h.id), 'Household deleted.')} className="text-[11px] font-semibold text-app-faint hover:text-danger flex-shrink-0">Delete</button>
                ) : (
                  <button disabled={busy} onClick={() => run(() => leaveHousehold(h.id), 'Left household.')} className="text-[11px] font-semibold text-app-faint hover:text-danger flex-shrink-0">Leave</button>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {active.map((m) => (
                  <span key={m.id} className="rounded-md bg-surface-2 border border-app-border px-2 py-0.5 text-[11px] text-app-muted">
                    {m.invitedEmail}{m.role === 'owner' ? ' ·owner' : ''}
                  </span>
                ))}
                {pending.map((m) => (
                  <span key={m.id} className="rounded-md bg-warn/10 border border-warn/30 px-2 py-0.5 text-[11px] text-warn">
                    {m.invitedEmail} · pending
                  </span>
                ))}
              </div>

              <div className="flex gap-2 mt-2.5">
                <input
                  value={inviteEmail[h.id] || ''}
                  onChange={(e) => setInviteEmail((p) => ({ ...p, [h.id]: e.target.value }))}
                  className={`flex-1 ${fieldCls}`}
                  placeholder="Invite by email"
                  aria-label={`Invite someone to ${h.name}`}
                />
                <Button
                  size="sm"
                  disabled={busy || !(inviteEmail[h.id] || '').includes('@')}
                  onClick={() => run(async () => { await inviteToHousehold(h.id, (inviteEmail[h.id] || '').trim()); setInviteEmail((p) => ({ ...p, [h.id]: '' })); }, 'Invitation sent.')}
                  className="px-3"
                >
                  Invite
                </Button>
              </div>

              {/* Shared expenses + settle-up */}
              <button
                onClick={() => togglePool(h.id)}
                className="mt-2.5 text-[11px] font-semibold text-primary hover:brightness-110"
                aria-expanded={expanded === h.id}
              >
                {expanded === h.id ? 'Hide shared expenses' : 'View shared expenses'}
              </button>
              {expanded === h.id && pools[h.id] && (
                <div className="mt-2 rounded-lg border border-app-border bg-surface-2 p-2.5 space-y-2.5">
                  <p className="text-[11px] text-app-muted tabular-nums">Pooled total: <span className="text-app-text font-medium">{money(pools[h.id].total)}</span> · split {pools[h.id].memberCount} ways</p>
                  {pools[h.id].settleUp.length > 0 && (
                    <div className="space-y-1">
                      {pools[h.id].settleUp.map((s) => (
                        <div key={s.email} className="flex items-center justify-between text-[11px] tabular-nums">
                          <span className="text-app-muted truncate">{s.email}</span>
                          <span className={s.balance > 0.005 ? 'text-ok font-medium' : s.balance < -0.005 ? 'text-danger font-medium' : 'text-app-muted'}>
                            {s.balance > 0.005 ? `is owed ${money(s.balance)}` : s.balance < -0.005 ? `owes ${money(-s.balance)}` : 'settled'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {pools[h.id].expenses.length === 0 ? (
                    <p className="text-[11px] text-app-muted">No shared expenses yet. Tag an expense to this household when adding it.</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {pools[h.id].expenses.map((e) => (
                        <div key={e.id} className="flex items-center justify-between rounded-md border border-app-border bg-surface px-2 py-1.5 text-[11px]">
                          <span className="min-w-0 flex-1">
                            <span className="text-app-text truncate block">{e.title}</span>
                            <span className="text-app-faint">{e.payerEmail} · {e.date}</span>
                          </span>
                          <span className="text-app-text font-medium tabular-nums flex-shrink-0">{money(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HouseholdsManager;
