export type PackageManifest = { phrases: { file: string; bytes: number; sha256: string }[] };
export interface PackageIO {
  source(file: string): Promise<Uint8Array>;
  read(file: string): Promise<Uint8Array | null>;
  write(file: string, bytes: Uint8Array): Promise<void>;
  markReady(value: boolean): Promise<void>;
  hash(bytes: Uint8Array): Promise<string>;
}
function validateManifest(m: PackageManifest) {
  if (!m.phrases.length || new Set(m.phrases.map(p => p.file)).size !== m.phrases.length
    || m.phrases.some(p => !/^audio\/[a-z0-9-]+\.m4a$/.test(p.file)
      || !Number.isInteger(p.bytes) || p.bytes <= 0 || !/^[a-f0-9]{64}$/.test(p.sha256))) {
    throw new Error('Unsupported lesson package.');
  }
}
async function matches(bytes: Uint8Array | null, p: PackageManifest['phrases'][number], io: PackageIO) {
  return !!bytes && bytes.length === p.bytes && await io.hash(bytes) === p.sha256;
}
export async function verifyPackage(m: PackageManifest, io: PackageIO): Promise<boolean> {
  validateManifest(m);
  for (const p of m.phrases) if (!await matches(await io.read(p.file), p, io)) return false;
  return true;
}
export async function installPackage(m: PackageManifest, io: PackageIO, onProgress?: (done: number) => void) {
  validateManifest(m);
  await io.markReady(false);
  let done = 0;
  for (const p of m.phrases) {
    if (!await matches(await io.read(p.file), p, io)) {
      const bytes = await io.source(p.file);
      if (!await matches(bytes, p, io)) throw new Error('Lesson audio could not be verified.');
      await io.write(p.file, bytes);
      if (!await matches(await io.read(p.file), p, io)) throw new Error('Lesson audio could not be saved.');
    }
    onProgress?.(++done);
  }
  await io.markReady(true);
}
