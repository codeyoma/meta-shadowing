import { AppState } from 'react-native';
import { PackageAvailability } from '@/core/package-availability';
import { isVideoPackage, packageKeyOf, type LearningPackage } from '@/core/learning-context';
import { readPackageStorage, removePackageMaterials } from '@/native/package-storage';
import { installBundledPackage, type BundledPackage } from '@/native/package';
import { videoPackageActions } from '@/native/video-package';
import { cancelHostedSample, downloadHostedSample, hostedStatus } from '@/native/hosted-package';
import { freeDuoActions, isFreeDuo } from '@/native/free-duo';
import { isPaidDuo, paidAccess, paidDuoActions } from '@/native/paid-package';

const entries = new Map<string, PackageAvailability>();
const byPackage = new WeakMap<LearningPackage, PackageAvailability>();
const paidEntries = new Set<PackageAvailability>();
const sampleActions = { status: hostedStatus, start: downloadHostedSample, cancel: cancelHostedSample };
const hostedActions = (pack: LearningPackage) => isPaidDuo(pack) ? paidDuoActions : isFreeDuo(pack) ? freeDuoActions : sampleActions;
const isHosted = (pack: LearningPackage) => isPaidDuo(pack) || isFreeDuo(pack) || pack.manifest.id === 'hosted-morning-notes';
let observing = true;

export function packageAvailability(pack: LearningPackage) {
  const cached = byPackage.get(pack);
  if (cached) return cached;
  // Include the manifest, not only its claimed ID/version. A different descriptor
  // must never borrow a previously verified package's snapshot.
  const key = JSON.stringify([packageKeyOf(pack), pack.language, pack.manifest]);
  let entry = entries.get(key);
  if (!entry) {
    entry = new PackageAvailability(async changing => {
      // A revoked entitlement can reject delivery status, but must never prevent
      // measuring/removing local files. Access is checked separately by StoreKit.
      const delivery = isHosted(pack) ? await hostedActions(pack).status()
        .catch(() => ({ phase: 'failed' as const, progress: 0 })) : null;
      const busy = delivery && ['downloading', 'installing', 'cancelling'].includes(delivery.phase);
      // Status polling is cheap; never run filesystem verification during mutation.
      return changing || busy ? { delivery } : { delivery, storage: await readPackageStorage(pack) };
    }, callback => { const timer = setTimeout(callback, 250); return () => clearTimeout(timer); });
    entry.setObserving(observing);
    entries.set(key, entry);
    if (isPaidDuo(pack)) paidEntries.add(entry);
  }
  byPackage.set(pack, entry);
  return entry;
}

export const installMaterials = (pack: LearningPackage, progress: (done: number) => void) =>
  packageAvailability(pack).change(() => isVideoPackage(pack) ? videoPackageActions.install(pack)
    : isHosted(pack) ? hostedActions(pack).start() : installBundledPackage(pack as BundledPackage, progress));
export const deleteMaterials = (pack: LearningPackage) => packageAvailability(pack).change(() => removePackageMaterials(pack));
export async function cancelMaterialDownload(pack: LearningPackage) {
  await hostedActions(pack).cancel();
  await packageAvailability(pack).refresh();
}

/** One lifecycle owner. Tab focus does not invalidate material or entitlement state. */
export function startPackageAvailability() {
  let allowed = paidAccess.getSnapshot().allowed;
  const stopAccess = paidAccess.subscribe(() => {
    const next = paidAccess.getSnapshot().allowed;
    if (next && !allowed) for (const entry of paidEntries) void entry.refresh();
    allowed = next;
  });
  void paidAccess.refresh();
  observing = AppState.currentState === 'active';
  for (const entry of entries.values()) entry.setObserving(observing);
  const subscription = AppState.addEventListener('change', state => {
    if ((state === 'active') === observing) return;
    observing = state === 'active';
    if (observing) void paidAccess.refresh();
    for (const entry of entries.values()) entry.setObserving(observing);
  });
  return () => { subscription.remove(); stopAccess(); observing = false; for (const entry of entries.values()) entry.setObserving(false); };
}
