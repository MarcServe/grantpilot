import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ReactNode } from "react";

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;

const colors = {
  navy: "#071d3a",
  ink: "#0b1b36",
  blue: "#2f6bed",
  sky: "#dceeff",
  green: "#35c785",
  mint: "#d8f7e8",
  muted: "#53627a",
  line: "#d9e3f3",
  white: "#ffffff",
  warm: "#f7fbff",
};

type SceneProps = {
  start: number;
  duration: number;
  children: ReactNode;
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const Scene = ({ start, duration, children }: SceneProps) => {
  return (
    <Sequence from={start} durationInFrames={duration}>
      {children}
    </Sequence>
  );
};

const useSceneProgress = (start: number, duration: number) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [start, start + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const exit = interpolate(frame, [start + duration - 18, start + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  return Math.min(enter, exit);
};

const LogoLockup = ({ compact = false }: { compact?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: compact ? 14 : 18 }}>
    <Img
      src={staticFile("logogc.png")}
      style={{
        width: compact ? 72 : 92,
        height: compact ? 72 : 92,
        objectFit: "contain",
      }}
    />
    <div>
      <div style={{ fontSize: compact ? 34 : 42, fontWeight: 900, letterSpacing: -1, color: colors.ink }}>
        Grants<span style={{ color: colors.blue }}>Copilot</span>
      </div>
      <div style={{ marginTop: 3, fontSize: compact ? 16 : 18, fontWeight: 800, color: colors.ink }}>
        Find it. Fill it. Fund it. <span style={{ color: colors.green }}>Apply on autopilot.</span>
      </div>
    </div>
  </div>
);

const Badge = ({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "dark" }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "12px 18px",
      fontSize: 24,
      fontWeight: 850,
      color: tone === "green" ? "#087a4f" : tone === "dark" ? colors.white : colors.blue,
      background: tone === "green" ? colors.mint : tone === "dark" ? colors.navy : "#eaf2ff",
      border: `1px solid ${tone === "dark" ? "#173c70" : colors.line}`,
    }}
  >
    {children}
  </div>
);

