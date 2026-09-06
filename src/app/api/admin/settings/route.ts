import { authorizeAdminMutation } from "@/lib/admin-auth";
import { isSessionSettings } from "@/lib/session-settings";
import { updateSessionDefaults } from "@/lib/session-defaults-repository";

export async function PUT(request: Request) {
  const admin = await authorizeAdminMutation(request);
  if (admin instanceof Response) return admin;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "invalid-content-type" }, { status: 415 });
  const body = await request.text();
  if (body.length > 4096) return Response.json({ error: "settings-too-large" }, { status: 413 });
  let settings: unknown;
  try { settings = JSON.parse(body); } catch { return Response.json({ error: "invalid-json" }, { status: 400 }); }
  if (!isSessionSettings(settings)) return Response.json({ error: "설정 값과 허용 범위를 확인해 주세요." }, { status: 400 });
  try {
    await updateSessionDefaults(settings);
    return Response.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "전역 기본값을 저장하지 못했습니다." }, { status: 500 });
  }
}
