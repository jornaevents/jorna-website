"use client";

// Beside a client's chat with one vendor (2026-11-16): who the vendor is, where
// the contract stands and what to do about it, and the payment schedule. All of
// it is read from what the app already has — the vendor's public profile, and
// the latest contract card in the thread (or the thread's own booking) — so a
// question thread with no contract yet shows just the vendor.

import { useEffect, useState } from "react";
import Link from "next/link";
import { vendorName } from "@jorna/shared/lib/vendorName";
import { Avatar, Stars } from "@jorna/shared/components/ui";
import { getContract, getMyBooking, getVendor } from "@/lib/jorna";
import {
  contractInChatPath,
  contractProposeUrl,
  contractSignUrl,
  contractStanding,
  paymentRows,
} from "@/lib/contract";
import { categoryLabel, type Contract, type VendorDetail } from "@/lib/types";
import { PaymentSchedule } from "@/components/PaymentSchedule";

/** sign_blockers is on Contract once web #311 lands; read here without
 *  depending on it (backend DECISIONS #51). */
type WithBlockers = Contract & { sign_blockers?: string[] };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-card-edge bg-card p-4">
      <h2 className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** What the client can do about the contract right now, if anything. */
function ContractAction({ c, token, bookingId }: { c: Contract; token: string; bookingId: string }) {
  const vendor = c.vendor_display_name || "your vendor";
  const blockers = (c as WithBlockers).sign_blockers ?? [];
  const unsigned = !c.client_signed_at && !c.signed_at && (c.contract_status === "sent" || c.contract_status === "viewed");
  const button = "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold";
  if (unsigned && (blockers.includes("waiting_on_vendor") || c.proposal_status === "open")) {
    return <p className="text-sm text-ink-soft">Waiting on {vendor} — they&apos;re answering your changes.</p>;
  }
  if (unsigned && blockers.includes("price")) {
    return <p className="text-sm text-ink-soft">Waiting on {vendor} to add the price.</p>;
  }
  if (unsigned) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href={contractSignUrl(token)} className={`${button} bg-maroon text-ground hover:brightness-110`}>
          {blockers.includes("location") ? "Add the location" : "Review & sign"}
        </Link>
        <Link href={contractProposeUrl(token)} className={`${button} border border-card-edge text-ink hover:border-gold`}>
          Propose changes
        </Link>
      </div>
    );
  }
  if (c.client_signed_at && !c.signed_at) {
    return <p className="text-sm text-ink-soft">You signed. It&apos;s booked once {vendor} signs too.</p>;
  }
  return (
    <Link href={contractInChatPath(bookingId)} className="text-sm font-semibold text-gold hover:underline">
      Open the contract
    </Link>
  );
}

export function ChatSidebar({ vendorId, bookingId }: { vendorId: string; bookingId: string | null }) {
  const [vendor, setVendor] = useState<{ id: string; detail: VendorDetail } | null>(null);
  const [contract, setContract] = useState<{ bookingId: string; token: string; c: Contract } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVendor(vendorId)
      .then((detail) => !cancelled && setVendor({ id: vendorId, detail }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [vendorId]);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    getMyBooking(bookingId)
      .then((b) => (b.contract_token ? getContract(b.contract_token).then((c) => ({ token: b.contract_token!, c })) : null))
      .then((r) => !cancelled && r && setContract({ bookingId, ...r }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const v = vendor?.id === vendorId ? vendor.detail : null;
  const current = bookingId && contract?.bookingId === bookingId ? contract : null;
  const rows = current ? paymentRows(current.c) : [];
  const name = v ? vendorName(v, "Your vendor") : "";

  return (
    <aside aria-label="About this booking" className="grid content-start gap-3">
      {v ? (
        <Panel title="Vendor">
          <div className="flex items-center gap-3">
            <Avatar src={v.pfp_url} name={name} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{name}</p>
              <p className="truncate text-xs text-ink-faint">
                {v.category ? categoryLabel(v.category) : null}
                {v.location ? `${v.category ? " · " : ""}${v.location}` : null}
              </p>
              <Stars rating={v.rating} />
            </div>
          </div>
          <Link
            href={`/vendor?id=${encodeURIComponent(vendorId)}`}
            className="mt-3 inline-block text-sm font-semibold text-gold hover:underline"
          >
            See their page
          </Link>
        </Panel>
      ) : null}

      {current ? (
        <Panel title="Contract">
          {(() => {
            const s = contractStanding(current.c, current.token);
            return (
              <>
                <p className="text-sm font-semibold text-ink">{current.c.service_name || "Your booking"}</p>
                <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${s.tone}`}>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {s.text}
                </p>
                <div className="mt-3">
                  <ContractAction c={current.c} token={current.token} bookingId={current.bookingId} />
                </div>
              </>
            );
          })()}
        </Panel>
      ) : null}

      {rows.length > 0 ? (
        <Panel title="Payments">
          <PaymentSchedule rows={rows} vendorName={name || current?.c.vendor_display_name || "your vendor"} />
        </Panel>
      ) : null}
    </aside>
  );
}
