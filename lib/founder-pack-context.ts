export const MAX_FOUNDER_PACK_GRANT_CONTEXT_CHARS = 14_000;

function grantFromJoin(row: Record<string, unknown>): Record<string, unknown> {
  const grantRaw = row.Grant ?? row.grant;
  const g = Array.isArray(grantRaw) ? grantRaw[0] : grantRaw;
  return g && typeof g === "object" ? (g as Record<string, unknown>) : {};
}

function reasonsSnippet(reasons: unknown): string {
  if (!Array.isArray(reasons)) return "";
  return reasons
    .slice(0, 12)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join("; ")
    .slice(0, 1800);
}

function criteriaSnippet(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .slice(0, 14)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join("; ")
    .slice(0, 1400);
}

function formatApplicationGrantBlock(app: Record<string, unknown>): string {
  const g = grantFromJoin(app);
  const name = String(g.name ?? "Grant");
  const funder = String(g.funder ?? "").trim();
  const elig = String(g.eligibility ?? "").trim().slice(0, 4500);
  const desc = String(g.description ?? "").trim().slice(0, 2000);
  const obj = String(g.objectives ?? "").trim().slice(0, 2000);
  const lines = [
    `Source: workspace application`,
    `Application ID: ${String(app.id)} (status: ${String(app.status ?? "unknown")})`,
    `Grant ID: ${String(app.grantId ?? app.grant_id ?? "")}`,
    `Grant: ${name}`,
    funder ? `Funder: ${funder}` : "",
    elig ? `Published eligibility:\n${elig}` : "",
    desc ? `Description (excerpt):\n${desc}` : "",
    obj ? `Objectives (excerpt):\n${obj}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatEligibilityGrantBlock(row: Record<string, unknown>): string {
  const g = grantFromJoin(row);
  const name = String(g.name ?? "Grant");
  const funder = String(g.funder ?? "").trim();
  const elig = String(g.eligibility ?? "").trim().slice(0, 4500);
  const summary = String(row.summary ?? "").trim().slice(0, 2800);
  const decision = String(row.decision ?? "").trim();
  const score = row.score != null ? Number(row.score) : null;
  const reasons = reasonsSnippet(row.reasons);
  const missing = criteriaSnippet(row.missing_criteria);
  const met = criteriaSnippet(row.met_criteria);
  const lines = [
    `Source: eligibility match (no application started yet in GrantsCopilot)`,
    `Grant ID: ${String(row.grant_id ?? "")}`,
    `Grant: ${name}`,
    funder ? `Funder: ${funder}` : "",
    Number.isFinite(score) ? `Cached eligibility score: ${score}%` : "",
    decision ? `Assessment band: ${decision.replace(/_/g, " ")}` : "",
    summary ? `Assessment summary:\n${summary}` : "",
    reasons ? `Reasoning highlights:\n${reasons}` : "",
    met ? `Criteria appearing met:\n${met}` : "",
    missing ? `Gaps / work needed:\n${missing}` : "",
    elig ? `Published eligibility:\n${elig}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatStandaloneGrantBlock(grant: Record<string, unknown>): string {
  const name = String(grant.name ?? "Grant");
  const funder = String(grant.funder ?? "").trim();
  const elig = String(grant.eligibility ?? "").trim().slice(0, 4500);
  const desc = String(grant.description ?? "").trim().slice(0, 2500);
  const obj = String(grant.objectives ?? "").trim().slice(0, 2000);
  const deadline = grant.deadline ? `Deadline: ${String(grant.deadline)}` : "";
  const lines = [
    `Source: selected grant context`,
    `Grant ID: ${String(grant.id ?? "")}`,
    `Grant: ${name}`,
    funder ? `Funder: ${funder}` : "",
    deadline,
    elig ? `Published eligibility:\n${elig}` : "",
    desc ? `Description (excerpt):\n${desc}` : "",
    obj ? `Objectives (excerpt):\n${obj}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function assembleFounderPackGrantContext(
  applications: Record<string, unknown>[],
  eligibilityRows: Record<string, unknown>[],
  standaloneGrants: Record<string, unknown>[],
  extraNotes?: string | null
): string | undefined {
  const parts: string[] = [];
  const coveredGrantIds = new Set<string>();

  for (const app of applications) {
    const gid = String(app.grantId ?? app.grant_id ?? "").trim();
    if (gid) coveredGrantIds.add(gid);
    parts.push(formatApplicationGrantBlock(app));
  }

  for (const row of eligibilityRows) {
    const gid = String(row.grant_id ?? "").trim();
    if (!gid) continue;
    if (coveredGrantIds.has(gid)) continue;
    coveredGrantIds.add(gid);
    parts.push(formatEligibilityGrantBlock(row));
  }

  for (const grant of standaloneGrants) {
    const gid = String(grant.id ?? "").trim();
    if (!gid || coveredGrantIds.has(gid)) continue;
    coveredGrantIds.add(gid);
    parts.push(formatStandaloneGrantBlock(grant));
  }

  const notes = extraNotes?.trim();
  if (notes) {
    parts.push(`Founder-supplied grant / funder requirements, form questions, or pasted criteria:\n${notes}`);
  }

  const joined = parts.filter(Boolean).join("\n\n---\n\n").trim();
  return joined.length > 0 ? joined : undefined;
}
