import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class PackageStoreModule extends NativeModule<{ onChange: (event: { snapshot: string }) => void }> {
  refresh(): Promise<string>;
  purchase(): Promise<string>;
  restore(): Promise<string>;
}

// Expo Go and unsupported platforms fail closed while the bundled sample remains usable.
export default requireOptionalNativeModule<PackageStoreModule>('PackageStore');
