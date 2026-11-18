import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";

function ProductScene({
  title,
  description,
  label,
  duration,
  children,
}: {
  title: string;
  description: string;
  label: string;
  duration: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 10, duration - 10, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(115deg,#071a3a,#103a63)",
        opacity,
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 66,
          top: 49,
          fontSize: 29,
          fontWeight: 800,
        }}
      >
        Grants<span style={{ color: "#35c386" }}>Copilot</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 66,
          top: 57,
          color: "#a9bedc",
          fontSize: 14,
          letterSpacing: 2,
        }}
      >
        {label}
      </div>
      <div style={{ position: "absolute", left: 66, top: 208, width: 300 }}>
        <div
          style={{
            color: "#35c386",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          SEE IT IN ACTION
        </div>
        <h1
          style={{
            fontSize: 43,
            lineHeight: 1.12,
            letterSpacing: -1.4,
            margin: "22px 0",
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: 22, color: "#cbdaf0", lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
      {children}
    </AbsoluteFill>
  );
}

const screen = {
  position: "absolute" as const,
  left: 410,
  top: 162,
  width: 804,
  height: 414,
  borderRadius: 15,
  border: "2px solid #426692",
  overflow: "hidden",
  boxShadow: "0 25px 70px #0008",
  background: "white",
};
export function RealProductScenes() {
  return (
    <>
      <Sequence from={120} durationInFrames={100}>
        <ProductScene
          duration={100}
          label="LIVE DASHBOARD"
          title="Your funding command centre."
          description="See matches, deadlines and preparation from one dashboard."
        >
          <div style={screen}>
            <Img
              src={staticFile("videos/explainer-media/dashboard.jpg")}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        </ProductScene>
      </Sequence>
      <Sequence from={220} durationInFrames={87}>
        <ProductScene
          duration={87}
          label="ACTUAL PRODUCT FOOTAGE"
          title="Explore your opportunities."
          description="Open a grant and review its fit, requirements and next step."
        >
          <div style={screen}>
            <OffthreadVideo
              muted
              startFrom={96}
              src={staticFile("videos/explainer-media/opportunities.mp4")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </ProductScene>
      </Sequence>
      <Sequence from={307} durationInFrames={110}>
        <ProductScene
          duration={110}
          label="LIVE BUSINESS PROFILE"
          title="Your Business DNA."
          description="Keep your business context together so preparation starts with you."
        >
          <div
            style={{ ...screen, left: 570, top: 135, width: 560, height: 470 }}
          >
            <Img
              src={staticFile("videos/explainer-media/business-profile.jpg")}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        </ProductScene>
      </Sequence>
      <Sequence from={417} durationInFrames={101}>
        <ProductScene
          duration={101}
          label="ACTUAL OPPORTUNITY VIEW"
          title="Context behind the match."
          description="Review the fit, published requirements and evidence still needed."
        >
          <div style={screen}>
            <Img
              src={staticFile("videos/explainer-media/opportunity-matches.jpg")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </ProductScene>
      </Sequence>
      <Sequence from={518} durationInFrames={221}>
        <ProductScene
          duration={221}
          label="LIVE FOUNDER PACK WORKSPACE"
          title="Build the pack you need."
          description="Choose a document pack. Draft answers and evidence lists. Review and export."
        >
          <div style={{ ...screen, top: 140, height: 460 }}>
            <Img
              src={staticFile("videos/explainer-media/founder-pack.jpg")}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        </ProductScene>
      </Sequence>
      <Sequence from={739} durationInFrames={115}>
        <ProductScene
          duration={115}
          label="REAL EMAIL NOTIFICATION"
          title="Your opportunities. Delivered."
          description="A daily email brings relevant opportunities and preparation links to you."
        >
          <div
            style={{ ...screen, left: 650, top: 126, width: 390, height: 480 }}
          >
            <OffthreadVideo
              muted
              src={staticFile("videos/explainer-media/email-digest.mp4")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </ProductScene>
      </Sequence>
      <Sequence from={854} durationInFrames={106}>
        <ProductScene
          duration={106}
          label="REAL DEADLINE REMINDER"
          title="Keep deadlines in sight."
          description="Open the grant, review the fit and prepare before the closing date."
        >
          <div
            style={{ ...screen, left: 460, top: 165, width: 720, height: 440 }}
          >
            <Img
              src={staticFile("videos/explainer-media/deadline-reminder.jpg")}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        </ProductScene>
      </Sequence>
    </>
  );
}
