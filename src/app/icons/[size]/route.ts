import { appIcon } from "../../app-icon";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [180, 192, 512].map(size => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!["180", "192", "512"].includes(size)) return new Response(null, { status: 404 });
  return appIcon(Number(size));
}
