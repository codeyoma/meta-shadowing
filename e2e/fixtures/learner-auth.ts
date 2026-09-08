import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const FAKE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only_google_learner_auth";

const JWT_SECRET = "test-only-supabase-auth-secret-keep-out-of-production";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const ISSUED_AT = 1_700_000_000;
const EXPIRES_AT = 4_102_444_800;
const FIXTURE_DATE = "2023-11-14T22:13:20.000Z";

type StorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax";
  }>;
  origins: [];
};

type JwtClaims = {
  aal: "aal1";
  amr: Array<{ method: "oauth"; timestamp: number }>;
  app_metadata: { provider: "google"; providers: ["google"] };
  aud: "authenticated";
  email: "learner@example.com";
  exp: number;
  iat: number;
  is_anonymous: false;
  iss: string;
  role: "authenticated";
  session_id: string;
  sub: string;
  user_metadata: ReturnType<typeof createUserMetadata>;
};

function createUserMetadata() {
  return {
    avatar_url: "https://example.com/test-learner.png",
    email: "learner@example.com",
    email_verified: true,
    full_name: "Test Learner",
    iss: "https://accounts.google.com",
    name: "Test Learner",
    picture: "https://example.com/test-learner.png",
    provider_id: "test-google-provider-id",
    sub: "test-google-provider-id"
  } as const;
}

function createUser() {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "learner@example.com",
    email_confirmed_at: FIXTURE_DATE,
    phone: "",
    confirmed_at: FIXTURE_DATE,
    last_sign_in_at: FIXTURE_DATE,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: createUserMetadata(),
    identities: [],
    created_at: FIXTURE_DATE,
    updated_at: FIXTURE_DATE,
    is_anonymous: false
  };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signJwt(claims: JwtClaims): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson(claims);
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function createClaims(authUrl: string): JwtClaims {
  return {
    aal: "aal1",
    amr: [{ method: "oauth", timestamp: ISSUED_AT }],
    app_metadata: { provider: "google", providers: ["google"] },
    aud: "authenticated",
    email: "learner@example.com",
    exp: EXPIRES_AT,
    iat: ISSUED_AT,
    is_anonymous: false,
    iss: `${authUrl}/auth/v1`,
    role: "authenticated",
    session_id: SESSION_ID,
    sub: USER_ID,
    user_metadata: createUserMetadata()
  };
}

function createSession(authUrl: string) {
  return {
    access_token: signJwt(createClaims(authUrl)),
    token_type: "bearer",
    expires_in: EXPIRES_AT - ISSUED_AT,
    expires_at: EXPIRES_AT,
    refresh_token: "test-only-google-refresh-token",
    user: createUser()
  };
}

export function createLearnerAuthStorageState(appUrl: string, authUrl: string): StorageState {
  const app = new URL(appUrl);
  const auth = new URL(authUrl);
  const storageKey = `sb-${auth.hostname.split(".")[0]}-auth-token`;
  const cookieValue = `base64-${Buffer.from(JSON.stringify(createSession(auth.origin)), "utf8").toString("base64url")}`;

  return {
    cookies: [{
      name: storageKey,
      value: cookieValue,
      domain: app.hostname,
      path: "/",
      expires: EXPIRES_AT,
      httpOnly: false,
      secure: app.protocol === "https:",
      sameSite: "Lax"
    }],
    origins: []
  };
}

function requestOrigin(request: IncomingMessage): string | null {
  const host = request.headers.host;
  return host ? `http://${host}` : null;
}

function verifyJwt(token: string, expectedIssuer: string): boolean {
  const segments = token.split(".");
  if (segments.length !== 3) return false;
  const [header, payload, signature] = segments as [string, string, string];
  const expected = createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown };
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<JwtClaims>;
    return decodedHeader.alg === "HS256" &&
      claims.iss === expectedIssuer &&
      claims.aud === "authenticated" &&
      claims.role === "authenticated" &&
      claims.sub === USER_ID &&
      typeof claims.exp === "number" &&
      claims.exp > Date.now() / 1_000;
  } catch {
    return false;
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { location, "cache-control": "no-store" });
  response.end();
}

