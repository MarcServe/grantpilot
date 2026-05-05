"use client";

import { useEffect, useRef } from "react";

/** Matches landing hero badge tint — tiny SVG loads instantly before MP4 */
const NEUTRAL_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Crect fill='%23e8f0ff' width='1280' height='720'/%3E%3C/svg%3E";

/** Pause on last frame before replay (native `loop` restarts instantly). */
const LOOP_GAP_MS = 3000;

/**
 * Hero loop: MP4 hardware-decodes better than GIF on mobile.
 * preload="none" + IntersectionObserver avoids downloading until the hero is near the viewport.
 */
export function HeroMotionVideo({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const kick = () => {
      void v.play().catch(() => {});
    };

    let primed = false;

    const prime = () => {
      if (primed) return;
      primed = true;
      v.preload = "auto";
      v.load();
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        prime();
        kick();
      },
      { threshold: 0.06, rootMargin: "120px 0px" }
    );
    io.observe(v);

    let gapTimer: number | null = null;

    const onEnded = () => {
      if (gapTimer != null) window.clearTimeout(gapTimer);
      gapTimer = window.setTimeout(() => {
        gapTimer = null;
        v.currentTime = 0;
        void v.play().catch(() => {});
      }, LOOP_GAP_MS);
    };

    v.addEventListener("ended", onEnded);
    v.addEventListener("loadeddata", kick);
    v.addEventListener("canplay", kick);

    return () => {
      if (gapTimer != null) window.clearTimeout(gapTimer);
      io.disconnect();
      v.removeEventListener("loadeddata", kick);
      v.removeEventListener("canplay", kick);
      v.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <video
      ref={ref}
      width={1280}
      height={720}
      autoPlay
      muted
      playsInline
      preload="none"
      poster={NEUTRAL_POSTER}
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      className={className}
      aria-label="GrantsCopilot product preview animation"
    >
      <source src="/grantcomotion.mp4" type="video/mp4" />
    </video>
  );
}
