import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-auth";
import { parseGrantRow, upsertGrant } from "@/lib/grants-ingest";

const CSV_HEADER_MAP: Record<string, string> = {
  name: "name",
  title: "title",
  funder: "funder",
  applicationurl: "applicationUrl",
  "application url": "applicationUrl",
  url: "url",
  eligibility: "eligibility",
  description: "description",
  amount: "amount",
  deadline: "deadline",
  externalid: "externalId",
  "external id": "externalId",
  id: "id",
  sectors: "sectors",
  sector: "sectors",
  regions: "regions",
  region: "regions",
  applicanttypes: "applicantTypes",
  "applicant types": "applicantTypes",
  funderlocations: "funderLocations",
  "funder locations": "funderLocations",
};

function normalizeCsvHeader(header: string): string {
  const k = header.trim().toLowerCase().replace(/\s+/g, " ");
  return CSV_HEADER_MAP[k] ?? CSV_HEADER_MAP[k.replace(/\s/g, "")] ?? header.trim();
}

/**
 * Parse CSV text into array of objects. First row = headers.
 * Handles quoted cells and maps array-like columns (sectors, regions, etc.) to string[].
 */
function parseCsvToRows(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const rawHeaders = parseCsvLine(headerLine);
  const headers = rawHeaders.map((h) => normalizeCsvHeader(h));
  const arrayColumns = new Set(["sectors", "regions", "applicanttypes", "applicantTypes", "funderlocations", "funderLocations"]);

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((key, idx) => {
      if (!key) return;
      let value: unknown = cells[idx] ?? "";
      if (typeof value === "string") value = value.trim();
      if (arrayColumns.has(key) && typeof value === "string" && value) {
        value = value.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
      }
      row[key] = value;
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let cell = "";
      while (i < line.length) {
        if (line[i] === '"') {
          i++;
          if (line[i] === '"') {
            cell += '"';
            i++;
          } else break;
        } else {
          cell += line[i];
          i++;
        }
      }
      out.push(cell);
      if (line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      const end = comma === -1 ? line.length : comma;
      out.push(line.slice(i, end).replace(/^"|"$/g, "").trim());
      i = end + (comma === -1 ? 0 : 1);
    }
  }
  return out;
}

/**
 * POST /api/admin/grants/import-file
 * Auth: session, must be admin (no x-grants-import-secret).
 * Body: multipart/form-data with "file" (CSV or JSON).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const allowed = await isAdmin();
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const text = await file.text();
    const name = (file.name || "").toLowerCase();
    let list: unknown[];

    if (name.endsWith(".json")) {
      const parsed = JSON.parse(text);
      list = Array.isArray(parsed) ? parsed : parsed?.grants ?? [];
    } else if (name.endsWith(".csv") || file.type === "text/csv") {
      list = parseCsvToRows(text);
    } else {
      return NextResponse.json(
        { error: "Unsupported format. Use a .csv or .json file." },
        { status: 400 }
      );
    }

    const grants = list
      .map((row) => parseGrantRow(row))
      .filter((g): g is NonNullable<typeof g> => g != null);

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
      skipped: list.length - grants.length,
    });
  } catch (e) {
    console.error("[admin/grants/import-file]", e);
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
