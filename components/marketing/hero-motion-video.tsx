import Image from "next/image";

export function HeroMotionVideo({ className }: { className?: string }) {
  return (
    <Image
      src="/grantcomotion.gif"
      alt="Animated funding documents handled by GrantsCopilot"
      width={1280}
      height={770}
      className={className}
      unoptimized
      priority
    />
  );
}
