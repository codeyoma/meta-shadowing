import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.argv[2]);
if (process.env.ADMIN_SUPABASE_INTEGRATION !== "1" || !Number.isInteger(port) || port < 1024 || port > 65534) {
  throw new Error("This HTTPS server is only for local production integration tests on an explicit unprivileged port.");
}

// Keep production Secure cookies intact without installing a trusted certificate
// or changing the host's TLS settings. Playwright trusts only this test context.
const certificateDirectory = mkdtempSync(join(tmpdir(), "meta-shadowing-test-tls-"));
let credentials;
try {
  const key = join(certificateDirectory, "key.pem");
  const cert = join(certificateDirectory, "cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", key, "-out", cert
  ], { stdio: "ignore" });
  credentials = { key: readFileSync(key), cert: readFileSync(cert) };
} finally {
  rmSync(certificateDirectory, { recursive: true, force: true });
}

const require = createRequire(import.meta.url);
const next = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port + 1)
], { stdio: "inherit" });

const server = createServer(credentials, (incoming, outgoing) => {
  const upstream = request({
    hostname: "127.0.0.1",
    port: port + 1,
    path: incoming.url,
    method: incoming.method,
    headers: {
      ...incoming.headers,
      "x-forwarded-proto": "https",
      "x-forwarded-host": incoming.headers.host
    }
  }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(503);
    outgoing.end("Local production server is starting or unavailable.");
  });
  incoming.on("aborted", () => upstream.destroy());
  outgoing.on("close", () => { if (!outgoing.writableFinished) upstream.destroy(); });
  incoming.pipe(upstream);
});

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  server.closeAllConnections();
  if (next.exitCode !== null || next.signalCode !== null) process.exit(exitCode);
  next.once("exit", () => process.exit(exitCode));
  next.kill("SIGTERM");
  setTimeout(() => { next.kill("SIGKILL"); process.exit(1); }, 5000).unref();
}

next.once("error", error => { console.error(error.message); stop(1); });
next.once("exit", code => { if (!stopping) stop(code ?? 1); });
server.once("error", error => { console.error(error.message); stop(1); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
server.listen(port, "127.0.0.1", () => console.log(`Local production HTTPS: https://127.0.0.1:${port}`));
