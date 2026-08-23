"use client";

// Shared behavior for full-screen sheets/modals (MobileNavMenu,
// ServiceSwapPanel). Neither locked background scroll, trapped focus, or (in
// ServiceSwapPanel's case) closed on Escape — so a keyboard or VoiceOver user
// could tab straight past the overlay into the page behind it, and iOS kept
// the page scrolling/rubber-banding under the sheet.
//
// `onClose` is read through a ref that's updated every render rather than
// listed as an effect dependency, so a caller passing a fresh arrow function
// each render (the common case: `onClose={() => setOpen(false)}`) doesn't
// cause the effect to tear down and rebuild — which would re-capture focus
// and yank it back to the first element on every unrelated re-render while
// the overlay is open.

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useOverlay<T extends HTMLElement>(active: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);

  // Runs after every render (no dependency array) purely to keep the ref
  // current — refs can't be written during render itself.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => {
      const container = ref.current;
      return container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    };
    (focusables()[0] ?? ref.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
