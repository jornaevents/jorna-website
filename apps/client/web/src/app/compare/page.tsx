"use client";

// Compare the vendors a client saved in Explore, side by side (Jorna-Client
// design; client redesign PR 7): the numbers a shortlist is decided on.
// "Typical response" and "Travel fee" from the design aren't here — nothing
// records them yet.

import { useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { LinkButton } from "@jorna/shared/components/ui";
import { useSavedVendors } from "@/lib/savedVendors";
import { categoryLabel } from "@/lib/types";
import type { SavedVendor } from "@/lib/jorna";
import { Badge } from "@/components/kit";
import { signInUrl } from "@/lib/vendorSite";

const ROWS: [string, (v: SavedVendor) => string][] = [
  ["Rating", (v) => (v.num_reviews && v.rating ? `★ ${v.rating.toFixed(1)}` : "New")],
  ["Reviews", (v) => String(v.num_reviews ?? 0)],
  ["Starting price", (v) => (v.starting_price != null ? `From $${Math.round(v.starting_price).toLocaleString()}` : "Ask for a quote")],
  ["Years in business", (v) => (v.years_experience != null ? String(v.years_experience) : "—")],
  ["Based in", (v) => v.location || "—"],
];

export default function ComparePage() {
  const { user, loading } = useAuth();
  const { saved, toggle } = useSavedVendors();

  useEffect(() => {
    if (!loading && !user) window.location.replace(signInUrl("/compare"));
  }, [loading, user]);

  if (loading || !user || saved === null) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-10">
      <Link href="/marketplace" className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Back to Explore
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your shortlist</p>
          <h1 className="mt-3 font-serif text-[2rem] font-bold leading-[1.08] tracking-[-0.04em] text-ink desk:text-[2.8rem]">
            Compare your selected vendors
          </h1>
          <p className="mt-2 text-ink-soft">Numbers side by side, so the tradeoffs are easy to see.</p>
        </div>
        <Badge tone="neutral">{saved.length} selected</Badge>
      </div>

      {saved.length === 0 ? (
        <div className="mx-auto mt-16 max-w-[420px] text-center">
          <h2 className="font-serif text-xl font-bold text-ink">No vendors selected</h2>
          <p className="mt-2 text-ink-soft">Heart vendors in Explore to build a side-by-side comparison.</p>
          <LinkButton href="/marketplace" className="mt-5">
            Explore vendors
          </LinkButton>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-36 p-4 text-left text-[0.72rem] font-semibold text-ink-soft">
                  Compare
                </th>
                {saved.map((v) => (
                  <th key={v.vendor_id} scope="col" className="min-w-[170px] p-4 text-left align-top">
                    <span className="block text-[0.7rem] font-bold uppercase tracking-[0.1em] text-gold">{categoryLabel(v.category ?? "")}</span>
                    <strong className="font-serif text-base text-ink">{v.name || "Vendor"}</strong>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, value]) => (
                <tr key={label} className="border-b border-line-soft">
                  <th scope="row" className="p-4 text-left text-[0.8rem] font-semibold text-ink-soft">
                    {label}
                  </th>
                  {saved.map((v) => (
                    <td key={v.vendor_id} className="p-4 text-ink">
                      {value(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="p-4 text-left text-[0.8rem] font-semibold text-ink-soft">
                  Next step
                </th>
                {saved.map((v) => (
                  <td key={v.vendor_id} className="p-4">
                    <LinkButton size="md" variant="ghost" href={`/vendor?id=${v.vendor_id}`}>
                      View vendor
                    </LinkButton>
                    <button type="button" onClick={() => toggle(v.vendor_id)} className="mt-2 block text-xs font-semibold text-ink-soft hover:text-maroon">
                      Remove<span className="sr-only"> {v.name}</span>
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
