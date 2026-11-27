/**
 * READ-ONLY grant data-quality report.
 *
 * Lists the Grant rows affected by the ingestion fixes and what the fix does to
 * each. It only issues SELECTs (plus one GET to the public IFS competition
 * search); it never inserts, updates or deletes. Apply any cleanup separately,
 * after review.
 *
 *   npx tsx scripts/report-grant-data-quality.ts [--out report.md] [--json report.json] [--all]
 *
 * By default only rows that can currently surface as open are considered
 * (deadline today or later, or no deadline; url_status not dead/expired).
 * --all includes every row.
 */

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  getGrantDataQualityIssue,
  grantIdentityKey,
  grantRecordStrength,
  isSameGrantIdentity,
  nameSimilarity,
  type GrantDataQualityIssueCode,
} from "../lib/grant-data-quality";
import { isIfsUrl, isUnlistedInnovateUkCompetition, loadIfsCompetitionIndex, reconcileIfsCompetitionUrls } from "../lib/ifs-competitions";
import { isPastGrantDeadline } from "../lib/grant-freshness";

type Row = {
  id: string;
  name: string;
  funder: string;
  deadline: string | null;
  applicationUrl: string;
  detailUrl: string | null;
  directApplicationUrl: string | null;
  applicationUrlQuality: string | null;
  source: string | null;
  externalId: string | null;
  url_status: string | null;
  createdAt: string | null;
};

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const includeAll = args.includes("--all");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required (read-only use)");
const db = createClient(url, key, { auth: { persistSession: false } });

async function loadGrants(): Promise<Row[]> {
  const out: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("Grant")
      .select("id,name,funder,deadline,applicationUrl,detailUrl,directApplicationUrl,applicationUrlQuality,source,externalId,url_status,createdAt")
      .order("createdAt", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function applicationCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("Application").select("grantId").in("grantId", ids.slice(i, i + 200));
    if (error) continue;
    for (const r of (data ?? []) as Array<{ grantId: string }>) counts.set(r.grantId, (counts.get(r.grantId) ?? 0) + 1);
  }
  return counts;
}

const isOpenNow = (g: Row) => !isPastGrantDeadline(g.deadline) && g.url_status !== "dead" && g.url_status !== "expired";
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 110);

/** Discovery ids are slugs of the first name seen; a very different current name means the row was overwritten. */
function hijackedName(g: Row): string | null {
  const id = g.externalId ?? "";
  if (!id.startsWith("discovery-") || /^discovery-[0-9a-f]{32}$/.test(id)) return null;
  const slug = id.slice("discovery-".length);
  const compactSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = g.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  if (words.length === 0) return null;
  const found = words.filter((w) => compactSlug.includes(w)).length;
  // Fewer than a third of the current name's words appear in the original slug.
  return found / words.length < 0.34 && nameSimilarity({ name: slug.replace(/-/g, " "), funder: "" }, g) < 0.2 ? slug : null;
}

