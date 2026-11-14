"use client";

// globals.css implements both palettes behind a `data-theme="light"|"dark"`
// attribute on <html>, falling back to `prefers-color-scheme` when it's unset.
// This is where that attribute is flipped and the choice remembered.
// themeBoot.ts re-applies a stored choice before first paint; without it
// a reload fell back to the system theme.

import { THEME_KEY as KEY } from "./themeBoot";

export type Theme = "light" | "dark";
/** What Settings offers: an explicit theme, or follow the device. */
export type ThemeChoice = Theme | "system";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

/** The explicit choice, if any — null means "follow the system". */
export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** What's actually showing right now, explicit choice or system fallback. */
export function getEffectiveTheme(): Theme {
  return getStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

export function getThemeChoice(): ThemeChoice {
  return getStoredTheme() ?? "system";
}

export function setThemeChoice(choice: ThemeChoice) {
  if (typeof window === "undefined") return;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies to this page.
  }
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}
