import { ImageResponse } from "next/og";
import { deadlineSocialContent, socialExcerpt, type SocialContentGrant } from "@/lib/deadline-social-content";
export type DeadlinePostGrant = SocialContentGrant;
export function deadlinePostDate(deadline: string | null) {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) throw new Error("A confirmed deadline date is required to create a post.");
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid deadline date.");
  return {
    day: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(date),
    year: new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/London" }).format(date),
  };
}
export function createDeadlinePost(grant: DeadlinePostGrant, format: "square" | "portrait") {
  const date = deadlinePostDate(grant.deadline);
  const portrait = format === "portrait";
  const info = deadlineSocialContent(grant);
  const title = socialExcerpt(grant.name, portrait ? 180 : 120);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 54, background: "linear-gradient(145deg, #041d38 0%, #0c315b 70%, #134c77 100%)", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>Grants<span style={{ color: "#73b6ff" }}>Copilot</span></div>
        <div style={{ display: "flex", border: "1px solid #5d8cb9", borderRadius: 40, padding: "10px 20px", fontSize: 22, color: "#b9d8f6" }}>FUNDING OPPORTUNITY</div>
      </div>
      <div style={{ display: "flex", marginTop: 30, fontSize: 33, color: "#80e1bc", fontWeight: 700 }}>Deadline · {date.day} {date.year}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
        <div style={{ display: "flex", fontSize: title.length > 100 ? 38 : 48, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
        {grant.funder && <div style={{ display: "flex", marginTop: 12, fontSize: 25, color: "#b9d8f6" }}>{socialExcerpt(grant.funder, 100)}</div>}
      </div>
      <div style={{ display: "flex", marginTop: 24, padding: "17px 22px", border: "1px solid #5d8cb9", borderRadius: 14, fontSize: 27, fontWeight: 700, color: "#80e1bc" }}>{info.award}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 22, padding: 24, borderRadius: 14, background: "#153d62" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: "#80e1bc", fontWeight: 700 }}>WHO CAN APPLY</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 26, lineHeight: 1.3 }}>{socialExcerpt(info.whoQualifies, portrait ? 360 : 230)}</div>
      </div>
      {portrait && grant.description && <div style={{ display: "flex", marginTop: 22, fontSize: 26, lineHeight: 1.3, color: "#b9d8f6" }}>{socialExcerpt(grant.description, 200)}</div>}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#80e1bc" }}>YOUR NEXT STEP, MADE EASIER</div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 26, lineHeight: 1.3 }}>{info.help}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", paddingTop: 24 }}>
        <div style={{ display: "flex", padding: "20px 24px", borderRadius: 14, background: "#2468e8", fontSize: 29, fontWeight: 700 }}>Explore your fit at grantscopilot.com →</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 21, color: "#b9d8f6" }}>Powered by GrantsCopilot · www.grantscopilot.com</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 18, color: "#a6c6e9" }}>Verify eligibility, funding terms and the exact closing time with the funder.</div>
      </div>
    </div>,
    { width: 1080, height: portrait ? 1350 : 1080 },
  );
}
