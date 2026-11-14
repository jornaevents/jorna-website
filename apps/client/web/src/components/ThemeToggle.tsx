"use client";

// The moon/sun button in the top bar (Jorna-Client design). Rendered only when
// the build turns dark mode on (DARK_MODE_ENABLED, lib/flags) — the site is
// light only otherwise, so a toggle would do nothing. The choice is the same
// one vendor Settings stores (shared lib/theme), on the same origin, so a
// person who is both sees one setting.

import { useState, useSyncExternalStore } from "react";
import { getEffectiveTheme, setThemeChoice, type Theme } from "@jorna/shared/lib/theme";
import { I, icon } from "./nav";

const noSubscribe = () => () => {};

export function ThemeToggle() {
  // What's showing lives in localStorage and the device setting, which the
  // pre-rendered page can't know — null there, read for real once hydrated.
  const showing = useSyncExternalStore(noSubscribe, getEffectiveTheme, () => null);
  const [picked, setPicked] = useState<Theme | null>(null);
  const theme = picked ?? showing;
  if (!theme) return null;
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        setThemeChoice(next);
        setPicked(next);
      }}
      aria-label={next === "dark" ? "Use dark mode" : "Use light mode"}
      className="grid size-[38px] place-items-center rounded-full border border-line text-ink-soft transition hover:text-ink"
    >
      {icon(theme === "dark" ? I.sun : I.moon, "size-5")}
    </button>
  );
}
