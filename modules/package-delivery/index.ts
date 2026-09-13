import { NativeModule, requireNativeModule } from 'expo';

export type DeliveryStatus = {
  phase: 'idle' | 'downloading' | 'installing' | 'cancelling' | 'cancelled' | 'failed' | 'ready' | 'unavailable';
  progress: number;
};
declare class PackageDelivery extends NativeModule {
  status(descriptor: string): Promise<DeliveryStatus>;
  start(descriptor: string): Promise<void>;
  cancel(): Promise<void>;
}
export default requireNativeModule<PackageDelivery>('PackageDelivery');
