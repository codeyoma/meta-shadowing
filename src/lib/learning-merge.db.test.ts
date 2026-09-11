// @vitest-environment node
// Opt in only for the disposable ci-clean stack: LEARNING_MERGE_DB_TEST=1.
// Uses independent PostgreSQL connections to exercise real commit/lock behavior.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mergeLearning, type LearningMerge } from "./learning-merge";
import type { AccountSnapshot, SnapshotRun } from "./account-snapshot";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";

const container = "supabase_db_meta-shadowing-ci-clean";
const args = ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
function sql(statement: string): string {
  try { return execFileSync("docker", args, { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch { throw new Error("Disposable DB query failed"); }
}
const run = (runId = "a"): SnapshotRun => ({ runId, lessonId: "fictional", lessonVersion: "2026-09-10T00:00:00Z", lessonName: "A", language: "english", level: 4, stage: 7, nextUnit: 0, nextPhrase: 0, activeMs: 0, settings: { ...DEFAULT_SESSION_SETTINGS }, confirmedCycles: 0 });
const batch = (accountId: string, runs: SnapshotRun[] = []): LearningMerge => ({ protocolVersion: 1, accountId, runs, history: [], studyDays: [] });
const auth = (accountId: string) => `set local role authenticated; set local request.jwt.claims=${quote(JSON.stringify({ sub: accountId, role: "authenticated", is_anonymous: false }))};`;
const mergeQuery = (value: LearningMerge) => `select public.merge_learning_snapshot(${quote(JSON.stringify(value))}::jsonb);`;
const read = (accountId: string): AccountSnapshot => JSON.parse(sql(`begin; ${auth(accountId)} select snapshot from public.learner_snapshots where account_id=${quote(accountId)}; commit;`));
function connection(statement: string, holdOpen = false) {
  let output = "", held!: () => void;
  const barrier = new Promise<void>(resolve => { held = resolve; });
  const process = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  process.stdout.on("data", chunk => { output += String(chunk); if (output.includes("merge-held")) held(); });
  // Never include SQL parameters, stderr, or payloads in test failures.
  process.stderr.resume();
  const done = new Promise<void>((resolve, reject) => {
    process.on("error", () => reject(new Error("Disposable DB connection failed")));
    process.on("close", code => code === 0 ? resolve() : reject(new Error("Disposable DB transaction failed")));
  });
  if (holdOpen) process.stdin.write(`${statement}\n`);
  else process.stdin.end(statement);
  const finish = (statement: "commit" | "rollback") => {
    if (!process.stdin.writableEnded && !process.stdin.destroyed) process.stdin.end(`${statement};\n`);
  };
  return { barrier, done, finish };
}

describe.skipIf(process.env.LEARNING_MERGE_DB_TEST !== "1")("disposable atomic learning merge", () => {
  beforeAll(() => {
    const ports = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .HostConfig.PortBindings}}", container], { encoding: "utf8" }));
    if (!ports["5432/tcp"]?.some((port: { HostPort: string }) => port.HostPort === "62322")) throw new Error("Refusing a non-disposable DB target");
  });
  it.each([false, true])("serializes disjoint uploads when an existing row is %s", async exists => {
    const accountId = randomUUID();
    const firstName = `merge-a-${accountId}`, secondName = `merge-b-${accountId}`;
    let first: ReturnType<typeof connection> | undefined;
    let second: ReturnType<typeof connection> | undefined;
    sql(`insert into auth.users(id) values(${quote(accountId)});`);
    try {
      if (exists) sql(`begin; ${auth(accountId)} ${mergeQuery(batch(accountId, [run("existing")]))} commit;`);
      // Keep A's input open after the merge. Only the test can commit/release it.
      first = connection(`begin; set local application_name=${quote(firstName)}; ${auth(accountId)} ${mergeQuery(batch(accountId, [run("a")]))} select 'merge-held';`, true);
      await Promise.race([first.barrier, first.done.then(() => { throw new Error("First merge closed before the release barrier"); })]);
      second = connection(`begin; set local application_name=${quote(secondName)}; ${auth(accountId)} ${mergeQuery(batch(accountId, [run("b")]))} commit;`);
      // A successful assertion proves B reached the merge and waits on A's
      // actual backend lock, for both the unique-index and existing-row paths.
      await vi.waitFor(() => expect(sql(`select exists (
        select 1 from pg_catalog.pg_stat_activity waiting
        join pg_catalog.pg_stat_activity holding on holding.application_name=${quote(firstName)}
        where waiting.application_name=${quote(secondName)}
          and waiting.wait_event_type='Lock' and holding.state='idle in transaction'
          and holding.pid = any(pg_catalog.pg_blocking_pids(waiting.pid))
          and waiting.query like '%merge_learning_snapshot%'
      );`)).toBe("t"), { timeout: 5000, interval: 25 });
      first.finish("commit");
      await Promise.all([first.done, second.done]);
      expect(read(accountId).runs.map(item => item.runId)).toEqual(exists ? ["a", "b", "existing"] : ["a", "b"]);
    } finally {
      // Failed assertions also release the barrier before removing the fixture.
      first?.finish("rollback"); second?.finish("rollback");
      await Promise.allSettled([first?.done, second?.done]);
      sql(`delete from auth.users where id=${quote(accountId)};`);
    }
  }, 10000);
  it("matches the TypeScript reference across permutations, Unicode, grouped settings, normalized completions and retries", () => {
    const accountId = randomUUID();
    sql(`insert into auth.users(id) values(${quote(accountId)});`);
    try {
      const batches: LearningMerge[] = [
        { ...batch(accountId, [{ ...run(), nextPhrase: 8, nextUnit: 4, confirmedCycles: 5, activeMs: 9000 }]), studyDays: ["2026-09-10"] },
        batch(accountId, [{ ...run(), nextPhrase: 8, nextUnit: 1, settings: { ...DEFAULT_SESSION_SETTINGS, groupSize: 4 } }, run("\uE000"), run("😀")]),
        { ...batch(accountId), history: [{ ...run("completed"), completedAt: "2026-09-11T09:00:00+09:00", lessonName: "😀" }] },
        { ...batch(accountId), history: [{ ...run("completed"), completedAt: "2026-09-11T00:00:00Z", lessonName: "\uE000", activeMs: 100 }] },
        batch(accountId, [{ ...run("numeric"), settings: { ...DEFAULT_SESSION_SETTINGS, lineGapMs: 0.0000001 } }, { ...run("numeric-2"), settings: { ...DEFAULT_SESSION_SETTINGS, lineGapMs: 0.000001 } }]),
      ];
      const expected = batches.reduce<AccountSnapshot | null>(mergeLearning, null)!;
      for (const order of [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [2, 0, 4, 1, 3]]) {
        sql(`delete from public.learner_snapshots where account_id=${quote(accountId)};`);
        for (const index of [...order, ...order]) sql(`begin; ${auth(accountId)} ${mergeQuery(batches[index])} commit;`);
        expect(read(accountId)).toEqual(expected);
      }
    } finally { sql(`delete from auth.users where id=${quote(accountId)};`); }
  }, 20000);
  it("rolls back row creation and all writes if options CAS or merged capacity fails", () => {
    const accountId = randomUUID();
    sql(`insert into auth.users(id) values(${quote(accountId)});`);
    try {
      const conflict = { ...batch(accountId), options: { expectedRevision: 1, preferredLevel: 7, settings: {} } };
      expect(() => sql(`begin; ${auth(accountId)} ${mergeQuery(conflict)} commit;`)).toThrow();
      expect(sql(`select count(*) from public.learner_snapshots where account_id=${quote(accountId)};`)).toBe("0");
      const first = batch(accountId, Array.from({ length: 2000 }, (_, index) => run(String(index))));
      sql(`begin; ${auth(accountId)} ${mergeQuery(first)} commit;`);
      expect(() => sql(`begin; ${auth(accountId)} ${mergeQuery(batch(accountId, [run("extra")]))} commit;`)).toThrow();
      expect(read(accountId).runs).toHaveLength(2000);
    } finally { sql(`delete from auth.users where id=${quote(accountId)};`); }
  }, 20000);
});
