import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDeviceAccess, clearDeviceAccess, readDeviceAccess, subscribeDeviceAccess, verifyDeviceAccess } from "./device-access";

const key = "meta-shadowing:device-access:v1";
beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function establish(accountId = "account-a") {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ accountId })));
  return (await verifyDeviceAccess())!;
}
describe("credential-free local access boundary", () => {
  it("cannot create identity from network failure or unavailable storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await verifyDeviceAccess()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ accountId: "a" })));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    await expect(verifyDeviceAccess()).rejects.toThrow();
    expect(readDeviceAccess()).toBeNull();
  });
  it("never returns a stale identity when a failed request finishes after logout", async () => {
    const access = await establish();
    let reject!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((_resolve, fail) => { reject = fail; })));
    const request = verifyDeviceAccess();
    clearDeviceAccess(); reject(new TypeError("offline"));
    expect(await request).toBeNull();
    expect(() => assertDeviceAccess(access)).toThrow();
  });
  it("fences successful late verification and sends invalidation even at full quota", async () => {
    await establish();
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(done => { resolve = done; })));
    const request = verifyDeviceAccess();
    const changed = vi.fn(), unsubscribe = subscribeDeviceAccess(changed);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(() => clearDeviceAccess()).toThrow();
    expect(changed).toHaveBeenCalledOnce();
    resolve(Response.json({ accountId: "account-a" }));
    expect(await request).toBeNull();
    expect(localStorage.getItem(key)).toBeNull(); unsubscribe();
  });
  it("preserves the current account on network error but ends access on explicit rejection", async () => {
    const access = await establish();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await verifyDeviceAccess()).toEqual(access);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    expect(await verifyDeviceAccess()).toBeNull();
  });
  it("fences A before a server-rendered B page can establish B", async () => {
    const a = await establish();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ accountId: "account-b" })));
    expect((await verifyDeviceAccess("account-b"))?.accountId).toBe("account-b");
    expect(() => assertDeviceAccess(a)).toThrow();
  });
});
