import type { BrowserContext } from "@playwright/test";

/** Observe real APIs, including deletion/enumeration, without supplying storage. */
export async function auditLearningStorage(context: BrowserContext) {
  const accesses: string[] = [];
  await context.exposeBinding("reportPersistentLearningAccess", (_source, access: string) => { accesses.push(access); });
  await context.addInitScript(({ development }) => {
    const report = (value: string) => { void (window as unknown as { reportPersistentLearningAccess: (value: string) => Promise<void> }).reportPersistentLearningAccess(value); };
    for (const method of ["getItem", "setItem", "removeItem", "clear", "key"] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { value: function(this: Storage, ...args: unknown[]) {
        // Supabase Auth probes availability then removes the probe; no session
        // or learning payload is stored. Its debug flag is a read-only SDK switch.
        const authProbe = ["setItem", "removeItem"].includes(method) && /^lswt-[\d.]+$/.test(String(args[0]));
        const authDebug = method === "getItem" && args[0] === "supabase.gotrue-js.locks.debug";
        if (!authProbe && !authDebug) report(`Storage.${method}:${String(args[0] ?? "")}`);
        return Reflect.apply(original, this, args);
      } });
    }
    for (const method of ["open", "deleteDatabase", "databases"] as const) {
      const original = IDBFactory.prototype[method];
      Object.defineProperty(IDBFactory.prototype, method, { value: function(this: IDBFactory, ...args: unknown[]) {
        if (args[0] !== "meta-shadowing-mp3-v1" && !(development && args[0] === "__next_debug_channel")) report(`IndexedDB.${method}:${String(args[0] ?? "")}`);
        return Reflect.apply(original, this, args);
      } });
    }
    if (typeof CacheStorage !== "undefined") for (const method of ["open", "match", "has", "delete", "keys"] as const) {
      const original = CacheStorage.prototype[method];
      Object.defineProperty(CacheStorage.prototype, method, { value: function(this: CacheStorage, ...args: unknown[]) {
        report(`CacheStorage.${method}:${String(args[0] ?? "")}`);
        return Reflect.apply(original, this, args);
      } });
    }
  }, { development: process.env.PLAYWRIGHT_PRODUCTION !== "1" });
  return accesses;
}
