/** Credential-free remembered identity. Package bytes never create this record. */
export type DeviceAccess = { accountId: string; epoch: string };
const KEY = "meta-shadowing:device-access:v1";
const EVENT = "device-access-changed";
const FENCE = "meta-shadowing:device-access-fence:v1";
let generation = 0;

export function readDeviceAccess(): DeviceAccess | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("accountId" in value) || !("epoch" in value)
    || typeof value.accountId !== "string" || !value.accountId || typeof value.epoch !== "string" || !value.epoch) throw new Error("Local account data is malformed");
  return { accountId: value.accountId, epoch: value.epoch };
}
export function assertDeviceAccess(access: DeviceAccess) {
  const active = readDeviceAccess();
  if (active?.accountId !== access.accountId || active.epoch !== access.epoch) throw new Error("Local account access ended");
}
export function clearDeviceAccess() {
  // Removing also succeeds when storage quota is full. Do this before async sign-out.
  generation++;
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(FENCE, crypto.randomUUID());
  } finally { window.dispatchEvent(new Event(EVENT)); }
}
export function subscribeDeviceAccess(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) listener(); };
  window.addEventListener(EVENT, listener); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", storage); };
}
export async function verifyDeviceAccess(expectedAccountId?: string): Promise<DeviceAccess | null> {
  const before = localStorage.getItem(KEY);
  const started = generation;
  const fence = localStorage.getItem(FENCE);
  const previous = readDeviceAccess();
  // A server-rendered B page cannot read A's local data while verification is pending.
  if (expectedAccountId && previous && previous.accountId !== expectedAccountId) {
    clearDeviceAccess();
    return verifyDeviceAccess(expectedAccountId);
  }
  let response: Response;
  try { response = await fetch("/api/learner/local-access", { cache: "no-store", signal: AbortSignal.timeout(10000) }); }
  catch { return readDeviceAccess(); }
  if (generation !== started || localStorage.getItem(KEY) !== before || localStorage.getItem(FENCE) !== fence) return readDeviceAccess();
  if (response.status === 401 || response.status === 403) { clearDeviceAccess(); return null; }
  if (!response.ok) return previous;
  const result = await response.json();
  if (generation !== started || localStorage.getItem(KEY) !== before || localStorage.getItem(FENCE) !== fence) return readDeviceAccess();
  if (typeof result.accountId !== "string" || !result.accountId || (expectedAccountId && result.accountId !== expectedAccountId)
    || (previous && previous.accountId !== result.accountId)) { clearDeviceAccess(); return null; }
  const access = previous ?? { accountId: result.accountId, epoch: crypto.randomUUID() };
  localStorage.setItem(KEY, JSON.stringify(access));
  window.dispatchEvent(new Event(EVENT));
  return access;
}
