import type { ProgressRecord, CompletionRecord, Journal } from "./learning-records";

export type PracticeLease = { accountId: string; record: ProgressRecord & Partial<CompletionRecord>; generation: number; revision: number; leaseUntil: string };
export type CloudJournal = Journal & { accountId: string };
type Ownership = { accountId: string; instance: string; runId: string; generation: number };
export type PracticeCommand =
  | { action: "start"; accountId: string; instance: string; operation: string; lessonId: string; lessonVersion: string; level: number; stage: number }
  | (Ownership & { action: "renew" | "release" })
  | (Ownership & { action: "checkpoint"; operation: string; revision: number; kind: "studied" | "advance" | "jump"; nextUnit: number; activeMs: number; confirmedCycles?: number });
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer = (value: unknown, min = 0) => typeof value === "number" && Number.isSafeInteger(value) && value >= min;
export function parsePracticeCommand(value: unknown): PracticeCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const common = ["action", "accountId", "instance"];
  if (!uuid(v.accountId) || !uuid(v.instance)) return null;
  let keys: string[];
  if (v.action === "start") {
    keys = [...common, "operation", "lessonId", "lessonVersion", "level", "stage"];
    if (!uuid(v.operation) || !uuid(v.lessonId) || typeof v.lessonVersion !== "string" || !Number.isFinite(Date.parse(v.lessonVersion))
      || !integer(v.level, 1) || Number(v.level) > 3 || !integer(v.stage, 1) || Math.ceil(Number(v.stage) / 2) !== v.level) return null;
  } else {
    keys = [...common, "runId", "generation"];
    if (!uuid(v.runId) || !integer(v.generation, 1)) return null;
    if (v.action === "checkpoint") {
      keys.push("operation", "revision", "kind", "nextUnit", "activeMs", "confirmedCycles");
      if (!uuid(v.operation) || !integer(v.revision) || !integer(v.nextUnit) || !integer(v.activeMs)
        || !["studied", "advance", "jump"].includes(String(v.kind))
        || (v.kind === "advance" && ![3, 5].includes(Number(v.confirmedCycles)))) return null;
    } else if (v.action !== "renew" && v.action !== "release") return null;
  }
  return Object.keys(v).every(key => keys.includes(key)) ? value as PracticeCommand : null;
}

const errorCodes = ["temporary-error", "unauthorized", "account-changed", "session-busy", "ownership-lost", "lesson-version-changed", "operation-conflict", "revision-conflict", "run-completed", "mode-unavailable", "invalid-command", "not-found"] as const;
export type PracticeErrorCode = typeof errorCodes[number];
export class PracticeError extends Error {
  public code: PracticeErrorCode;
  constructor(code: unknown) {
    const known = errorCodes.find(value => value === code) ?? "temporary-error";
    super(known);
    this.code = known;
  }
}
export async function sendPractice(command: PracticeCommand): Promise<PracticeLease> {
  try {
    const response = await fetch("/api/learner/practice", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command), signal: AbortSignal.timeout(10000), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new PracticeError(result.error ?? "temporary-error");
    if (result.accountId !== command.accountId) throw new PracticeError("account-changed");
    return result;
  } catch (error) {
    throw error instanceof PracticeError ? error : new PracticeError("temporary-error");
  }
}
