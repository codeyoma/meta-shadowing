import { createHmac, timingSafeEqual } from "node:crypto";

export const LEARNER_COOKIE_NAME = "meta_shadowing_learner";
export const LEARNER_SESSION_MS = 30 * 24 * 60 * 60 * 1_000;

type LearnerCookiePayload = {
  expiresAt: number;
  version: 1;
};

function toBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLearnerCookie(secret: string, now = Date.now()): string {
  const payload = toBase64Url(
    JSON.stringify({ expiresAt: now + LEARNER_SESSION_MS, version: 1 } satisfies LearnerCookiePayload)
  );

  return `${payload}.${sign(payload, secret)}`;
}

export function verifyLearnerCookie(cookie: string | undefined, secret: string, now = Date.now()): boolean {
  if (!cookie) return false;

  const [payload, signature, extra] = cookie.split(".");
  if (!payload || !signature || extra) return false;

  const expected = sign(payload, secret);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) return false;

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as Partial<LearnerCookiePayload>;
    return parsed.version === 1 && typeof parsed.expiresAt === "number" && parsed.expiresAt > now;
  } catch {
    return false;
  }
}

export function hasValidSharedPassword(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}
