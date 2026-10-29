import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For vendors — Jorna",
  description:
    "A home for your South Asian event business. Showcase your services and products, connect with clients, and manage your bookings and contracts.",
};

export default function ForVendorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
