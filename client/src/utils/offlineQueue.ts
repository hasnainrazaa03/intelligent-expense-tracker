// A tiny IndexedDB-backed queue for expense creates made while offline, so they
// aren't lost and replay automatically on reconnect.
import type { Expense } from '../types';

const DB_NAME = 'orbit-offline';
const STORE = 'pendingExpenses';

export interface PendingExpense {
  clientId: string;
  payload: Omit<Expense, 'id'>;
  createdAt: number;
  /** Who queued it (session email). Items only replay for their owner, so a
   *  second person signing in on the same device never receives them. Absent on
   *  items queued before this field existed — those replay for whoever is
   *  signed in, as before. */
  ownerId?: string;
}

// One connection for the page's lifetime (opening one per operation leaked
// connections and re-ran the open handshake on every call).
let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'clientId' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema closes us; reopen on next use.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
};

const reqP = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
};

const belongsTo = (item: PendingExpense, ownerId: string) => !item.ownerId || item.ownerId === ownerId;

export const enqueueExpense = async (payload: Omit<Expense, 'id'>, ownerId: string | null): Promise<PendingExpense> => {
  const item: PendingExpense = {
    clientId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    createdAt: Date.now(),
    ...(ownerId ? { ownerId } : {}),
  };
  const s = await store('readwrite');
  await reqP(s.add(item));
  return item;
};

/** Queued items belonging to `ownerId`, oldest first. */
export const allPendingExpenses = async (ownerId: string): Promise<PendingExpense[]> => {
  const s = await store('readonly');
  const items = await reqP(s.getAll() as IDBRequest<PendingExpense[]>);
  return items.filter((item) => belongsTo(item, ownerId)).sort((a, b) => a.createdAt - b.createdAt);
};

export const removePendingExpense = async (clientId: string): Promise<void> => {
  const s = await store('readwrite');
  await reqP(s.delete(clientId));
};

/** Drop everything queued by `ownerId` (after the account is deleted). */
export const clearPendingExpenses = async (ownerId: string): Promise<void> => {
  const s = await store('readwrite');
  const items = await reqP(s.getAll() as IDBRequest<PendingExpense[]>);
  await Promise.all(items.filter((item) => item.ownerId === ownerId).map((item) => reqP(s.delete(item.clientId))));
};

export const countPendingExpenses = async (ownerId: string): Promise<number> =>
  (await allPendingExpenses(ownerId)).length;
