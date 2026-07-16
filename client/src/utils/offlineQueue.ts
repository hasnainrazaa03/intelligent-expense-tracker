// A tiny IndexedDB-backed queue for expense creates made while offline, so they
// aren't lost and replay automatically on reconnect.
import type { Expense } from '../types';

const DB_NAME = 'orbit-offline';
const STORE = 'pendingExpenses';

export interface PendingExpense {
  clientId: string;
  payload: Omit<Expense, 'id'>;
  createdAt: number;
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'clientId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const reqP = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const store = async (mode: IDBTransactionMode): Promise<IDBObjectStore> => {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
};

export const enqueueExpense = async (payload: Omit<Expense, 'id'>): Promise<PendingExpense> => {
  const item: PendingExpense = {
    clientId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    createdAt: Date.now(),
  };
  const s = await store('readwrite');
  await reqP(s.add(item));
  return item;
};

export const allPendingExpenses = async (): Promise<PendingExpense[]> => {
  const s = await store('readonly');
  const items = await reqP(s.getAll() as IDBRequest<PendingExpense[]>);
  return items.sort((a, b) => a.createdAt - b.createdAt);
};

export const removePendingExpense = async (clientId: string): Promise<void> => {
  const s = await store('readwrite');
  await reqP(s.delete(clientId));
};

export const countPendingExpenses = async (): Promise<number> => {
  const s = await store('readonly');
  return reqP(s.count());
};
