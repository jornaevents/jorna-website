"use client";

// The negotiation workspace as a page of its own (backend DECISIONS #23,
// #24) — the same screen the Leads page opens as a panel, for links from
// the contract page, emails and push notifications.
//
// /contracts/changes?id=… — a static export can't have a page per contract.

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { VendorNegotiation } from "@/components/negotiation/VendorNegotiation";
import { NegotiationSkeleton } from "@/components/vendor/ContractSkeletons";

function ChangesInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/contracts/changes?id=${id}`)}&role=vendor`);
    }
  }, [authLoading, user, router, id]);

  if (authLoading || !user) {
    return (
      <div>
        <Link href={`/contracts/view?id=${id}`} className="eyebrow hover:text-gold">
          ← The contract
        </Link>
        <div className="mt-3 h-[min(60rem,calc(100dvh-8rem))] overflow-hidden rounded-2xl border border-card-edge shadow-[var(--shadow-card)]">
          <NegotiationSkeleton />
        </div>
      </div>
    );
  }
  if (!id) return <p className="py-20 text-center text-ink-soft">No contract picked.</p>;

  return (
    <div>
      <Link href={`/contracts/view?id=${id}`} className="eyebrow hover:text-gold">
        ← The contract
      </Link>
      <div className="mt-3 h-[min(60rem,calc(100dvh-8rem))] overflow-hidden rounded-2xl border border-card-edge shadow-[var(--shadow-card)]">
        <VendorNegotiation
          bookingId={id}
          onDone={(message) => router.push(`/contracts/view?id=${id}&notice=${encodeURIComponent(message)}`)}
        />
      </div>
    </div>
  );
}

export default function ContractChangesPage() {
  return (
    <Suspense fallback={<NegotiationSkeleton />}>
      <ChangesInner />
    </Suspense>
  );
}