function isLoopbackCallback(value: string): boolean {
  try {
    const callback = new URL(value);
    return callback.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(callback.hostname);
  } catch {
    return false;
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 16_384) return null;
    chunks.push(buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function matchesChallenge(verifier: string, challenge: string): boolean {
  const actual = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createFakeSupabaseAuthServer(_authUrl?: string): Server {
  const pendingCodes = new Map<string, string>();

  return createServer(async (request, response) => {
    const origin = requestOrigin(request);
    const url = origin && request.url ? new URL(request.url, origin) : null;

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
        "access-control-allow-methods": "GET, POST, OPTIONS"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && url?.pathname === "/auth/v1/health") {
      json(response, 200, { version: "test-only", name: "fake-supabase-auth" });
      return;
    }

    if (request.method === "GET" && ["/.well-known/jwks.json", "/auth/v1/.well-known/jwks.json"].includes(url?.pathname ?? "")) {
      json(response, 200, { keys: [] });
      return;
    }

    if (request.method === "GET" && url?.pathname === "/auth/v1/user") {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
      if (!origin || !verifyJwt(token, `${origin}/auth/v1`)) {
        json(response, 401, { code: 401, error_code: "bad_jwt", msg: "Invalid JWT" });
        return;
      }
      json(response, 200, createUser());
      return;
    }

    if (request.method === "GET" && url?.pathname === "/auth/v1/authorize") {
      const provider = url.searchParams.get("provider");
      const redirectTo = url.searchParams.get("redirect_to") ?? "";
      const challenge = url.searchParams.get("code_challenge") ?? "";
      const challengeMethod = url.searchParams.get("code_challenge_method")?.toLowerCase();
      if (provider !== "google" || !isLoopbackCallback(redirectTo) ||
          !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || challengeMethod !== "s256") {
        json(response, 400, {
          error: "invalid_request",
          error_description: "The test provider requires Google, a loopback callback, and S256 PKCE."
        });
        return;
      }

      const callback = new URL(redirectTo);
      if (url.searchParams.get("mode") === "cancel" || url.searchParams.get("test_mode") === "cancel") {
        callback.searchParams.set("error", "access_denied");
        callback.searchParams.set("error_code", "provider_cancelled");
        callback.searchParams.set("error_description", "The test user cancelled Google sign-in.");
        redirect(response, callback.toString());
        return;
      }

      const code = `test-google-${createHash("sha256")
        .update(`${redirectTo}\0${challenge}`)
        .digest("base64url")
        .slice(0, 32)}`;
      pendingCodes.set(code, challenge);
      callback.searchParams.set("code", code);
      redirect(response, callback.toString());
      return;
    }

    if (request.method === "POST" && url?.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") !== "pkce") {
        json(response, 400, { error: "unsupported_grant_type", error_description: "Only PKCE is supported." });
        return;
      }
      const body = await readJsonBody(request);
      const code = typeof body?.auth_code === "string" ? body.auth_code : "";
      const verifier = typeof body?.code_verifier === "string" ? body.code_verifier : "";
      const challenge = pendingCodes.get(code);
      if (challenge) pendingCodes.delete(code);
      if (!origin || !challenge || !verifier || !matchesChallenge(verifier, challenge)) {
        json(response, 400, { error: "invalid_grant", error_description: "Invalid or expired PKCE authorization code." });
        return;
      }
      json(response, 200, createSession(origin));
      return;
    }

    json(response, 404, { error: "not_found" });
  });
}

export async function startFakeSupabaseAuthServer(port: number): Promise<Server> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid fake Supabase Auth port: ${port}`);
  }
  const server = createFakeSupabaseAuthServer(`http://127.0.0.1:${port}`);
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}
