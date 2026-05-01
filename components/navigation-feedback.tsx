"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function shouldHandleAnchor(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname + url.search !== window.location.pathname + window.location.search;
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function startPending(targetPath: string | null) {
      setPendingTarget(targetPath);
      setPending(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setPending(false);
        setPendingTarget(null);
      }, 8000);
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (anchor && shouldHandleAnchor(anchor)) {
        const url = new URL(anchor.href, window.location.href);
        startPending(url.pathname);
      }
    }

    function onSubmit(event: SubmitEvent) {
      if (!event.defaultPrevented) startPending(null);
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!pending || pendingTarget === pathname) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/10">
      <div className="h-full w-1/2 animate-[nav-progress_1s_ease-in-out_infinite] rounded-r-full bg-primary" />
    </div>
  );
}
