import { NextResponse } from "next/server";
import {
  createLearnerCookie,
  hasValidSharedPassword,
  LEARNER_COOKIE_NAME,
  LEARNER_SESSION_MS
} from "@/lib/auth";
import { readAuthEnvironment } from "@/lib/server-auth";

export async function POST(request: Request): Promise<NextResponse> {
  const config = readAuthEnvironment();
  if (!config) return NextResponse.json({ authenticated: false }, { status: 503 });

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 400 });
  }

  if (!hasValidSharedPassword(password, config.password)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: LEARNER_COOKIE_NAME,
    value: createLearnerCookie(config.secret),
    httpOnly: true,
    maxAge: LEARNER_SESSION_MS / 1_000,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
