"use client";

import { useEffect, useRef } from "react";

/**
 * Hero loop: MP4 streams and hardware-decodes better than GIF on mobile (especially iOS Safari).
 * muted + playsInline + programmatic play retry improves autoplay reliability.
 */
export function HeroMotionVideo({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    const kick = () => {
      void v.play().catch(() => {});
    };

    kick();
    v.addEventListener("loadeddata", kick);
    v.addEventListener("canplay", kick);

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) kick();
      },
      { threshold: 0.1 }
    );
    io.observe(v);

    return () => {
      v.removeEventListener("loadeddata", kick);
      v.removeEventListener("canplay", kick);
      io.disconnect();
    };
  }, []);

  return (
    <video
      ref={ref}
      width={1280}
      height={720}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
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
