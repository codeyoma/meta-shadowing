// @ts-expect-error Node 24 runs this fixture directly and requires the explicit .ts extension.
import { startFakeSupabaseAuthServer } from "./learner-auth.ts";

const port = Number(process.argv[2] ?? process.env.PLAYWRIGHT_AUTH_PORT ?? "3001");

startFakeSupabaseAuthServer(port).then((server) => {
  console.log(`Fake Supabase Auth listening on http://127.0.0.1:${port}`);
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not start fake Supabase Auth.");
  process.exitCode = 1;
});
