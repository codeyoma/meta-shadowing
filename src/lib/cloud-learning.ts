import "server-only";

// Server-only, opt-in release switch. Off means stop entry and writes; never
// restore browser learning storage. Enable only after the cutover checklist.
export function cloudLearningEnabled(): boolean {
  return process.env.CLOUD_LEARNING_ENABLED === "1";
}
