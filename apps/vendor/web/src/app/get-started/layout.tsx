import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get started — Jorna",
  description: "Planning a celebration or making them happen: choose how you'll use Jorna.",
};

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
