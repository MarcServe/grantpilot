"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = searchParams.toString();
  const currentRoute = `${pathname}${search ? `?${search}` : ""}`;

  useEffect(() => {
    function startPending(targetRoute: string | null) {
      setPendingTarget(targetRoute);
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
        startPending(`${url.pathname}${url.search}`);
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
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pending || !pendingTarget || pendingTarget !== currentRoute) return;
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      setPending(false);
      setPendingTarget(null);
    }, 200);
  }, [currentRoute, pending, pendingTarget]);

  if (!pending) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1.5 overflow-hidden bg-[#dbeafe]">
        <div className="h-full w-1/2 animate-[nav-progress_1s_ease-in-out_infinite] rounded-r-full bg-[#2167e8]" />
      </div>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-3 z-[101] -translate-x-1/2 rounded-full border border-[#c9dcff] bg-white px-3 py-1.5 text-xs font-extrabold text-[#071a3a] shadow-[0_10px_28px_rgba(33,103,232,0.18)]"
      >
        Loading...
      </div>
    </>
  );
}
