/* The only cached document is the account-neutral, statically rendered /offline.
 * Its explicit script/style/font dependency closure is installed atomically.
 * Authenticated HTML, RSC, APIs and media are NEVER written to this cache. */
const BUILD = new URL(self.location.href).searchParams.get("build");
const CACHE = `meta-shadowing-offline-shell-v1-${BUILD}`;
const SHELL = "/offline";
const STATIC = /^\/_next\/static\/[A-Za-z0-9_./%\[\]@()-]+\.(?:js|css|woff2?|ttf|otf)$/;
const failure = () => new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meta Shadowing</title><body><main><h1>오프라인 화면을 불러올 수 없습니다.</h1><p>필수 화면 자료가 없거나 삭제되었습니다. 온라인에서 앱을 다시 열어 주세요. 기기 학습 기록은 별도로 보관됩니다.</p><a href="/offline">다시 시도</a></main></body></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    if (!BUILD || !/^[a-f0-9-]{36}$/.test(BUILD)) throw new Error("Missing offline build identity");
    const response = await fetch(SHELL, { credentials: "omit", cache: "no-store", redirect: "error" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")
      || /private|no-store/i.test(response.headers.get("cache-control") ?? "") || response.headers.has("set-cookie")) throw new Error("Offline shell unavailable");
    const html = await response.clone().text();
    if (!/<meta name="device-offline-shell" content="1"\s*\/?\s*>/.test(html)) throw new Error("Not the static offline shell");
    const assets = new Map();
    // HTML attributes only. Never parse RSC payloads, route data, or arbitrary URLs.
    const paths = [...html.matchAll(/(?:src|href)="([^"?#]+)"/g)].map(match => match[1]).filter(path => STATIC.test(path));
    async function acquire(path) {
      if (assets.has(path)) return;
      assets.set(path, null);
      const asset = await fetch(path, { credentials: "omit", cache: "no-store", redirect: "error" });
      if (!asset.ok || asset.headers.get("content-type")?.includes("text/html")) throw new Error("Offline asset unavailable");
      assets.set(path, asset);
      if (path.endsWith(".css")) {
        const css = await asset.clone().text();
        await Promise.all([...css.matchAll(/url\(["']?([^\s)"']+)["']?\)/g)].map(async match => {
          const url = new URL(match[1], new URL(path, self.location.origin));
          if (url.origin === self.location.origin && STATIC.test(url.pathname) && !url.search) await acquire(url.pathname);
        }));
      }
    }
    await Promise.all(paths.map(acquire));
    if (!assets.size) throw new Error("Offline shell has no assets");
    const cache = await caches.open(CACHE);
    // Readiness metadata is written last. No partial installation is served.
    await Promise.all([...assets].map(([path, asset]) => cache.put(path, asset)));
    await cache.put(SHELL, response);
    await cache.put("/offline-assets", new Response(JSON.stringify([...assets.keys()])));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && (url.pathname === SHELL || (url.pathname === "/player" && (!url.searchParams.has("level") || url.searchParams.get("level") === "1")))) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(CACHE), shell = await cache.match(SHELL), metadata = await cache.match("/offline-assets");
        if (!shell || !metadata) return failure();
        const paths = await metadata.json();
        if (!(await Promise.all(paths.map(path => cache.match(path)))).every(Boolean)) return failure();
        return shell;
      }
    })());
  } else if (STATIC.test(url.pathname) && !url.search) {
    // Serve only already enumerated assets. No runtime caching of new requests.
    event.respondWith((async () => (await (await caches.open(CACHE)).match(request)) ?? fetch(request))());
  }
});
