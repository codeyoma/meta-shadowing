import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { assertLocalSupabaseUrl, promoteLocalSessionToGoogle } from "./local-supabase-google";
import { parseLessonDraft } from "../../src/lib/lesson-draft-parser";
import { testAudioManifest } from "./audio";
import { fixtureVersion } from "./cloud-journal";
import { lessons as fixtureLessons } from "../../src/lib/lessons";

// Stable fixture URLs for the presentation regression suite. The runner uses one
// worker; each test owns and removes its rows, and all learning writes use SQL.
export const lessonIds = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
export const lessons = fixtureLessons.map((lesson, index) => ({ ...lesson, id: lessonIds[index], version: fixtureVersion, phraseCount: [3,10,3][index] }));
const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Authenticate the disposable fixture user through real administrator OTP. */
export async function signInFixtureAdmin(page: Page) {
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const response = await page.request.get("/api/learner/preferences");
  expect(response.status()).toBe(200);
  const { profile } = await response.json();
  const updated = await service.auth.admin.updateUserById(profile.accountId, { app_metadata: { role: "admin", provider: "google", providers: ["google"] } });
  expect(updated.error).toBeNull();
  const email = updated.data.user!.email!;
  const link = await service.auth.admin.generateLink({ type: "magiclink", email });
  expect(link.error).toBeNull();
  expect((await page.request.post("/api/admin/auth/verify", { data: { email, token: link.data.properties!.email_otp } })).status()).toBe(200);
  // Email OTP replaces provider claims. Restore trusted local Google claims
  // after verification so the same admin can also open learner-only routes.
  const origin = new URL(response.url()).origin;
  const client = createServerClient(url, process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!, { cookies: {
    getAll: () => page.context().cookies(),
    setAll: async values => { await page.context().addCookies(values.map(value => ({ name: value.name, value: value.value, url: origin, sameSite: "Lax" as const }))); },
  } });
  await promoteLocalSessionToGoogle(url, service, client, profile.accountId, "admin");
}

export const test = base.extend<{ profileMetadata: Record<string, string> }>({
  profileMetadata: [{}, { option: true }],
  context: async ({ context, baseURL, profileMetadata }, use) => {
    const url = process.env.SUPABASE_INTEGRATION_URL!;
    assertLocalSupabaseUrl(url);
    const key = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY!;
    const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, options);
    const email = `cloud-ui-${randomUUID()}@example.com`, password = randomUUID();
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: profileMetadata });
    if (created.error || !created.data.user) throw created.error ?? new Error("Fixture user missing");
    const id = created.data.user.id;
    try {
      const client = createClient(url, key, options);
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw signedIn.error;
      const session = await promoteLocalSessionToGoogle(url, service, client, id, "learner");
      const cookies = createServerClient(url, key, { cookies: { getAll: () => [], setAll: async values => {
        await context.addCookies(values.map(value => ({ name: value.name, value: value.value, url: baseURL!, sameSite: "Lax" as const })));
      } } });
      await cookies.auth.setSession(session);
      const scripts = [
        ["Morning Routine", "english", "I wake up at seven.\nI wash my face.\nI brush my teeth.", "나는 일곱 시에 일어난다.\n나는 세수를 한다.\n나는 이를 닦는다."],
        ["Daily Conversation", "english", "## At home\nI open the window.\nYou make breakfast.\nWe sit at the table.\nShe pours the tea.\nThey enjoy the morning.\n\nHe takes the bus.\nWe reach the office.\n## At work\nI read my messages.\nYou plan the day.\nWe start the meeting.", "## 집에서\n나는 창문을 연다.\n너는 아침을 준비한다.\n우리는 식탁에 앉는다.\n그녀는 차를 따른다.\n그들은 아침을 즐긴다.\n\n그는 버스를 탄다.\n우리는 사무실에 도착한다.\n## 직장에서\n나는 메시지를 읽는다.\n너는 하루를 계획한다.\n우리는 회의를 시작한다."],
        ["東京の散歩", "japanese", "私は 七時に 起きます。\n顔を洗います。\n歯を 磨きます。", "나는 일곱 시에 일어난다.\n나는 세수를 한다.\n나는 이를 닦는다."],
      ];
      const rows = scripts.map(([title, language, target, korean], index) => {
        const { entries } = parseLessonDraft(target, korean);
        const count = entries.filter(entry => entry.kind === "phrase").length;
        return { id: lessonIds[index], created_by: id, title, language, target_filename: "en.txt", korean_filename: "ko.txt", target_source: target, korean_source: korean, parsed_entries: entries,
          validation_status: "validated", publication_status: "published", published_at: fixtureVersion,
          phrase_count: count, chapter_count: entries.filter(entry => entry.kind === "chapter").length, section_count: 0, audio_manifest: testAudioManifest(count) };
      });
      const seeded = await service.from("lesson_drafts").insert(rows);
      if (seeded.error) throw seeded.error;
      // Presentation regressions start from an account with its first book
      // selected. Fresh-account/null-selection behavior has dedicated UI tests.
      const preferences = await service.from("learner_preferences").insert({ user_id: id, study_timezone: "Asia/Seoul", selection: { language: "english", lessonId: lessonIds[0] } });
      if (preferences.error) throw preferences.error;
      await use(context);
    } finally {
      // Delete only rows owned by this disposable user, even if fixture setup failed.
      await service.from("lesson_drafts").delete().eq("created_by", id);
      await service.auth.admin.deleteUser(id);
    }
  },
});

export { expect };
export type * from "@playwright/test";
