import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";
export const EXPLAINER_FPS = 24;
export const EXPLAINER_SECONDS = 48;
const c = {
  navy: "#071a3a",
  blue: "#2167e8",
  mint: "#35c386",
  muted: "#a9bedc",
};
function Panel({
  children,
  style = {},
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        border: "1px solid #31547b",
        borderRadius: 20,
        background: "linear-gradient(135deg,#183866ee,#0a2347ee)",
        padding: 24,
        boxShadow: "0 25px 65px #0005",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function Paper({ label, index = 0 }: { label: string; index?: number }) {
  const f = useCurrentFrame();
  return (
    <Panel
      style={{
        position: "absolute",
        width: 270,
        top: 40 + index * 105,
        left: 35 + index * 27,
        transform: `translateY(${Math.sin(f / 19 + index) * 5}px) rotate(${index % 2 ? 2 : -2}deg)`,
      }}
    >
      <div
        style={{
          width: 34,
          height: 6,
          borderRadius: 4,
          background: c.mint,
          marginBottom: 15,
        }}
      />
      <div style={{ fontSize: 21, fontWeight: 700 }}>{label}</div>
      <div
        style={{
          marginTop: 15,
          height: 5,
          background: "#52749a",
          width: "86%",
          borderRadius: 4,
        }}
      />
      <div
        style={{
          marginTop: 9,
          height: 5,
          background: "#31547b",
          width: "65%",
          borderRadius: 4,
        }}
      />
    </Panel>
  );
}
function Scene({
  duration,
  kicker,
  title,
  description,
  children,
}: {
  duration: number;
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const f = useCurrentFrame();
  const opacity = interpolate(
    f,
    [0, 12, duration - 10, duration],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const offset = interpolate(f, [0, 20], [30, 0], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${offset}px)` }}>
      <div style={{ position: "absolute", left: 66, top: 182, width: 620 }}>
        <div
          style={{
            color: c.mint,
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </div>
        <h1
          style={{
            fontSize: 57,
            lineHeight: 1.09,
            letterSpacing: -1.9,
            margin: "22px 0 23px",
            fontWeight: 800,
            whiteSpace: "pre-line",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 25,
            lineHeight: 1.45,
            color: "#cbdaf0",
            whiteSpace: "pre-line",
            maxWidth: 590,
          }}
        >
          {description}
        </p>
      </div>
      <div
        style={{
          position: "absolute",
          left: 760,
          top: 155,
          width: 415,
          height: 400,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}
export function GrantsCopilotExplainer({
  backgroundVideoUrl,
}: {
  backgroundVideoUrl?: string;
}) {
  const f = useCurrentFrame();
  const times = [0, 5, 12.8, 21.6, 30.8, 40, 48].map((t) =>
    Math.round(t * EXPLAINER_FPS),
  );
  return (
    <AbsoluteFill
      style={{
        background: c.navy,
        color: "white",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      {backgroundVideoUrl && (
        <Sequence from={times[2]} durationInFrames={times[3] - times[2]}>
          <OffthreadVideo
            src={backgroundVideoUrl}
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.23,
            }}
          />
        </Sequence>
      )}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 80% 40%,#12596455 0%,transparent 55%),linear-gradient(90deg,#071a3af5 0%,#071a3ae8 47%,#071a3a33 100%)",
        }}
      />
      <svg
        width="1280"
        height="720"
        style={{ position: "absolute", opacity: 0.38 }}
      >
        {Array.from({ length: 25 }, (_, i) => {
          const x = 730 + ((i * 73) % 490),
            y = 100 + ((i * 131) % 510);
          return (
            <g key={i}>
              <line
                x1={1000}
                y1={350}
                x2={x}
                y2={y}
                stroke="#2167e8"
                strokeWidth="1"
                opacity="0.45"
              />
              <circle
                cx={x}
                cy={y}
                r={3 + Math.sin(f / 24 + i) * 1.5}
                fill={i % 3 === 0 ? c.mint : "#5c9dff"}
              />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          left: 66,
          top: 49,
          fontSize: 29,
          fontWeight: 800,
          letterSpacing: -0.7,
        }}
      >
        Grants<span style={{ color: c.mint }}>Copilot</span>
      </div>
      <div
        style={{
          position: "absolute",
          right: 66,
          top: 57,
          fontSize: 14,
          color: c.muted,
          letterSpacing: 3,
        }}
      >
        HOW IT WORKS
      </div>
      <Sequence from={times[0]} durationInFrames={times[1] - times[0]}>
        <Scene
          duration={times[1] - times[0]}
          kicker="Funding beyond the obvious"
          title={"So many sources.\nOne clearer journey."}
          description={
            "From a business profile to relevant opportunities\nand a better-prepared application."
          }
        >
          <Paper label="Official funding portals" />
          <Paper label="Local and regional sources" index={1} />
          <Paper label="AI-assisted discovery" index={2} />
        </Scene>
      </Sequence>
      <Sequence from={times[1]} durationInFrames={times[2] - times[1]}>
        <Scene
          duration={times[2] - times[1]}
          kicker="01 / Your funding command centre"
          title={"See your next step.\nKeep your focus."}
          description={
            "Create your Business DNA.\nExplore matches, deadlines and preparation."
          }
        >
          <Panel>
            <div
              style={{
                fontSize: 17,
                color: c.mint,
                fontWeight: 700,
                marginBottom: 24,
              }}
            >
              YOUR WORKSPACE
            </div>
            {[
              "Relevant opportunities",
              "Upcoming deadlines",
              "Application preparation",
            ].map((label, i) => (
              <div
                key={label}
                style={{
                  padding: "18px 15px",
                  marginBottom: 12,
                  borderRadius: 12,
                  background: i === 0 ? "#2167e8" : "#1d416b",
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {label}
                <span style={{ float: "right" }}>→</span>
              </div>
            ))}
          </Panel>
        </Scene>
      </Sequence>
      <Sequence from={times[2]} durationInFrames={times[3] - times[2]}>
        <Scene
          duration={times[3] - times[2]}
          kicker="02 / Business-specific relevance"
          title={"Your Business DNA.\nPut to work."}
          description={
            "Match opportunities to your business.\nKeep useful evidence ready in Data Vault."
          }
        >
          <Panel>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  width: 55,
                  height: 55,
                  borderRadius: 20,
                  background: c.mint,
                  color: c.navy,
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                }}
              >
                DNA
              </div>
              <strong style={{ fontSize: 25 }}>Your business</strong>
            </div>
            {["What you do", "Funding goals", "Team and evidence"].map(
              (label) => (
                <div
                  key={label}
                  style={{
                    borderTop: "1px solid #31547b",
                    padding: "19px 0",
                    fontSize: 23,
                  }}
                >
                  {label}
                  <span style={{ float: "right", color: c.mint }}>✓</span>
                </div>
              ),
            )}
          </Panel>
        </Scene>
      </Sequence>
      <Sequence from={times[3]} durationInFrames={times[4] - times[3]}>
        <Scene
          duration={times[4] - times[3]}
          kicker="03 / Prepare with context"
          title={"From opportunity\nto editable draft."}
          description={
            "Review published requirements and evidence gaps.\nCreate answers, checklists and documents."
          }
        >
          <Paper label="Published requirements" />
          <Paper label="Evidence and clarification" index={1} />
          <Paper label="Editable application draft" index={2} />
        </Scene>
      </Sequence>
      <Sequence from={times[4]} durationInFrames={times[5] - times[4]}>
        <Scene
          duration={times[5] - times[4]}
          kicker="04 / Stay informed, stay in control"
          title={"Keep opportunities\nwithin reach."}
          description={
            "Relevant email and WhatsApp alerts.\nReview your drafts before you apply."
          }
        >
          <Panel style={{ transform: `translateY(${Math.sin(f / 25) * 7}px)` }}>
            <div
              style={{
                fontSize: 17,
                color: c.mint,
                letterSpacing: 2,
                marginBottom: 20,
              }}
            >
              YOUR FUNDING RADAR
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.3 }}>
              An opportunity worth reviewing.
            </div>
            <p style={{ fontSize: 22, color: c.muted, lineHeight: 1.5 }}>
              Check fit, requirements and the next preparation step.
            </p>
            <div
              style={{
                background: c.blue,
                borderRadius: 12,
                padding: 17,
                fontSize: 21,
                fontWeight: 700,
              }}
            >
              Review opportunity →
            </div>
          </Panel>
        </Scene>
      </Sequence>
      <Sequence from={times[5]} durationInFrames={times[6] - times[5]}>
        <Scene
          duration={times[6] - times[5]}
          kicker="Your next step starts here"
          title={"Less searching.\nA clearer next step."}
          description={"Create your Business DNA.\ngrantscopilot.com"}
        >
          <Panel
            style={{
              marginTop: 45,
              textAlign: "center",
              padding: "45px 25px",
              borderColor: c.mint,
            }}
          >
            <div style={{ fontSize: 50, color: c.mint }}>↗</div>
            <div style={{ fontSize: 29, fontWeight: 800, marginTop: 20 }}>
              Discover. Review.
              <br />
              Prepare.
            </div>
          </Panel>
        </Scene>
      </Sequence>
      <div
        style={{
          position: "absolute",
          left: 66,
          right: 66,
          bottom: 67,
          display: "flex",
          gap: 9,
        }}
      >
        {["Business DNA", "Discover & match", "Prepare", "Review & apply"].map(
          (label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                borderTop: `3px solid ${f / EXPLAINER_FPS > i * 11 ? c.mint : "#294566"}`,
                paddingTop: 13,
                color: f / EXPLAINER_FPS > i * 11 ? "white" : c.muted,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {label}
            </div>
          ),
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 66,
          bottom: 25,
          fontSize: 14,
          color: c.muted,
        }}
      >
        Illustrative workflow · Applicants review and submit · Funding is not
        guaranteed
      </div>
      <Sequence from={0} durationInFrames={34}>
        <Audio
          src={staticFile("voiceover/grantscopilot-launch/narration.mp3")}
          startFrom={0}
          endAt={34}
        />
      </Sequence>
      <Sequence from={5 * EXPLAINER_FPS}>
        <Audio
          src={staticFile("voiceover/grantscopilot-launch/narration.mp3")}
          startFrom={Math.round(5.97 * EXPLAINER_FPS)}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