async function main() {
  const all = await loadGrants();
  const scope = includeAll ? all : all.filter(isOpenNow);
  const ifsIndex = await loadIfsCompetitionIndex();

  // 1. IFS competition links
  const ifsFixes: Array<{ g: Row; changes: string[]; after: Pick<Row, "applicationUrl" | "detailUrl" | "directApplicationUrl" | "deadline"> }> = [];
  const ifsUnlisted: Row[] = [];
  const fixed = new Map<string, Row>();
  if (ifsIndex) {
    for (const g of scope) {
      const touches = [g.applicationUrl, g.detailUrl, g.directApplicationUrl].some(isIfsUrl) || /innovate uk|ukri/i.test(`${g.funder} ${g.name}`);
      if (!touches) continue;
      const { grant, changes } = reconcileIfsCompetitionUrls(g, ifsIndex);
      if (changes.length) {
        ifsFixes.push({ g, changes, after: grant });
        fixed.set(g.id, grant);
      }
      if (isUnlistedInnovateUkCompetition(grant, ifsIndex)) ifsUnlisted.push(g);
    }
  }
  /** Row as it would look after the IFS link fix; used to pick duplicate keepers. */
  const view = (g: Row) => fixed.get(g.id) ?? g;

  // 2. Record-level quality issues (kept out of matches / rejected at ingestion)
  const issues = new Map<GrantDataQualityIssueCode, Array<{ g: Row; message: string }>>();
  for (const g of scope) {
    const issue = getGrantDataQualityIssue(view(g));
    if (!issue) continue;
    if (!issues.has(issue.code)) issues.set(issue.code, []);
    issues.get(issue.code)!.push({ g, message: issue.message });
  }

  // 3. Duplicate clusters (same identity, compatible deadlines)
  const byKey = new Map<string, Row[]>();
  for (const g of scope) {
    const k = grantIdentityKey(g);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(g);
  }
  const clusters: Row[][] = [];
  for (const rows of byKey.values()) {
    if (rows.length < 2) continue;
    const remaining = [...rows];
    while (remaining.length) {
      const seed = remaining.shift()!;
      const group = [seed];
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (group.every((m) => isSameGrantIdentity(m, remaining[i]))) group.push(remaining.splice(i, 1)[0]);
      }
      if (group.length > 1) clusters.push(group);
    }
  }
  const rank = (a: Row, b: Row) => grantRecordStrength(view(b)) - grantRecordStrength(view(a)) || String(a.createdAt).localeCompare(String(b.createdAt));
  clusters.forEach((c) => c.sort(rank));
  clusters.sort((a, b) => b.length - a.length);
  const dupIds = clusters.flatMap((c) => c.slice(1).map((g) => g.id));
  const apps = await applicationCounts([...new Set([...dupIds, ...clusters.map((c) => c[0].id)])]);

  // 4. Rows renamed by the old URL-match overwrite
  const hijacked = scope.map((g) => ({ g, slug: hijackedName(g) })).filter((x) => x.slug);

  const lines: string[] = [];
  const total = (n: number) => `${n} row${n === 1 ? "" : "s"}`;
  lines.push(`# Grant data-quality report (read-only)`, "");
  lines.push(`Generated ${new Date().toISOString()} · ${all.length} grants in DB · ${scope.length} in scope (${includeAll ? "all rows" : "currently surfaceable: deadline not passed, link not dead/expired"})`, "");
  lines.push(`Nothing was written. Each section states what the ingestion fix does for new data and the proposed one-off action for existing rows, which needs explicit approval before it is run.`, "");
  lines.push(`| Section | Rows | Proposed action for existing rows |`, `|---|---|---|`);
  lines.push(`| 1. IFS competition links | ${ifsFixes.length} | Rewrite links to the IFS-listed competition (or drop unlisted IFS links) |`);
  lines.push(`| 1b. Innovate UK, not listed on IFS, no deadline | ${ifsUnlisted.length} | Rejected at ingestion now; propose url_status=expired for existing rows |`);
  for (const [code, list] of issues) lines.push(`| 2. ${code} | ${list.length} | Hide from matches (already enforced by \`isGrantActionableNow\`); optionally mark url_status=expired |`);
  lines.push(`| 3. Duplicate clusters | ${clusters.length} clusters / ${dupIds.length} extra rows | Keep the strongest row, repoint Applications, retire the rest |`);
  lines.push(`| 4. Renamed by URL-match overwrite | ${hijacked.length} | Review; externalId no longer describes the row |`, "");

  lines.push(`## 1. Innovate UK IFS competition links`, "");
  lines.push(ifsIndex ? `Live IFS index: ${ifsIndex.competitions.length} open/upcoming competitions.` : `IFS index could not be loaded; section skipped.`, "");
  if (ifsFixes.length) {
    lines.push(`| id | name | source | before (applicationUrl) | after (applicationUrl / detailUrl) | changes |`, `|---|---|---|---|---|---|`);
    for (const { g, changes, after } of ifsFixes) {
      lines.push(`| ${g.id} | ${cell(g.name)} | ${g.source} | ${cell(g.applicationUrl)} | ${cell(after.applicationUrl)} / ${cell(after.detailUrl)} | ${cell(changes.join("; "))} |`);
    }
  }
  lines.push("");

  lines.push(`### 1b. AI-discovered Innovate UK records not listed on IFS and without a deadline (${total(ifsUnlisted.length)})`, "");
  if (ifsUnlisted.length) {
    lines.push(`| id | name | source | applicationUrl |`, `|---|---|---|---|`);
    for (const g of ifsUnlisted) lines.push(`| ${g.id} | ${cell(g.name)} | ${g.source} | ${cell(view(g).applicationUrl)} |`);
  }
  lines.push("");

  lines.push(`## 2. Records kept out of matches`, "");
  for (const [code, list] of issues) {
    lines.push(`### ${code} (${total(list.length)})`, "", list[0]?.message ?? "", "");
    lines.push(`| id | name | funder | deadline | source | applicationUrl |`, `|---|---|---|---|---|---|`);
    for (const { g } of list) lines.push(`| ${g.id} | ${cell(g.name)} | ${cell(g.funder)} | ${g.deadline?.slice(0, 10) ?? ""} | ${g.source} | ${cell(g.applicationUrl)} |`);
    lines.push("");
  }

  lines.push(`## 3. Duplicate clusters`, "", `First row in each cluster is the proposed keeper (official link > specific page > deadline > verified URL > oldest), judged after the IFS link fix; deadline/applicationUrl columns show post-fix values. "apps" = Application rows that would need repointing.`, "");
  for (const c of clusters) {
    lines.push(`### "${cell(c[0].name)}" (${c.length} rows, identity \`${grantIdentityKey(c[0])}\`)`, "");
    lines.push(`| action | id | name | funder | deadline | source | apps | applicationUrl |`, `|---|---|---|---|---|---|---|---|`);
    c.forEach((g, i) => lines.push(`| ${i === 0 ? "KEEP" : "merge→keep"} | ${g.id} | ${cell(g.name)} | ${cell(g.funder)} | ${view(g).deadline?.slice(0, 10) ?? ""} | ${g.source} | ${apps.get(g.id) ?? 0} | ${cell(view(g).applicationUrl)} |`));
    lines.push("");
  }

  lines.push(`## 4. Rows renamed by the old URL-match overwrite`, "", `Ingestion used to treat any shared URL (e.g. the IFS search page) as "same grant" and overwrite that row's name and links.`, "");
  if (hijacked.length) {
    lines.push(`| id | current name | externalId slug (original name) | applicationUrl |`, `|---|---|---|---|`);
    for (const { g, slug } of hijacked) lines.push(`| ${g.id} | ${cell(g.name)} | ${cell(slug)} | ${cell(g.applicationUrl)} |`);
  }
  lines.push("");

  const md = lines.join("\n");
  const out = argValue("--out");
  if (out) writeFileSync(out, md);
  const json = argValue("--json");
  if (json) {
    writeFileSync(json, JSON.stringify({
      generatedAt: new Date().toISOString(),
      ifsFixes: ifsFixes.map(({ g, changes, after }) => ({ id: g.id, name: g.name, changes, after })),
      issues: Object.fromEntries([...issues].map(([code, list]) => [code, list.map(({ g }) => g.id)])),
      duplicateClusters: clusters.map((c) => ({ keep: c[0].id, merge: c.slice(1).map((g) => g.id), names: c.map((g) => g.name) })),
      ifsNotListed: ifsUnlisted.map((g) => g.id),
      hijacked: hijacked.map(({ g, slug }) => ({ id: g.id, name: g.name, slug })),
    }, null, 2));
  }
  console.log(out ? `Report written to ${out}` : md);
  console.error(`IFS fixes ${ifsFixes.length}; IFS not listed ${ifsUnlisted.length}; ${[...issues].map(([c, l]) => `${c} ${l.length}`).join("; ")}; duplicate clusters ${clusters.length} (${dupIds.length} extra rows); renamed ${hijacked.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
