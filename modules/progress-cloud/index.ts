import { requireOptionalNativeModule } from 'expo';

export type CloudAccount = { status: 'available'; scope: string } | { status: 'unavailable' | 'no-account' | 'unknown' };
export type CloudBackup = { id: string; createdAt: string; revision: number; token: string; legacy: boolean; cleanupPending?: boolean; pendingPublication?: string };
export type CloudPublication = CloudBackup & { cleanupPending: boolean };
export interface ProgressCloud {
  account(): Promise<CloudAccount>;
  list(scope: string): Promise<CloudBackup[]>;
  read(scope: string, id: string): Promise<string>;
  publish(scope: string, revision: number, json: string, base: string): Promise<CloudPublication>;
  cleanup(scope: string, base: string, abandoned: string | null): Promise<boolean>;
  stop(): Promise<void>;
  addListener(event: 'accountChanged', listener: () => void): { remove(): void };
}

const unavailable = async (): Promise<never> => { throw new Error('progress-cloud-unavailable'); };
const progressCloud = requireOptionalNativeModule<ProgressCloud>('ProgressCloud') ?? {
  account: async () => ({ status: 'unavailable' as const }),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  cleanup: unavailable,
  stop: async () => {},
  addListener: () => ({ remove() {} }),
};
export default progressCloud;
