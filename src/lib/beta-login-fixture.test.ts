// @vitest-environment node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request } from "@playwright/test";
import { expect, test } from "vitest";
import { loginBeta } from "../../e2e/fixtures/beta-login";

async function withServer(handler: (req: IncomingMessage, res: ServerResponse) => void, run: (client: Awaited<ReturnType<typeof request.newContext>>) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server missing");
  const client = await request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
  try { await run(client); }
  finally {
    await client.dispose();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test("beta setup recovers one reset and retains the returned cookie", async () => {
  let attempts = 0;
  await withServer((req, res) => {
    if (++attempts === 1) { req.socket.destroy(); return; }
    res.setHeader("Set-Cookie", "beta-fixture=accepted; Path=/; HttpOnly");
    res.end();
  }, async client => {
    await loginBeta(client);
    expect((await client.storageState()).cookies).toEqual([expect.objectContaining({ name: "beta-fixture", value: "accepted" })]);
  });
  expect(attempts).toBe(2);
});

for (const status of [401, 500]) test(`beta setup does not retry HTTP ${status}`, async () => {
  let attempts = 0;
  await withServer((_req, res) => { attempts++; res.statusCode = status; res.end(); }, async client => {
    await expect(loginBeta(client)).rejects.toThrow(`Beta fixture login failed (${status})`);
  });
  expect(attempts).toBe(1);
});

test("beta setup fails after a second reset without retrying the test", async () => {
  let attempts = 0;
  await withServer(req => { attempts++; req.socket.destroy(); }, async client => {
    await expect(loginBeta(client)).rejects.toThrow();
  });
  expect(attempts).toBe(2);
});
