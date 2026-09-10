import type { APIRequestContext } from "@playwright/test";

/** Set only the disposable beta-gate cookie, never learner progress or identity. */
export async function loginBeta(request: APIRequestContext) {
  const response = await request.post("/api/auth", {
    data: { password: "integration-beta-password" },
    // This endpoint only issues a gate cookie. Retry one transport reset, not
    // HTTP errors, timeouts, account writes, or the surrounding test.
    maxRetries: 1,
    timeout: 5_000,
  });
  if (response.status() !== 200) throw new Error(`Beta fixture login failed (${response.status()})`);
}
