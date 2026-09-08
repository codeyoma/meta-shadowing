import { NextResponse } from "next/server";

export const authNoStoreHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export function learnerAuthRedirect(path: "/" | "/languages" | `/login?error=${string}`) {
  // Relative Location preserves the browser origin behind Next's proxy/bind
  // address. All callers supply fixed application paths, never user input.
  return new NextResponse(null, { status: 303, headers: { ...authNoStoreHeaders, Location: path } });
}

export function sameOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const supplied = new URL(origin);
    const actual = new URL(request.url);
    // Next's internal request hostname can differ from the browser's loopback
    // hostname. Compare against Host, never an untrusted forwarded host.
    const host = request.headers.get("host") ?? actual.host;
    return supplied.origin === origin && supplied.host === host
      && supplied.protocol === actual.protocol ? supplied.origin : null;
  } catch {
    return null;
  }
}
