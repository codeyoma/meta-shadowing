import type { ProgressSync } from './progress-sync';

/** Enable from a freshly checked account; the native dialog supplies the choice. */
export async function enableAutomaticBackup(
  sync: ProgressSync,
  chooseGuestImport: () => Promise<boolean | null>,
) {
  const snapshot = sync.getSnapshot();
  if (!snapshot.ready || snapshot.status !== 'available' || snapshot.busy) return;
  const importGuest = snapshot.hasProfile || !sync.profiles.hasGuestData() ? false : await chooseGuestImport();
  if (importGuest === null) return;
  // Account refresh/switch invalidates a dialog already on screen.
  await sync.enable(importGuest, snapshot.generation);
}

/** One intentional two-way pass preserves the installation's automatic toggle. */
export async function refreshProgress(sync: ProgressSync, chooseGuestImport: () => Promise<boolean | null>) {
  const snapshot = sync.getSnapshot();
  if (!snapshot.ready || snapshot.status !== 'available' || snapshot.busy) return;
  const importGuest = snapshot.hasProfile || !sync.profiles.hasGuestData() ? false : await chooseGuestImport();
  if (importGuest === null) return;
  await sync.refresh(importGuest, snapshot.generation);
}
