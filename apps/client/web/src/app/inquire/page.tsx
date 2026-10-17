"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { Avatar, Card, LinkButton } from "@jorna/shared/components/ui";
import { InquiryForm } from "@/components/InquiryForm";
import { getVendor } from "@/lib/jorna";
import { categoryLabel, type VendorDetail } from "@/lib/types";

// /inquire?vendor=<id>: the link a vendor shares (Instagram bio, their own
// site). Just the vendor and the inquiry form, for anyone — no account, no
// marketplace around it (backend DECISIONS #32).

function InquireInner() {
  const vendorId = useSearchParams().get("vendor");
  // Kept with the id it was loaded for, so a different ?vendor= reads as
  // loading until its own answer arrives.
  const [loaded, setLoaded] = useState<{ id: string; vendor: VendorDetail | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    let cancelled = false;
    getVendor(vendorId)
      .then((vendor) => !cancelled && setLoaded({ id: vendorId, vendor, error: null }))
      .catch(
        (err) =>
          !cancelled &&
          setLoaded({
            id: vendorId,
            vendor: null,
            error: err instanceof ApiError && err.status === 404 ? null : "Couldn't load this vendor. Try again in a moment.",
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  const current = loaded && loaded.id === vendorId ? loaded : null;
  if (vendorId && !current) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  const vendor = current?.vendor ?? null;
  if (!vendor) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">
          {current?.error ? "Something went wrong" : "We couldn't find that vendor"}
        </h1>
        <p className="mt-3 text-ink-soft">
          {current?.error ?? "The link may be incomplete. Ask them for it again, or find them on the marketplace."}
        </p>
        <LinkButton href="/marketplace" variant="ghost" className="mt-6">
          Browse the marketplace
        </LinkButton>
      </div>
    );
  }

  const name = `${vendor.f_name ?? ""} ${vendor.l_name ?? ""}`.trim() || "this vendor";
  const kind = vendor.subcategory || vendor.category;
  return (
    <div className="mx-auto w-[min(720px,100%-2rem)] py-10">
      <header className="flex items-center gap-4">
        <Avatar src={vendor.pfp_url} name={name} size={64} />
        <div className="min-w-0">
          <h1 className="serif text-3xl text-maroon dark:text-gold">Ask {name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[kind ? categoryLabel(kind) : null, vendor.location].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>
      <p className="mt-5 max-w-[60ch] text-ink-soft">
        Tell them about your event. They&apos;ll get it straight away and reply to your email.
      </p>
      <Card className="relative mt-6 p-5 sm:p-6">
        <InquiryForm vendorId={vendor.vendor_id} vendorName={name} />
      </Card>
      <p className="mt-6 text-sm text-ink-faint">
        <Link href={`/vendor?id=${vendor.vendor_id}`} className="hover:text-ink hover:underline">
          See {name}&apos;s packages and reviews
        </Link>
      </p>
    </div>
  );
}

export default function InquirePage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <InquireInner />
    </Suspense>
  );
}
