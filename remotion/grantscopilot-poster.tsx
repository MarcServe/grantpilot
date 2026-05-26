import { AbsoluteFill, Img, staticFile } from "remotion";

const colors = {
  ink: "#0b1b36",
  blue: "#2f6bed",
  green: "#35c785",
  muted: "#53627a",
  line: "#d9e3f3",
  white: "#ffffff",
};

export const GrantsCopilotPoster = () => {
  return (
    <AbsoluteFill
      style={{
        fontFamily: "Inter, Arial, sans-serif",
        background: "linear-gradient(135deg, #f8fbff 0%, #eef5ff 52%, #f7fff9 100%)",
        padding: 110,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Img src={staticFile("logogc.png")} style={{ width: 88, height: 88, objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: 42, fontWeight: 900, color: colors.ink }}>
            Grants<span style={{ color: colors.blue }}>Copilot</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: colors.ink }}>
            Find it. Fill it. Fund it. <span style={{ color: colors.green }}>Apply on autopilot.</span>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr", gap: 80, alignItems: "center", flex: 1 }}>
        <div>
          <div style={{ fontSize: 98, lineHeight: 0.96, fontWeight: 950, letterSpacing: -4, color: colors.ink }}>
            Find Grants.
            <br />
            <span style={{ color: colors.blue }}>Check Eligibility.</span>
            <br />
            <span style={{ color: colors.green }}>Get Funded.</span>
          </div>
          <p style={{ marginTop: 36, maxWidth: 780, fontSize: 34, lineHeight: 1.32, fontWeight: 650, color: colors.ink }}>
            AI-powered grant discovery, Business DNA scoring, and funder-ready application preparation.
          </p>
        </div>
        <div
          style={{
            borderRadius: 36,
            background: colors.white,
            border: `1px solid ${colors.line}`,
            boxShadow: "0 36px 100px rgba(7,29,58,0.16)",
            padding: 38,
          }}
        >
          {[
            ["Daily grant discovery", "RSS, web, AI search and admin sources"],
            ["Eligibility scoring", "Suggested, within reach, and clear gaps"],
            ["Application prep", "Answers, documents, decks and reminders"],
          ].map(([title, body]) => (
            <div key={title} style={{ borderBottom: `1px solid ${colors.line}`, padding: "24px 0" }}>
              <div style={{ fontSize: 31, fontWeight: 900, color: colors.ink }}>{title}</div>
              <div style={{ marginTop: 8, fontSize: 23, lineHeight: 1.32, color: colors.muted }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
