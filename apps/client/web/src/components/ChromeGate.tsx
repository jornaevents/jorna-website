"use client";

// Pages that draw their own top bar — the entry screens (components/entry) —
// don't get the site's header and footer as well.

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const OWN_CHROME = ["/login"];

export function ChromeGate({ children }: { children: ReactNode }) {
  const path = usePathname()?.replace(/\/$/, "") || "/";
  return OWN_CHROME.includes(path) ? null : <>{children}</>;
}
