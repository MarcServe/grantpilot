import { ImageResponse } from "next/og";

export type DeadlinePostGrant = { name: string; funder: string | null; deadline: string | null };
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
  const height = format === "portrait" ? 1350 : 1080;
  const titleSize = grant.name.length > 220 ? 34 : grant.name.length > 150 ? 40 : grant.name.length > 85 ? 48 : 60;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 70, background: "linear-gradient(145deg, #041d38 0%, #0c315b 70%, #134c77 100%)", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 42, fontWeight: 700 }}>Grants<span style={{ color: "#73b6ff" }}>Copilot</span></div>
        <div style={{ display: "flex", border: "1px solid #5d8cb9", borderRadius: 40, padding: "12px 22px", fontSize: 23, color: "#b9d8f6" }}>GRANT DEADLINE</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: format === "portrait" ? 115 : 60 }}>
        <div style={{ display: "flex", fontSize: 28, color: "#80e1bc", letterSpacing: 5 }}>MARK YOUR CALENDAR</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 94, fontWeight: 700, letterSpacing: -3 }}>{date.day}</div>
        <div style={{ display: "flex", fontSize: 46, color: "#a6c6e9" }}>{date.year}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40, paddingTop: 35, borderTop: "2px solid #31577c" }}>
        <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, lineHeight: 1.16, overflowWrap: "break-word" }}>{grant.name}</div>
        {grant.funder && <div style={{ display: "flex", marginTop: 22, fontSize: grant.funder.length > 110 ? 24 : 30, lineHeight: 1.3, color: "#b9d8f6" }}>{grant.funder}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", paddingTop: 35 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px", borderRadius: 16, background: "#2468e8" }}>
          <span style={{ fontSize: 29, fontWeight: 700 }}>Find your funding opportunity</span>
          <span style={{ fontSize: 27 }}>grantscopilot.com</span>
        </div>
        <div style={{ display: "flex", fontSize: 20, lineHeight: 1.4, color: "#a6c6e9", marginTop: 22 }}>Powered by GrantsCopilot · grantscopilot.com. Verify eligibility and closing time with the funder.</div>
      </div>
    </div>,
    { width: 1080, height },
  );
}
