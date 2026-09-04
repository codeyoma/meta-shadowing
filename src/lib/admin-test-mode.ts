import "server-only";

export const ADMIN_TEST_COOKIE_NAME = "meta_shadowing_admin_test";

export type AdminTestEnvironment = {
  email: string;
  otp: string;
  secret: string;
};

export function readAdminTestEnvironment(): AdminTestEnvironment | null {
  if (process.env.NODE_ENV === "production" || process.env.ADMIN_TEST_MODE !== "1") return null;

  const email = process.env.ADMIN_TEST_EMAIL;
  const otp = process.env.ADMIN_TEST_OTP;
  const secret = process.env.ADMIN_TEST_SESSION_SECRET;
  return email && otp && secret ? { email, otp, secret } : null;
}
