import "server-only";

// Deliberately server-only and opt-in. Do not enable for beta until the cloud
// progress, takeover, and storage-cutover tickets have shipped.
export function cloudLearningEnabled(): boolean {
  return process.env.CLOUD_LEARNING_ENABLED === "1";
}
