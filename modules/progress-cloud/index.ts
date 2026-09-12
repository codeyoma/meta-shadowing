import { requireOptionalNativeModule } from 'expo';

export type CloudAccount = { status: 'available'; scope: string } | { status: 'unavailable' | 'no-account' | 'unknown' };
export type CloudBackup = { id: string; createdAt: string; revision: number };
export interface ProgressCloud {
  account(): Promise<CloudAccount>;
  list(scope: string): Promise<CloudBackup[]>;
  read(scope: string, id: string): Promise<string>;
  publish(scope: string, revision: number, json: string): Promise<{ revision: number }>;
  stop(): Promise<void>;
  addListener(event: 'accountChanged', listener: () => void): { remove(): void };
}

const unavailable = async (): Promise<never> => { throw new Error('progress-cloud-unavailable'); };
const progressCloud = requireOptionalNativeModule<ProgressCloud>('ProgressCloud') ?? {
  account: async () => ({ status: 'unavailable' as const }),
  list: unavailable,
  read: unavailable,
  publish: unavailable,
  stop: async () => {},
  addListener: () => ({ remove() {} }),
};
export default progressCloud;
