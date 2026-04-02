import { NextResponse, NextRequest } from "next/server";
import { backfillMissingEmbeddings } from "@/lib/embeddings";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillMissingEmbeddings();
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Generated embeddings for ${result.grants} grants and ${result.profiles} profiles`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backfill failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
