// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ database: vi.fn(), analyze: vi.fn(), configured: vi.fn() }));
vi.mock("./supabase/secret", () => ({ createSecretSupabaseClient: mocks.database }));
vi.mock("./admin-test-mode", () => ({ readAdminTestEnvironment: () => null }));
vi.mock("./google-syntax", async importOriginal => ({
  ...await importOriginal<typeof import("./google-syntax")>(), analyzeSentence: mocks.analyze, hasGoogleSyntaxCredentials: mocks.configured
}));
import { getSentenceSyntaxProgress, runSentenceSyntaxBatch } from "./sentence-syntax-repository";
import { SyntaxProviderError } from "./google-syntax";

const admin = { id: "owner", email: "admin@example.com" };
const draft = { id: "draft", lesson_id: "draft", language: "english", deletion_started_at: null,
  parsed_entries: [{ kind: "phrase", sourceLine: 1, phraseNumber: 1, target: "Hello.", korean: "안녕." }] };
const row = { id: "job", draft_id: "draft", text_content: "Hello.", text_hash: "hash", language_code: "en", analyzer_version: "google-v1-utf16", status: "processing", lease_id: "lease-token" };
const providerResult = { language: "en", sentences: [{ text: { content: "Hello.", beginOffset: 0 } }], tokens: [] };
type Query = { table: string; operation: string; value?: unknown; filters: unknown[][]; options?: unknown };

function database(responses: unknown[], claimed = [row]) {
  const queries: Query[] = [];
  const client = {
    from(table: string) {
      const query: Query = { table, operation: "select", filters: [] };
      queries.push(query);
      const builder = {
        select() { return builder; },
        eq(...values: unknown[]) { query.filters.push(values); return builder; },
        maybeSingle() { return builder; }, order() { return builder; }, range() { return builder; }, limit() { return builder; },
        upsert(value: unknown, options: unknown) { query.operation = "upsert"; query.value = value; query.options = options; return builder; },
        update(value: unknown) { query.operation = "update"; query.value = value; return builder; },
        then(resolve: (result: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: responses.shift(), error: null }).then(resolve); }
      };
      return builder;
    },
    rpc: vi.fn().mockResolvedValue({ data: claimed, error: null })
  };
  mocks.database.mockReturnValue(client);
  return { client, queries };
}
beforeEach(() => { vi.clearAllMocks(); mocks.configured.mockReturnValue(true); mocks.analyze.mockResolvedValue(providerResult); });

describe("durable sentence processing", () => {
  it("checks draft ownership before allowing service-role access", async () => {
    const { queries, client } = database([null]);
    await expect(runSentenceSyntaxBatch(admin, "someone-elses-draft")).rejects.toMatchObject({ status: 404 });
    expect(queries[0].filters).toContainEqual(["created_by", "owner"]);
    expect(queries).toHaveLength(1);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("persists pending sentences without making a provider call when no key is set", async () => {
    mocks.configured.mockReturnValue(false);
    const { queries, client } = database([draft, null, [{ status: "pending", error_code: null }]]);
    expect(await runSentenceSyntaxBatch(admin, "draft")).toMatchObject({ configured: false, pending: 1, complete: 0 });
    expect(queries[1].options).toEqual({ onConflict: "draft_id,phrase_number,sentence_number", ignoreDuplicates: true });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
  it("reuses a completed identical sentence and stores it only under the current lease", async () => {
    const { queries } = database([draft, null, [{ response: providerResult }], null, [{ status: "complete", error_code: null }]]);
    expect(await runSentenceSyntaxBatch(admin, "draft")).toMatchObject({ complete: 1, pending: 0 });
    expect(mocks.analyze).not.toHaveBeenCalled();
    const save = queries.find(query => query.operation === "update")!;
    expect(save.value).toMatchObject({ status: "complete", response: providerResult, lease_id: null });
    expect(save.filters).toContainEqual(["lease_id", "lease-token"]);
    expect(save.filters).toContainEqual(["status", "processing"]);
  });
  it("persists a provider failure for explicit retry without returning raw errors", async () => {
    mocks.analyze.mockRejectedValue(new SyntaxProviderError("google-429"));
    const { queries } = database([draft, null, [], null, [{ status: "failed", error_code: "google-429" }]]);
    expect(await runSentenceSyntaxBatch(admin, "draft")).toMatchObject({ failed: 1, errors: ["google-429"] });
    expect(queries.find(query => query.operation === "update")?.value).toMatchObject({ status: "failed", error_code: "google-429" });
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });
  it("reports unseeded work as pending so a saved draft can recover from an initialization failure", async () => {
    const { queries } = database([draft, []]);
    expect(await getSentenceSyntaxProgress(admin, "draft")).toMatchObject({ total: 1, pending: 1 });
    expect(queries.every(query => query.operation === "select")).toBe(true);
  });
});
