import { useSyncExternalStore } from 'react';
import { getSetting, subscribeSettings } from '../utils/settingsStore';
import type { UserSettings } from '../types';

/**
 * One account setting, re-rendering when it changes: a local edit, the
 * server's copy arriving, or a different account signing in.
 * Change it with `updateSettings` from utils/settingsStore.
 */
export const useSetting = <K extends keyof UserSettings>(key: K): UserSettings[K] =>
  useSyncExternalStore(subscribeSettings, () => getSetting(key));

export default useSetting;
