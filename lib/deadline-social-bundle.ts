import type { GrantValueInput } from "@/lib/grant-value";
import { deadlineSocialContent, socialExcerpt } from "@/lib/deadline-social-content";
import { deadlinePostDate } from "@/lib/deadline-social-image";
export const SOCIAL_EXPORT_LIMIT = 25;
export type SocialGrant = GrantValueInput & {
  id: string; name: string; funder: string | null; deadline: string | null;
  description?: string | null; eligibility?: string | null; objectives?: string | null;
  applicationUrl?: string | null; currency?: string | null; regions?: string[]; sectors?: string[]; applicantTypes?: string[];
};
export function socialGrantDetails(grant: SocialGrant) {
  const date = deadlinePostDate(grant.deadline);
  const link = `https://www.grantscopilot.com/grants/${encodeURIComponent(grant.id)}`;
  const { award, whoQualifies, help } = deadlineSocialContent(grant);
  const caption = `${grant.name}\n${grant.funder ? `Funder: ${grant.funder}\n` : ""}Deadline: ${date.day} ${date.year}\n${award}\n\n${socialExcerpt(grant.description, 600)}\n\nWHO CAN APPLY\n${socialExcerpt(whoQualifies, 1200)}\n\nHOW GRANTSCOPILOT HELPS\n${help}\n\nExplore this opportunity: ${link}\nCheck eligibility, funding terms and the exact closing time with the funder before applying.\n\nPowered by GrantsCopilot\nhttps://www.grantscopilot.com\n#GrantFunding #BusinessFunding #GrantsCopilot`;
  const slug = grant.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60).replace(/-$/, "") || "grant";
  return { ...grant, award, whoQualifies, help, link, caption, filename: `${slug}-${grant.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 45)}` };
}
export function socialDetailsCsv(rows: ReturnType<typeof socialGrantDetails>[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const fields = ["name", "funder", "deadline", "award", "whoQualifies", "help", "regions", "sectors", "applicantTypes", "description", "eligibility", "objectives", "applicationUrl", "link", "caption"] as const;
  return "\uFEFF" + [fields.join(","), ...rows.map(row => fields.map(field => cell(row[field])).join(","))].join("\r\n");
}
