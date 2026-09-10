import { createClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { expect, test, signInFixtureAdmin } from "./fixtures/cloud-ui";
import { assertLocalSupabaseUrl } from "./fixtures/local-supabase-google";
import type { APIResponse, Page } from "@playwright/test";

// A literal valid MP3 header followed by distinct payload bytes. This seam checks
// byte identity, not playback decoding (covered by the publication audio suite).
const bytes = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 11, 22, 33, 44]);
const digest = "1fbdf3048de17a9440b45b005613e9ef26e6167029b449956abb37df62c164a5";

async function fixture(page: Page, script = "Hello.\n안녕하세요.") {
  const url = process.env.SUPABASE_INTEGRATION_URL!;
  assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  await signInFixtureAdmin(page);
  const accountId = (await (await page.request.get("/api/learner/preferences")).json()).profile.accountId;
  const admin = createServerClient(url, process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!, { cookies: {
    getAll: () => page.context().cookies(), setAll: () => {},
  } });
  const saved = await page.request.post("/api/admin/drafts", { multipart: {
    title: "Verified publication", language: "english",
    scriptFile: { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from(script) },
  } });
  expect(saved.status()).toBe(201);
  const { draftId } = await saved.json();
  const sourcePath = `${accountId}/${draftId}/001.mp3`;
  const verifiedPath = `${accountId}/${draftId}/verified/${digest}.mp3`;
  return { service, admin, accountId, draftId, sourcePath, verifiedPath };
}

test("publication records a full-byte digest and retains immutable verified audio", async ({ page, request }) => {
  const { service, admin, draftId, sourcePath, verifiedPath } = await fixture(page);
  try {
    // Nested verified objects are server-owned even before the draft is published.
    expect((await admin.storage.from("lesson-audio").upload(verifiedPath, bytes, { contentType: "audio/mpeg" })).error).not.toBeNull();
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    const published = await page.request.post(`/api/admin/drafts/${draftId}/publish`);
    expect(published.status()).toBe(200);
    const row = await service.from("lesson_drafts").select("audio_manifest, published_at").eq("id", draftId).single();
    expect(row.error).toBeNull();
    const descriptorUrl = `/api/lessons/${draftId}/package/descriptor?version=${encodeURIComponent(row.data!.published_at)}`;
    const descriptor = await page.request.get(descriptorUrl);
    expect(descriptor.status()).toBe(200);
    expect(descriptor.headers()["cache-control"]).toBe("private, no-store");
    expect(await descriptor.json()).toEqual({ schemaVersion: 1, lessonId: draftId, publishedVersion: row.data!.published_at,
      audio: [{ assetId: `001.mp3:${digest}`, phraseNumber: 1, mimeType: "audio/mpeg", size: 14, sha256: digest }] });
    expect((await request.get(descriptorUrl)).status()).toBe(401);
    expect((await page.request.get(`/api/lessons/${draftId}/package/descriptor?version=2000-01-01T00:00:00Z`)).status()).toBe(404);
    expect(row.data!.audio_manifest).toMatchObject([{ sha256: digest, size: bytes.length, contentType: "audio/mpeg", path: verifiedPath }]);
    const retained = await service.storage.from("lesson-audio").download(verifiedPath);
    expect(retained.error).toBeNull();
    expect(Buffer.from(await retained.data!.arrayBuffer())).toEqual(bytes);
    const original = await service.storage.from("lesson-audio").download(sourcePath);
    expect(Buffer.from(await original.data!.arrayBuffer())).toEqual(bytes);
    const retry = await page.request.post(`/api/admin/drafts/${draftId}/publish`);
    expect(retry.status()).toBe(200);
    const reread = await service.from("lesson_drafts").select("audio_manifest, published_at").eq("id", draftId).single();
    expect(reread.data).toEqual(row.data);
    expect((await admin.storage.from("lesson-audio").upload(verifiedPath, Buffer.alloc(bytes.length), { contentType: "audio/mpeg", upsert: true })).error).not.toBeNull();
    await admin.storage.from("lesson-audio").remove([verifiedPath]);
    const unchanged = await service.storage.from("lesson-audio").download(verifiedPath);
    expect(Buffer.from(await unchanged.data!.arrayBuffer())).toEqual(bytes);
    expect((await page.request.post(`/api/admin/lessons/${draftId}/unpublish`)).status()).toBe(200);
    expect((await page.request.get(descriptorUrl)).status()).toBe(404);
    expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(200);
    expect((await page.request.get(descriptorUrl)).status()).toBe(200);
    // A service-controlled change to the original upload cannot change the
    // immutable copy used by the already published version.
    expect((await service.storage.from("lesson-audio").upload(sourcePath, Buffer.alloc(bytes.length), { contentType: "audio/mpeg", upsert: true })).error).toBeNull();
    const publishedAudio = await page.request.get(`/api/lessons/${draftId}/audio/1?version=${encodeURIComponent(row.data!.published_at)}`);
    expect(await publishedAudio.body()).toEqual(bytes);
    const deletion = await page.request.delete(`/api/admin/lessons/${draftId}`, { data: { confirmTitle: "Verified publication", expectedDraftId: draftId } });
    expect(deletion.status()).toBe(200);
    expect((await service.storage.from("lesson-audio").download(verifiedPath)).error).not.toBeNull();
  } finally {
    expect((await service.storage.from("lesson-audio").remove([sourcePath, verifiedPath])).error).toBeNull();
  }
});

