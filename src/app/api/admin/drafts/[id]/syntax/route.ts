import { authorizeAdminMutation, getAdminIdentity } from "@/lib/admin-auth";
import { getSentenceSyntaxProgress, runSentenceSyntaxBatch, SyntaxStorageError } from "@/lib/sentence-syntax-repository";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function failure(error: unknown) {
  return Response.json({ error: error instanceof SyntaxStorageError ? error.message : "구문 분석 상태를 확인하지 못했습니다. 다시 시도해 주세요." },
    { status: error instanceof SyntaxStorageError ? error.status : 503, headers });
}
export async function GET(_request: Request, context: Context) {
  const admin = await getAdminIdentity();
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "invalid-id" }, { status: 400, headers });
  try { return Response.json(await getSentenceSyntaxProgress(admin, id), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const admin = await authorizeAdminMutation(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  if (!validId(id)) return Response.json({ error: "invalid-id" }, { status: 400, headers });
  // Query switch keeps this endpoint body-free and makes retries explicit.
  const retry = new URL(request.url).searchParams.get("retry") === "failed";
  try { return Response.json(await runSentenceSyntaxBatch(admin, id, retry), { headers }); }
  catch (error) { return failure(error); }
}
