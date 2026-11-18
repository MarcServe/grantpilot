export function ProductExplainerVideo() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/20 bg-[#071a3a] shadow-xl">
      <video
        controls
        playsInline
        preload="none"
        poster="/videos/grantscopilot-explainer-poster.jpg"
        aria-label="How GrantsCopilot works: a 48-second narrated product walkthrough"
        className="aspect-video w-full"
        width={1280}
        height={720}
      >
        <source src="/videos/grantscopilot-explainer.mp4" type="video/mp4" />
        <track
          default
          kind="captions"
          src="/videos/grantscopilot-explainer.vtt"
          srcLang="en"
          label="English"
        />
        Your browser does not support video.{" "}
        <a href="/videos/grantscopilot-explainer.mp4">Download the explainer</a>
        .
      </video>
    </div>
  );
}
