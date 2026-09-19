import delivery from '../../modules/package-delivery';
import { readPaidPackage } from '@/core/paid-package';
import { PaidAccessStore } from '@/core/paid-access';
import type { LearningPackage } from '@/core/learning-context';

const unavailable = ():never => {throw Error('package-delivery-unavailable');};
export const paidDuoPackage = readPaidPackage(delivery.paidDuoManifest);
// Identity controls restrictions even when the native manifest is unavailable.
export const isPaidDuo = (pack:LearningPackage) => pack.manifest.id === 'duo-33';
export const paidAccess = new PaidAccessStore({
  read: () => delivery.paidDuoAccess?.() ?? Promise.reject(Error('package-delivery-unavailable')),
  listen: fn => {
    const subscription = delivery.addListener?.('onPaidDuoAccess', fn);
    if(!subscription) return unavailable();
    return () => subscription.remove();
  },
});
export const paidAccessSource = {
  refresh: paidAccess.refresh,
  subscribe: (fn:(value:ReturnType<typeof paidAccess.getSnapshot>)=>void) => paidAccess.subscribe(() => fn(paidAccess.getSnapshot())),
};
export const paidDuoActions = {
  status: () => delivery.paidDuoStatus?.() ?? Promise.reject(Error('package-delivery-unavailable')),
  start: () => delivery.paidDuoStart?.() ?? Promise.reject(Error('package-delivery-unavailable')),
  cancel: () => delivery.paidDuoCancel?.() ?? Promise.reject(Error('package-delivery-unavailable')),
  storage: () => delivery.paidDuoStorage?.() ?? Promise.reject(Error('package-delivery-unavailable')),
  remove: () => delivery.paidDuoRemove?.() ?? Promise.reject(Error('package-delivery-unavailable')),
  access: paidAccess.refresh,
};
export const mayUsePackage = (pack:LearningPackage) => !isPaidDuo(pack) || paidAccess.getSnapshot().allowed;
export async function authorizePackage(pack:LearningPackage) {
  return !isPaidDuo(pack) || !!paidDuoPackage && (await paidAccess.refresh()).allowed;
}
