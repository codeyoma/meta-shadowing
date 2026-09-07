import "server-only";
import { readFile } from "node:fs/promises";
import { JWT } from "google-auth-library";
import type { SyntaxLanguage } from "./sentence-syntax";

export type GoogleSyntaxResponse = {
  language: string;
  sentences: { text: { content: string; beginOffset: number } }[];
  tokens: {
    text: { content: string; beginOffset: number };
    lemma: string;
    partOfSpeech: { tag: string; [feature: string]: unknown };
    dependencyEdge: { headTokenIndex: number; label: string };
  }[];
};
export class SyntaxProviderError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function hasGoogleSyntaxCredentials() {
  return Boolean(process.env.GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY?.trim()
    || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
}

const syntaxUrl = "https://language.googleapis.com/v1/documents:analyzeSyntax";
let serviceAccount: { path: string; client: Promise<JWT> } | undefined;

async function readServiceAccount(path: string): Promise<JWT> {
  let contents: string;
  try { contents = await readFile(path, "utf8"); }
  catch { throw new SyntaxProviderError("credentials-unavailable"); }
  let account: unknown;
  try { account = JSON.parse(contents); }
  catch { throw new SyntaxProviderError("invalid-credentials"); }
  if (!account || typeof account !== "object" || !("type" in account) || account.type !== "service_account"
    || !("client_email" in account) || typeof account.client_email !== "string" || !account.client_email.trim()
    || !("private_key" in account) || typeof account.private_key !== "string" || !account.private_key.trim()) {
    throw new SyntaxProviderError("invalid-credentials");
  }
  // Accept only the service account's signing fields. Other credential types,
  // executable configurations and custom token endpoints are not loaded.
  return new JWT({
    email: account.client_email, key: account.private_key,
    keyId: "private_key_id" in account && typeof account.private_key_id === "string" ? account.private_key_id : undefined,
    scopes: ["https://www.googleapis.com/auth/cloud-language"],
    transporterOptions: { timeout: 10_000, retry: false, retryConfig: { retry: 0 } }
  });
}

async function authenticationHeaders(): Promise<Record<string, string>> {
  const key = process.env.GOOGLE_CLOUD_NATURAL_LANGUAGE_API_KEY?.trim();
  if (key) return { "x-goog-api-key": key };
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!path) throw new SyntaxProviderError("not-configured");
  if (serviceAccount?.path !== path) {
    const client = readServiceAccount(path);
    serviceAccount = { path, client };
    // A corrected/missing file can be retried. Valid clients cache and refresh
    // access tokens through Google's library for the lifetime of this process.
    void client.catch(() => { if (serviceAccount?.client === client) serviceAccount = undefined; });
  }
  const client = await serviceAccount.client;
  try {
    const headers = await client.getRequestHeaders(syntaxUrl);
    const authorization = headers.get("authorization");
    if (!authorization) throw new Error("Missing authorization");
    return { Authorization: authorization };
  } catch {
    // Library errors can contain signed assertions and request details.
    throw new SyntaxProviderError("google-auth");
  }
}

function validResponse(value: unknown, text: string): value is GoogleSyntaxResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as GoogleSyntaxResponse;
  if (typeof response.language !== "string" || !Array.isArray(response.sentences)
    || !response.sentences.length || !Array.isArray(response.tokens) || !response.tokens.length) return false;
  const validText = (part: { content: string; beginOffset: number }) => part
    && typeof part.content === "string" && part.content.length > 0
    && Number.isInteger(part.beginOffset) && part.beginOffset >= 0
    && text.slice(part.beginOffset, part.beginOffset + part.content.length) === part.content;
  return response.sentences.every(sentence => validText(sentence.text))
    && response.tokens.every(token => validText(token.text) && typeof token.lemma === "string"
      && typeof token.partOfSpeech?.tag === "string" && typeof token.dependencyEdge?.label === "string"
      && Number.isInteger(token.dependencyEdge.headTokenIndex)
      && token.dependencyEdge.headTokenIndex >= 0 && token.dependencyEdge.headTokenIndex < response.tokens.length);
}

export async function analyzeSentence(text: string, language: SyntaxLanguage): Promise<GoogleSyntaxResponse> {
  if (!hasGoogleSyntaxCredentials()) throw new SyntaxProviderError("not-configured");
  if (Array.from(text).length > 20_000) throw new SyntaxProviderError("sentence-too-long");
  const headers = await authenticationHeaders();
  let response: Response;
  try {
    response = await fetch(syntaxUrl, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ document: { type: "PLAIN_TEXT", content: text, language }, encodingType: "UTF16" }),
      cache: "no-store", signal: AbortSignal.timeout(12_000)
    });
  } catch (error) {
    throw new SyntaxProviderError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "network");
  }
  if (!response.ok) throw new SyntaxProviderError(`google-${response.status}`);
  const payload: unknown = await response.json().catch(() => null);
  if (!validResponse(payload, text)) throw new SyntaxProviderError("invalid-response");
  return payload;
}
