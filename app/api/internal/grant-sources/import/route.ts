import { NextResponse } from "next/server";
import { GrantSourceImportError, importGrantSourcesFromPayload } from "@/lib/grant-source-import";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

function auth(request: Request): boolean {
  const secret = request.headers.get("x-internal-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(INTERNAL_SECRET && secret === INTERNAL_SECRET);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!auth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  try {
    const result = await importGrantSourcesFromPayload(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GrantSourceImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Grant source import failed" },
      { status: 500 }
    );
  }
}
