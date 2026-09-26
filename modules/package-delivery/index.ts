import { requireOptionalNativeModule } from 'expo';

export type DeliveryStatus = {
  phase: 'idle' | 'downloading' | 'installing' | 'cancelling' | 'cancelled' | 'failed' | 'ready' | 'unavailable';
  progress: number;
};
export type DiagnosticStatus = DeliveryStatus & {
  outcome: 'not-run' | 'observing' | 'cancelled-unpublished' | 'inconclusive' | 'failed';
  observedProgress: number;
};
interface PackageDelivery {
  sentenceSyntax?(key: string): Promise<string | null>;
  readonly paidDuoManifest?: string | null;
  paidDuoAccess?(): Promise<{revision:number;allowed:boolean}>;
  paidDuoStatus?(): Promise<DeliveryStatus>;
  paidDuoStart?(): Promise<void>;
  paidDuoCancel?(): Promise<void>;
  paidDuoStorage?(): Promise<{bytes:number;installed:boolean;busy:boolean}>;
  paidDuoRemove?(): Promise<{cacheCleared:boolean}>;
  addListener?(event:'onPaidDuoAccess', fn:(value:unknown)=>void): {remove():void};
  readonly freeDuoManifest?: string | null;
  freeDuoStatus(): Promise<DeliveryStatus>;
  freeDuoStart(): Promise<void>;
  freeDuoCancel(): Promise<void>;
  freeDuoStorage(): Promise<{ bytes: number; installed: boolean; busy: boolean }>;
  freeDuoRemove(): Promise<{ cacheCleared: boolean }>;
  readonly animationPreviewEnabled: boolean;
  readonly diagnosticsEnabled: boolean;
  diagnosticStatus(): Promise<DiagnosticStatus>;
  diagnosticStart(autoCancel: boolean): Promise<void>;
  diagnosticCancel(): Promise<void>;
  diagnosticDamage(fault: 'missing' | 'corrupt'): Promise<void>;
  diagnosticReset(): Promise<void>;
  status(descriptor: string): Promise<DeliveryStatus>;
  start(descriptor: string): Promise<void>;
  cancel(): Promise<void>;
  storage(descriptor: string): Promise<{ bytes: number; installed: boolean; busy: boolean }>;
  removeMaterials(descriptor: string): Promise<{ cacheCleared: boolean }>;
  bundledBytes(): Promise<number>;
  removeBundledMaterials(): Promise<void>;
}
const unavailable = async (): Promise<never> => { throw new Error('package-delivery-unavailable'); };
const delivery: PackageDelivery = requireOptionalNativeModule<PackageDelivery>('PackageDelivery') ?? {
  freeDuoManifest: null,
  freeDuoStatus: unavailable,
  freeDuoStart: unavailable,
  freeDuoCancel: unavailable,
  freeDuoStorage: unavailable,
  freeDuoRemove: unavailable,
  animationPreviewEnabled: false,
  diagnosticsEnabled: false,
  diagnosticStatus: async () => ({ phase: 'unavailable', progress: 0, outcome: 'not-run', observedProgress: 0 }),
  diagnosticStart: unavailable,
  diagnosticCancel: unavailable,
  diagnosticDamage: unavailable,
  diagnosticReset: unavailable,
  status: async () => ({ phase: 'unavailable', progress: 0 }),
  start: unavailable,
  cancel: unavailable,
  storage: unavailable,
  removeMaterials: unavailable,
  // This read also performs the native containment/symlink preflight. Never
  // substitute zero bytes: callers rely on it before mutating bundled files.
  bundledBytes: unavailable,
  removeBundledMaterials: unavailable,
};
export default delivery;
// Older binaries and unavailable modules must not enable developer routes.
export const animationPreviewEnabled = delivery.animationPreviewEnabled === true;