const GrantCard = ({
  title,
  funder,
  score,
  delay,
}: {
  title: string;
  funder: string;
  score: string;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - delay);
  const progress = interpolate(local, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <div
      style={{
        width: 520,
        borderRadius: 24,
        padding: 30,
        background: colors.white,
        border: `1px solid ${colors.line}`,
        boxShadow: "0 24px 70px rgba(7,29,58,0.14)",
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [36, 0])}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.12, color: colors.ink }}>{title}</div>
          <div style={{ marginTop: 10, fontSize: 21, color: colors.muted }}>{funder}</div>
        </div>
        <div
          style={{
            minWidth: 92,
            height: 54,
            borderRadius: 999,
            background: colors.blue,
            color: colors.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 900,
          }}
        >
          {score}
        </div>
      </div>
      <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {["UK", "SME", "AI scored"].map((item) => (
          <span
            key={item}
            style={{
              borderRadius: 999,
              padding: "8px 12px",
              border: `1px solid ${colors.line}`,
              color: colors.ink,
              fontSize: 17,
              fontWeight: 750,
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

const FeaturePill = ({ label, delay }: { label: string; delay: number }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderRadius: 18,
        padding: "18px 22px",
        background: colors.white,
        border: `1px solid ${colors.line}`,
        opacity: progress,
        transform: `translateX(${interpolate(progress, [0, 1], [42, 0])}px)`,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: colors.mint,
          color: "#078653",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 20,
        }}
      >
        ✓
      </div>
      <div style={{ fontSize: 25, fontWeight: 850, color: colors.ink }}>{label}</div>
    </div>
  );
};

const PhonePanel = () => {
  const frame = useCurrentFrame();
  const y = interpolate(Math.sin(frame / 18), [-1, 1], [-8, 8]);
  return (
    <div
      style={{
        width: 430,
        height: 760,
        borderRadius: 52,
        padding: 22,
        background: colors.navy,
        boxShadow: "0 36px 90px rgba(7,29,58,0.24)",
        transform: `translateY(${y}px) rotate(-2deg)`,
      }}
    >
      <div style={{ height: "100%", borderRadius: 38, background: colors.white, padding: 28 }}>
        <div style={{ fontSize: 21, color: colors.muted, fontWeight: 750 }}>Today, 8:31 AM</div>
        <div style={{ marginTop: 22, fontSize: 31, lineHeight: 1.15, fontWeight: 900, color: colors.ink }}>
          New high-match grant found
        </div>
        <div style={{ marginTop: 22, borderRadius: 24, background: "#f3f7ff", padding: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: colors.ink }}>Tech for Good Programme</div>
          <div style={{ marginTop: 8, fontSize: 19, color: colors.muted }}>85% match</div>
          <div style={{ marginTop: 22, borderRadius: 999, background: colors.blue, color: colors.white, padding: "14px 18px", textAlign: "center", fontSize: 20, fontWeight: 850 }}>
            View grant and prepare
          </div>
        </div>
        <div style={{ marginTop: 28, display: "grid", gap: 14 }}>
          {["Daily email digest", "WhatsApp for 85%+ only", "Deadline reminders"].map((item) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 20, color: colors.ink }}>
              <span style={{ color: colors.green, fontWeight: 900 }}>✓</span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Background = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 78% 20%, ${colors.sky}, transparent 32%), linear-gradient(135deg, #f8fbff 0%, #eef5ff 52%, #f7fff9 100%)`,
    }}
  />
);

const HeroScene = ({ start, duration }: { start: number; duration: number }) => {
  const p = useSceneProgress(start, duration);
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <Background />
      <div style={{ position: "absolute", top: 70, left: 120 }}>
        <LogoLockup compact />
      </div>
      <div style={{ position: "absolute", left: 130, top: 240, width: 780 }}>
        <Badge>AI funding workspace for startups and SMEs</Badge>
        <div style={{ marginTop: 42, fontSize: 92, lineHeight: 0.96, fontWeight: 950, letterSpacing: -4, color: colors.ink }}>
          Find Grants.
          <br />
          <span style={{ color: colors.blue }}>Check Eligibility.</span>
          <br />
          <span style={{ color: colors.green }}>Get Funded.</span>
        </div>
        <div style={{ marginTop: 34, fontSize: 32, lineHeight: 1.35, color: colors.ink, fontWeight: 650 }}>
          GrantsCopilot automatically finds fresh grants, scores fit against your Business DNA, and prepares funder-ready documents.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 110,
          top: 255,
          width: 760,
          height: 500,
          borderRadius: 34,
          overflow: "hidden",
          background: colors.white,
          border: `1px solid ${colors.line}`,
          boxShadow: "0 36px 100px rgba(7,29,58,0.16)",
          transform: `translateX(${interpolate(p, [0, 1], [60, 0])}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile("grantcomotion.mp4")}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </AbsoluteFill>
  );
};

const DiscoverScene = ({ start, duration }: { start: number; duration: number }) => {
  const p = useSceneProgress(start, duration);
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <Background />
      <div style={{ position: "absolute", left: 120, top: 86 }}>
        <LogoLockup compact />
      </div>
      <div style={{ position: "absolute", left: 130, top: 250, width: 620 }}>
        <Badge tone="green">Daily source crawling</Badge>
        <h2 style={{ margin: "34px 0 0", fontSize: 72, lineHeight: 1.02, letterSpacing: -3, color: colors.ink }}>
          Fresh opportunities without manual searching.
        </h2>
        <p style={{ marginTop: 30, fontSize: 31, lineHeight: 1.35, color: colors.muted }}>
          RSS feeds, funder pages, AI search, and admin-added sources feed a live grant database.
        </p>
      </div>
      <div style={{ position: "absolute", right: 116, top: 180, display: "grid", gap: 24 }}>
        <GrantCard title="AI Innovation Fund" funder="Innovate UK" score="85%" delay={start + 12} />
        <GrantCard title="Tech for Good Call" funder="Nesta" score="85%" delay={start + 28} />
        <GrantCard title="Digital Growth Grant" funder="UK Government" score="80%" delay={start + 44} />
      </div>
    </AbsoluteFill>
  );
};

const DnaScene = ({ start, duration }: { start: number; duration: number }) => {
  const p = useSceneProgress(start, duration);
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <Background />
      <div style={{ position: "absolute", left: 120, top: 86 }}>
        <LogoLockup compact />
      </div>
      <div style={{ position: "absolute", left: 130, top: 240, width: 700 }}>
        <Badge>Business DNA engine</Badge>
        <h2 style={{ margin: "34px 0 0", fontSize: 72, lineHeight: 1.02, letterSpacing: -3, color: colors.ink }}>
          Your profile becomes the funding filter.
        </h2>
        <p style={{ marginTop: 30, fontSize: 31, lineHeight: 1.35, color: colors.muted }}>
          Company profile, website intelligence, documents, and team data all improve matching and application prep.
        </p>
      </div>
      <div style={{ position: "absolute", right: 130, top: 220, width: 680, display: "grid", gap: 20 }}>
        {[
          "Company profile and website intelligence",
          "Data Vault documents and evidence",
          "Founder, directors, team and advisers",
          "Grant-specific eligibility reasoning",
        ].map((item, index) => (
          <FeaturePill key={item} label={item} delay={start + index * 8} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const PrepScene = ({ start, duration }: { start: number; duration: number }) => {
  const p = useSceneProgress(start, duration);
  const frame = useCurrentFrame();
  const cursorX = interpolate(frame, [start + 20, start + 70], [1050, 1340], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <Background />
      <div style={{ position: "absolute", left: 120, top: 86 }}>
        <LogoLockup compact />
      </div>
      <div style={{ position: "absolute", left: 130, top: 250, width: 610 }}>
        <Badge tone="green">Application prep</Badge>
        <h2 style={{ margin: "34px 0 0", fontSize: 72, lineHeight: 1.02, letterSpacing: -3, color: colors.ink }}>
          Funder-ready answers and documents.
        </h2>
        <p style={{ marginTop: 30, fontSize: 31, lineHeight: 1.35, color: colors.muted }}>
          Prepare checklists, answers, pitch decks, business plans, and supporting documents from one workspace.
        </p>
      </div>
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 185,
          width: 850,
          height: 620,
          borderRadius: 32,
          background: colors.white,
          border: `1px solid ${colors.line}`,
          boxShadow: "0 30px 90px rgba(7,29,58,0.13)",
          padding: 34,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: colors.ink }}>Prepare Application</div>
          <div style={{ borderRadius: 999, padding: "10px 16px", background: colors.mint, color: "#087a4f", fontSize: 18, fontWeight: 900 }}>
            85% match
          </div>
        </div>
        <div style={{ marginTop: 34, display: "grid", gap: 20 }}>
          {[
            "Eligibility summary",
            "Application checklist",
            "Funder-ready answers",
            "Pitch deck with optional speaker notes",
            "Deadline and outcome tracking",
          ].map((item, index) => (
            <div key={item} style={{ borderRadius: 18, background: index % 2 === 0 ? "#f4f8ff" : colors.white, border: `1px solid ${colors.line}`, padding: "20px 22px", fontSize: 25, fontWeight: 800, color: colors.ink }}>
              <span style={{ color: colors.green, marginRight: 12 }}>✓</span>
              {item}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: cursorX - 960, bottom: 38, borderRadius: 18, background: colors.blue, color: colors.white, padding: "18px 28px", fontSize: 23, fontWeight: 900 }}>
          Generate prep documents
        </div>
      </div>
    </AbsoluteFill>
  );
};

const NotificationScene = ({ start, duration }: { start: number; duration: number }) => {
  const p = useSceneProgress(start, duration);
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <Background />
      <div style={{ position: "absolute", left: 120, top: 86 }}>
        <LogoLockup compact />
      </div>
      <div style={{ position: "absolute", left: 130, top: 250, width: 670 }}>
        <Badge>Never miss the signal</Badge>
        <h2 style={{ margin: "34px 0 0", fontSize: 72, lineHeight: 1.02, letterSpacing: -3, color: colors.ink }}>
          Daily opportunities. Deadline reminders. Clear diagnostics.
        </h2>
        <p style={{ marginTop: 30, fontSize: 31, lineHeight: 1.35, color: colors.muted }}>
          Email digests include strong and within-reach matches. WhatsApp stays high-signal for 85%+ opportunities.
        </p>
      </div>
      <div style={{ position: "absolute", right: 230, top: 170 }}>
        <PhonePanel />
      </div>
    </AbsoluteFill>
  );
};

const FinalScene = ({ start, duration }: { start: number; duration: number }) => {
  const p = useSceneProgress(start, duration);
  return (
    <AbsoluteFill style={{ opacity: p }}>
      <Background />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <LogoLockup />
        <div style={{ marginTop: 54, fontSize: 86, lineHeight: 1, fontWeight: 950, letterSpacing: -4, color: colors.ink }}>
          Find it. Fill it. Fund it.
        </div>
        <div style={{ marginTop: 20, fontSize: 56, fontWeight: 950, color: colors.green }}>
          Apply on autopilot.
        </div>
        <div style={{ marginTop: 44, borderRadius: 22, background: colors.blue, color: colors.white, padding: "24px 42px", fontSize: 30, fontWeight: 900 }}>
          Get started free
        </div>
        <div style={{ marginTop: 34, fontSize: 24, color: colors.muted, fontWeight: 700 }}>
          AI-powered grant discovery, eligibility scoring, and application preparation.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const GrantsCopilotLaunchVideo = () => {
  const { fps } = useVideoConfig();
  const s = (seconds: number) => seconds * fps;
  return (
    <AbsoluteFill style={{ fontFamily: "Inter, Arial, sans-serif", background: colors.warm }}>
      <Scene start={0} duration={s(6)}>
        <HeroScene start={0} duration={s(6)} />
      </Scene>
      <Scene start={s(5)} duration={s(7)}>
        <DiscoverScene start={s(5)} duration={s(7)} />
      </Scene>
      <Scene start={s(11)} duration={s(7)}>
        <DnaScene start={s(11)} duration={s(7)} />
      </Scene>
      <Scene start={s(17)} duration={s(7)}>
        <PrepScene start={s(17)} duration={s(7)} />
      </Scene>
      <Scene start={s(23)} duration={s(7)}>
        <NotificationScene start={s(23)} duration={s(7)} />
      </Scene>
      <Scene start={s(29)} duration={s(6)}>
        <FinalScene start={s(29)} duration={s(6)} />
      </Scene>
    </AbsoluteFill>
  );
};
