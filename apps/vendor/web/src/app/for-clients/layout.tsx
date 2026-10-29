import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For clients — Jorna",
  description:
    "Plan your South Asian wedding, sangeet, mehndi and more. Discover vendors, browse their offerings, and agree every price and deposit in a signed contract before you pay.",
};

export default function ForClientsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