test("publication rejects conflicting retained bytes without replacing them or publishing the draft", async ({ page }) => {
  const { service, draftId, sourcePath, verifiedPath } = await fixture(page);
  try {
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    // Simulate a damaged previous attempt at the service Storage boundary.
    expect((await service.storage.from("lesson-audio").upload(verifiedPath, Buffer.alloc(bytes.length), { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(503);
    const failed = await service.from("lesson_drafts").select("publication_status, audio_manifest").eq("id", draftId).single();
    expect(failed.data).toEqual({ publication_status: "draft", audio_manifest: [] });
    const retained = await service.storage.from("lesson-audio").download(verifiedPath);
    expect(Buffer.from(await retained.data!.arrayBuffer())).toEqual(Buffer.alloc(bytes.length));
  } finally {
    await service.storage.from("lesson-audio").remove([sourcePath, verifiedPath]);
  }
});

test("publication RPC rejects malformed digests and cross-version paths atomically", async ({ page }) => {
  const { service, admin, accountId, draftId, sourcePath, verifiedPath } = await fixture(page);
  try {
    expect((await service.storage.from("lesson-audio").upload(verifiedPath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    const item = { phraseNumber: 1, sourceLine: 1, originalName: "001.mp3", canonicalName: "001.mp3", contentType: "audio/mpeg", size: 14, sha256: digest, path: verifiedPath };
    const args = { p_draft_id: draftId, p_admin_id: accountId, p_audio_manifest: [item] };
    expect((await admin.rpc("publish_lesson_draft", args)).error).not.toBeNull();
    for (const mutation of [
      { sha256: "not-a-digest" }, { sha256: null }, { sha256: 42 }, { sha256: "A".repeat(64) },
      { path: sourcePath }, { path: verifiedPath.replace(draftId, "10000000-0000-4000-8000-000000000001") },
      { sha256: "0".repeat(64) }, { size: 15 }, { contentType: "audio/webm" },
    ]) {
      expect((await service.rpc("publish_lesson_draft", { ...args, p_audio_manifest: [{ ...item, ...mutation }] })).error?.code).toBe("23514");
      const row = await service.from("lesson_drafts").select("publication_status, audio_manifest").eq("id", draftId).single();
      expect(row.data).toEqual({ publication_status: "draft", audio_manifest: [] });
    }
    expect((await service.rpc("publish_lesson_draft", { ...args, p_admin_id: "10000000-0000-4000-8000-000000000001" })).error?.code).toBe("P0002");
    expect((await service.rpc("publish_lesson_draft", args)).error).toBeNull();
  } finally {
    await service.storage.from("lesson-audio").remove([verifiedPath]);
  }
});

test("a corrupt draft never publishes partially and a retry reuses retained verified bytes", async ({ page }) => {
  const { service, admin, accountId, draftId, sourcePath, verifiedPath } = await fixture(page, "Hello.\n안녕하세요.\nGoodbye.\n안녕히 가세요.");
  const secondPath = `${accountId}/${draftId}/002.mp3`;
  try {
    expect((await admin.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await admin.storage.from("lesson-audio").upload(secondPath, Buffer.alloc(bytes.length), { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(422);
    const failed = await service.from("lesson_drafts").select("publication_status, published_at, audio_manifest").eq("id", draftId).single();
    expect(failed.data).toEqual({ publication_status: "draft", published_at: null, audio_manifest: [] });
    const retained = await service.storage.from("lesson-audio").info(verifiedPath);
    expect(retained.error).toBeNull();
    expect((await admin.storage.from("lesson-audio").upload(verifiedPath, Buffer.alloc(bytes.length), { contentType: "audio/mpeg", upsert: true })).error).not.toBeNull();
    await admin.storage.from("lesson-audio").remove([verifiedPath]);
    expect((await service.storage.from("lesson-audio").info(verifiedPath)).data?.id).toBe(retained.data!.id);
    expect((await admin.storage.from("lesson-audio").upload(secondPath, bytes, { contentType: "audio/mpeg", upsert: true })).error).toBeNull();
    expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(200);
    expect((await service.storage.from("lesson-audio").info(verifiedPath)).data?.id).toBe(retained.data!.id);
    const published = await service.from("lesson_drafts").select("published_at").eq("id", draftId).single();
    const descriptor = await page.request.get(`/api/lessons/${draftId}/package/descriptor?version=${encodeURIComponent(published.data!.published_at)}`);
    expect(descriptor.status()).toBe(200);
    expect((await descriptor.json()).audio).toEqual([
      { assetId: `001.mp3:${digest}`, phraseNumber: 1, mimeType: "audio/mpeg", size: 14, sha256: digest },
      { assetId: `002.mp3:${digest}`, phraseNumber: 2, mimeType: "audio/mpeg", size: 14, sha256: digest },
    ]);
    expect((await service.storage.from("lesson-audio").remove([verifiedPath])).error).toBeNull();
    expect((await page.request.get(`/api/lessons/${draftId}/package/descriptor?version=${encodeURIComponent(published.data!.published_at)}`)).status()).toBe(503);
  } finally {
    await service.storage.from("lesson-audio").remove([sourcePath, secondPath, verifiedPath]);
  }
});

test("legacy versions republish and play unchanged but cannot supply verified descriptors", async ({ page }) => {
  const { service, accountId, draftId, sourcePath } = await fixture(page);
  try {
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    const manifest = [{ phraseNumber: 1, sourceLine: 1, originalName: "001.mp3", canonicalName: "001.mp3", contentType: "audio/mpeg", size: 14, path: sourcePath }];
    const published = await service.rpc("publish_lesson_draft", { p_draft_id: draftId, p_admin_id: accountId, p_audio_manifest: manifest });
    expect(published.error).toBeNull();
    expect((await page.request.post(`/api/admin/lessons/${draftId}/unpublish`)).status()).toBe(200);
    expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(200);
    const row = await service.from("lesson_drafts").select("audio_manifest, published_at").eq("id", draftId).single();
    expect(row.data).toEqual({ audio_manifest: manifest, published_at: published.data });
    const descriptor = await page.request.get(`/api/lessons/${draftId}/package/descriptor?version=${encodeURIComponent(published.data)}`);
    expect(descriptor.status()).toBe(409);
    const audio = await page.request.get(`/api/lessons/${draftId}/audio/1?version=${encodeURIComponent(published.data)}`);
    expect(audio.status()).toBe(200);
    expect(await audio.body()).toEqual(bytes);
  } finally {
    await service.storage.from("lesson-audio").remove([sourcePath]);
  }
});

test("descriptor acquisition rejects a Google identity revoked after its access token was issued", async ({ page }) => {
  const { service, accountId, draftId } = await fixture(page);
  const path = `/api/lessons/${draftId}/package/descriptor?version=2000-01-01T00:00:00Z`;
  expect((await page.request.get(path)).status()).toBe(404);
  expect((await service.auth.admin.updateUserById(accountId, { app_metadata: { provider: "email", providers: ["email"] } })).error).toBeNull();
  expect((await page.request.get(path)).status()).toBe(401);
});

test("descriptor finds required assets beyond a page of retained failed-attempt copies", async ({ page }) => {
  test.setTimeout(60_000);
  const { service, draftId, sourcePath, verifiedPath } = await fixture(page);
  const stale = Array.from({ length: 1000 }, (_, index) => `${verifiedPath.slice(0, verifiedPath.lastIndexOf("/") + 1)}${String(index).padStart(64, "0")}.mp3`);
  try {
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await page.request.post(`/api/admin/drafts/${draftId}/publish`)).status()).toBe(200);
    // Real Storage objects model leftovers of earlier attempts at this draft.
    for (let offset = 0; offset < stale.length; offset += 16) {
      const uploaded = await Promise.all(stale.slice(offset, offset + 16).map(path => service.storage.from("lesson-audio").upload(path, bytes, { contentType: "audio/mpeg" })));
      expect(uploaded.every(result => result.error === null)).toBe(true);
    }
    const row = await service.from("lesson_drafts").select("published_at").eq("id", draftId).single();
    const response = await page.request.get(`/api/lessons/${draftId}/package/descriptor?version=${encodeURIComponent(row.data!.published_at)}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).audio).toEqual([{ assetId: `001.mp3:${digest}`, phraseNumber: 1, mimeType: "audio/mpeg", size: 14, sha256: digest }]);
  } finally {
    await service.storage.from("lesson-audio").remove(stale);
    await service.storage.from("lesson-audio").remove([sourcePath, verifiedPath]);
  }
});

test("a delayed retained upload cannot leave an orphan after lesson deletion completes", async ({ page }) => {
  const { service, draftId, sourcePath, verifiedPath } = await fixture(page);
  let releaseUpload!: () => void;
  let reachedUpload!: () => void;
  const held = new Promise<void>(resolve => { releaseUpload = resolve; });
  const reached = new Promise<void>(resolve => { reachedUpload = resolve; });
  const delayed = createClient(process.env.SUPABASE_INTEGRATION_URL!, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      if (init?.method === "POST" && String(input).endsWith(verifiedPath)) {
        reachedUpload();
        await held;
      }
      return fetch(input, init);
    } },
  });
  let upload: ReturnType<ReturnType<typeof delayed.storage.from>["upload"]> | undefined;
  try {
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    upload = delayed.storage.from("lesson-audio").upload(verifiedPath, bytes, { contentType: "audio/mpeg", upsert: false });
    await reached;
    const deletion = await page.request.delete(`/api/admin/lessons/${draftId}`, { data: { confirmTitle: "Verified publication", expectedDraftId: draftId } });
    expect(deletion.status()).toBe(200);
    expect((await service.from("lesson_drafts").select("id").eq("id", draftId)).data).toEqual([]);
    releaseUpload();
    expect((await upload).error).not.toBeNull();
    expect((await service.storage.from("lesson-audio").download(verifiedPath)).error).not.toBeNull();
    expect((await service.storage.from("lesson-audio").list(`${verifiedPath.slice(0, verifiedPath.lastIndexOf("/"))}`)).data).toEqual([]);
  } finally {
    releaseUpload();
    await upload;
    await service.storage.from("lesson-audio").remove([sourcePath, verifiedPath]);
  }
});

test("deletion waits for the verified-object insert transaction's aggregate lock", async ({ page }) => {
  const { service, draftId, sourcePath, verifiedPath } = await fixture(page);
  const config = readFileSync(join(process.env.SUPABASE_TEST_WORKDIR ?? process.cwd(), "supabase/config.toml"), "utf8");
  const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("Local Supabase project ID missing");
  const args = ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];
  const query = (sql: string) => execFileSync("docker", [...args, "-c", sql], { encoding: "utf8" }).trim();
  expect(verifiedPath).toMatch(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/verified\/[a-f0-9]{64}\.mp3$/);
  const holder = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const exited = new Promise<void>(resolve => holder.once("close", () => resolve()));
  let holderOutput = "", holderError = "";
  const held = new Promise<number>((resolve, reject) => {
    holder.stdout.on("data", chunk => {
      holderOutput += String(chunk);
      const marker = /HELD:(\d+)/.exec(holderOutput);
      if (marker) resolve(Number(marker[1]));
    });
    holder.stderr.on("data", chunk => { holderError += String(chunk); });
    holder.once("error", reject);
    holder.once("close", () => reject(new Error(`Lock fixture exited before holding its transaction: ${holderError}`)));
  });
  let deletion: Promise<APIResponse> | undefined;
  try {
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    // Metadata is inserted only inside this rollback-only test transaction. Real
    // upload/deletion operations elsewhere in this suite always use Storage APIs.
    holder.stdin.write(`BEGIN; SET LOCAL ROLE service_role;
      INSERT INTO storage.objects (bucket_id, name, metadata)
      VALUES ('lesson-audio', '${verifiedPath}', '{"size":14,"mimetype":"audio/mpeg"}');
      SELECT 'HELD:' || pg_backend_pid();\n`);
    const pid = await held;
    deletion = page.request.delete(`/api/admin/lessons/${draftId}`, { data: { confirmTitle: "Verified publication", expectedDraftId: draftId } });
    await expect.poll(() => Number(query(`SELECT count(*) FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid));`))).toBeGreaterThan(0);
    expect((await service.from("lesson_drafts").select("deletion_started_at").eq("id", draftId).single()).data?.deletion_started_at).toBeNull();
    holder.stdin.end("ROLLBACK;\n\\q\n");
    await exited;
    expect((await deletion).status()).toBe(200);
    expect((await service.storage.from("lesson-audio").list(verifiedPath.slice(0, verifiedPath.lastIndexOf("/")))).data).toEqual([]);
    expect((await service.from("lesson_drafts").select("id").eq("id", draftId)).data).toEqual([]);
  } finally {
    if (!holder.stdin.destroyed) holder.stdin.end("ROLLBACK;\n\\q\n");
    await exited;
    await deletion;
    await service.storage.from("lesson-audio").remove([sourcePath, verifiedPath]);
  }
});

test("verified writes and moves respect deletion markers without affecting another bucket", async ({ page }) => {
  const { service, accountId, draftId, sourcePath, verifiedPath } = await fixture(page);
  const alternatePath = verifiedPath.replace(digest, "0".repeat(64));
  const movedPath = `${accountId}/${draftId}/moved.mp3`;
  const otherBucket = `verified-guard-${draftId}`;
  try {
    expect((await service.storage.createBucket(otherBucket, { public: false })).error).toBeNull();
    expect((await service.storage.from("lesson-audio").upload(sourcePath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await service.storage.from("lesson-audio").upload(verifiedPath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await service.storage.from("lesson-audio").move(verifiedPath, movedPath)).error).not.toBeNull();
    expect((await service.storage.from("lesson-audio").move(sourcePath, alternatePath)).error).not.toBeNull();
    expect((await service.storage.from("lesson-audio").move(verifiedPath, verifiedPath, { destinationBucket: otherBucket })).error).not.toBeNull();
    const marked = await service.rpc("begin_lesson_deletion", {
      p_lesson_id: draftId, p_admin_id: accountId, p_expected_draft_id: draftId, p_confirm_title: "Verified publication",
    });
    expect(marked.error).toBeNull();
    expect((await service.storage.from("lesson-audio").upload(alternatePath, bytes, { contentType: "audio/mpeg", upsert: false })).error).not.toBeNull();
    expect((await service.storage.from("lesson-audio").upload(verifiedPath, bytes, { contentType: "audio/mpeg", upsert: true })).error).not.toBeNull();
    // The same shape in an unrelated private bucket is outside this guard.
    expect((await service.storage.from(otherBucket).upload(verifiedPath, bytes, { contentType: "audio/mpeg" })).error).toBeNull();
    expect((await page.request.delete(`/api/admin/lessons/${draftId}`, { data: { confirmTitle: "Verified publication", expectedDraftId: draftId } })).status()).toBe(200);
    expect((await service.storage.from("lesson-audio").download(verifiedPath)).error).not.toBeNull();
    const unrelated = await service.storage.from(otherBucket).download(verifiedPath);
    expect(Buffer.from(await unrelated.data!.arrayBuffer())).toEqual(bytes);
  } finally {
    await service.storage.from("lesson-audio").remove([sourcePath, verifiedPath, alternatePath, movedPath]);
    await service.storage.from(otherBucket).remove([verifiedPath]);
    await service.storage.deleteBucket(otherBucket);
  }
});
