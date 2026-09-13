import { NativeModule, requireNativeModule } from 'expo';

export type DeliveryStatus = {
  phase: 'idle' | 'downloading' | 'installing' | 'cancelling' | 'cancelled' | 'failed' | 'ready' | 'unavailable';
  progress: number;
};
export type DiagnosticStatus = DeliveryStatus & {
  outcome: 'not-run' | 'observing' | 'cancelled-unpublished' | 'inconclusive' | 'failed';
  observedProgress: number;
};
declare class PackageDelivery extends NativeModule {
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
export default requireNativeModule<PackageDelivery>('PackageDelivery');
