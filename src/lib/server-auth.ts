import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LEARNER_COOKIE_NAME, verifyLearnerCookie } from "./auth";

export function readAuthEnvironment(): { password: string; secret: string } | null {
  const password = process.env.BETA_PASSWORD;
  const secret = process.env.LEARNER_COOKIE_SECRET;
  return password && secret ? { password, secret } : null;
}

export async function requireLearner(): Promise<void> {
  if (!(await hasLearnerAccess())) redirect("/");
}

export async function hasLearnerAccess(): Promise<boolean> {
  const config = readAuthEnvironment();
  const cookie = (await cookies()).get(LEARNER_COOKIE_NAME)?.value;
  return Boolean(config && verifyLearnerCookie(cookie, config.secret));
}
