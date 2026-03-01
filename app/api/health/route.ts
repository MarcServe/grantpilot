import { NextResponse } from "next/server";

/**
 * Production health check for load balancers and monitoring.
 * GET /api/health → 200 { status: "ok" }
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
