// Configuration preflight only: never prints values or contacts a hosted project.
const env = process.env;
const errors = [];
const required = ["BETA_PASSWORD", "LEARNER_COOKIE_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
for (const name of required) if (!env[name]?.trim()) errors.push(`${name}: required`);

if (env.BETA_PASSWORD && env.BETA_PASSWORD.length < 12) errors.push("BETA_PASSWORD: use at least 12 characters");
if (env.LEARNER_COOKIE_SECRET && env.LEARNER_COOKIE_SECRET.length < 32) errors.push("LEARNER_COOKIE_SECRET: use at least 32 random characters");
if (env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
  } catch { errors.push("NEXT_PUBLIC_SUPABASE_URL: use the hosted HTTPS API origin"); }
}
if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: use a modern publishable key, never a secret key");
if (env.SUPABASE_SECRET_KEY && !env.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) errors.push("SUPABASE_SECRET_KEY: use a modern server-only secret key");

for (const [name, value] of Object.entries(env)) {
  if (/^(ADMIN_TEST_|SUPABASE_INTEGRATION_)/.test(name) || name === "ADMIN_SUPABASE_INTEGRATION") errors.push(`${name}: remove test configuration before release`);
  if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
  let serviceRole = false;
  try { serviceRole = JSON.parse(Buffer.from(value.split(".")[1] ?? "", "base64url").toString()).role === "service_role"; } catch { /* Not a legacy JWT key. */ }
  if (value.startsWith("sb_secret_") || serviceRole || /SECRET|SERVICE_ROLE|PASSWORD|COOKIE/.test(name)) errors.push(`${name}: server credentials must not be public`);
}

if (errors.length) {
  console.error(`Release environment check failed:\n${errors.map(error => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Release environment shape check passed. Hosted credentials, policies and deployment still require live verification.");
}
