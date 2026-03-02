import { NextResponse } from "next/server";
import {
  syncGrantsFromFeed,
  syncGrantsFromGrantsGov,
  syncGrantsFromUK,
  syncGrantsFromEU,
  upsertGrant,
  parseGrantRow,
  type GrantInput,
} from "@/lib/grants-ingest";

const GRANTS_IMPORT_SECRET = process.env.GRANTS_IMPORT_SECRET;

function auth(request: Request): boolean {
  if (!GRANTS_IMPORT_SECRET?.length) return false;
  const header = request.headers.get("x-grants-import-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === GRANTS_IMPORT_SECRET;
}

/**
 * POST /api/admin/grants/import
 * Body: JSON array of grant objects { name, funder, applicationUrl, eligibility, amount?, deadline?, sectors?, regions?, externalId? }
 * Header: x-grants-import-secret: <GRANTS_IMPORT_SECRET>
 *
 * Or POST with { "syncFeed": true } to run the GRANTS_FEED_URL sync once.
 * Or POST with { "syncGrantsGov": true } to sync up to 500 from Grants.gov.
 * Or POST with { "syncUK": true } for UK curated grants, { "syncEU": true } for EU curated grants.
 * Or POST { "syncAll": true } to run feed + Grants.gov + UK + EU.
 */
export async function POST(request: Request) {
  if (!auth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body && typeof body === "object" && (body.syncFeed === true || body.syncGrantsGov === true || body.syncUK === true || body.syncEU === true || body.syncAll === true)) {
      const runAll = body.syncAll === true;
      const feedResult = (runAll || body.syncFeed === true) ? await syncGrantsFromFeed() : { synced: 0, created: 0, updated: 0 };
      const govResult = (runAll || body.syncGrantsGov === true) ? await syncGrantsFromGrantsGov(500) : { synced: 0, created: 0, updated: 0 };
      const ukResult = (runAll || body.syncUK === true) ? await syncGrantsFromUK() : { synced: 0, created: 0, updated: 0 };
      const euResult = (runAll || body.syncEU === true) ? await syncGrantsFromEU() : { synced: 0, created: 0, updated: 0 };
      const totalSynced = feedResult.synced + govResult.synced + ukResult.synced + euResult.synced;
      return NextResponse.json({
        ok: true,
        feed: feedResult,
        grantsGov: govResult,
        uk: ukResult,
        eu: euResult,
        totalSynced,
      });
    }

    const list = Array.isArray(body) ? body : body?.grants;
    if (!Array.isArray(list)) {
      return NextResponse.json(
        { error: "Body must be a JSON array of grants or { syncFeed: true }" },
        { status: 400 }
      );
    }

    const grants: GrantInput[] = [];
    for (const row of list) {
      const g = parseGrantRow(row);
      if (g) grants.push(g);
    }

    let created = 0;
    let updated = 0;
    for (const g of grants) {
      const { created: c } = await upsertGrant(g);
      if (c) created++;
      else updated++;
    }

    return NextResponse.json({
      ok: true,
      imported: grants.length,
      created,
      updated,
    });
  } catch (e) {
    console.error("[admin/grants/import]", e);
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
