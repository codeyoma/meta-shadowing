import { AppState } from 'react-native';
import StoreModule from '../../modules/package-store/src/PackageStoreModule';
import type { StoreSnapshot } from '../../modules/package-store/src/PackageStore.types';

let snapshot: StoreSnapshot = { revision: -1, busy: false, ownership: 'unknown', outcome: 'none',
  entitlementIssue: 'none', catalogIssue: StoreModule ? 'none' : 'unavailable' };
const listeners = new Set<() => void>();
let bridgeFailed = false;
function notify() { for (const listener of listeners) listener(); }

function failBridge() {
  bridgeFailed = true;
  snapshot = { ...snapshot, busy: false };
  notify();
}

function accept(json: string) {
  const next = JSON.parse(json) as StoreSnapshot;
  // Native events can arrive before the Promise from an earlier action resolves.
  if (next.revision < snapshot.revision) return;
  snapshot = next;
  bridgeFailed = false;
  notify();
}

async function perform(action: 'refresh' | 'purchase' | 'restore') {
  if (!StoreModule) return;
  try { accept(await StoreModule[action]()); }
  catch { failBridge(); }
}

export const packagePurchases = {
  getSnapshot: () => snapshot,
  hasBridgeError: () => bridgeFailed,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  refresh: () => perform('refresh'),
  purchase: () => perform('purchase'),
  restore: () => perform('restore'),
  available: !!StoreModule,
};

/** Mount once at the application root, not on each library card. No forced sync here. */
export function startPurchases() {
  const subscription = StoreModule?.addListener('onChange', event => {
    try { accept(event.snapshot); } catch { failBridge(); }
  });
  void packagePurchases.refresh();
  const lifecycle = AppState.addEventListener('change', state => {
    if (state === 'active') void packagePurchases.refresh();
  });
  return () => { subscription?.remove(); lifecycle.remove(); };
}
