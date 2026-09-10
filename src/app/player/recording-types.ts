import type { ProgressRecord, CompletionRecord, RunSelection } from "@/lib/learning-records";
import type { SessionSettings } from "@/lib/session-settings";

/** Server-confirmed inputs and commands shared by the audio and rapid players. */
export type LearningStart = { selection: RunSelection; progress: ProgressRecord | null; completion: CompletionRecord | null; confirmedCycles?: number };
export type RecordUpdate = {
  active?: boolean;
  elapsedMs?: number;
  checkpoint?: { unit: number; phrase: number };
  finished?: boolean;
  settings?: Partial<SessionSettings>;
  studied?: boolean;
  kind?: "studied" | "advance" | "jump" | "line" | "settings";
  confirmedCycles?: number;
};
export type CloudRecording = {
  local?: boolean;
  completion: CompletionRecord | null;
  blocked: boolean;
  canAct: () => boolean;
  verifyResume: () => Promise<boolean>;
  updateRecord: (update: RecordUpdate) => void | Promise<void>;
  exit: (href: string) => void;
};
