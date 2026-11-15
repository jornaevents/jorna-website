"use client";

// One vendor in an event (client redesign PR 4): where it is on the way from
// found to done, what's owed and when, and the ways on — the contract, the
// plan that manages the booking, and paying. Payments go straight to the
// vendor (Venmo/Zelle from their contract); this only records "I sent it".

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Drawer } from "@/components/Drawer";
import { PaymentSchedule } from "@/components/PaymentSchedule";
import { getContract, markInstallmentSent } from "@/lib/jorna";
import { contractInChatPath, paymentRows } from "@/lib/contract";
import { VENDOR_STEPS, type VendorRow } from "@/lib/eventOverview";
import { categoryLabel, type Contract, type Installment } from "@/lib/types";

export function VendorDrawer({ row, onClose, onPaid }: { row: VendorRow; onClose: () => void; onPaid: () => void }) {
  const { booking } = row;
  const vendor = booking.vendor_name ?? "Vendor";
  const token = booking.contract_token ?? null;
  // The contract carries the vendor's payment handles and the freshest
  // schedule; kept with the token it was read for.
  const [loaded, setLoaded] = useState<{ token: string; contract: Contract } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !booking.signed_at) return;
    let cancelled = false;
    getContract(token)
      .then((contract) => !cancelled && setLoaded({ token, contract }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, booking.signed_at]);
  const contract = loaded && loaded.token === token ? loaded.contract : null;
  const rows = paymentRows(contract ?? booking);

  async function mark(installment: Installment) {
    if (!token) return;
    setBusyId(installment.id);
    setError(null);
    try {
      const next = await markInstallmentSent(token, installment.id);
      setLoaded({ token, contract: next });
      onPaid();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record that payment.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Drawer label={vendor} onClose={onClose}>
      <p className="eyebrow">{categoryLabel(booking.service_category ?? "") || "Vendor"}</p>
      <h2 className="mt-2 font-serif text-2xl font-bold tracking-[-0.02em] text-ink">{vendor}</h2>
      <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm">
        <span className="text-ink-soft">{booking.service_name ?? "Event services"}</span>
        <strong className="font-serif text-ink">{row.detail.split(" · ")[0]}</strong>
      </div>

      <h3 className="mt-6 text-sm font-bold text-ink">Progress</h3>
      <ol aria-label="Progress" className="mt-3 grid grid-cols-4 gap-y-3">
        {VENDOR_STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === row.step ? "step" : undefined}
            className={`grid justify-items-center gap-1 text-center text-[0.65rem] ${i <= row.step ? "text-ink" : "text-ink-faint"}`}
          >
            <span
              className={`grid size-6 place-items-center rounded-full text-[0.7rem] font-bold ${
                i < row.step ? "bg-green text-white" : i === row.step ? "bg-maroon text-white" : "border border-line"
              }`}
            >
              {i < row.step ? "✓" : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <h3 className="mt-6 text-sm font-bold text-ink">Payment schedule</h3>
      {rows.length > 0 ? (
        <div className="mt-3">
          <PaymentSchedule rows={rows} vendorName={vendor} busyId={busyId} onMark={mark} />
          {contract?.vendor_venmo_handle || contract?.vendor_zelle_contact ? (
            <dl className="mt-3 grid gap-2 text-sm">
              {contract.vendor_venmo_handle ? (
                <div className="flex justify-between rounded-xl border border-line bg-card px-4 py-2.5">
                  <dt className="text-ink-soft">Venmo</dt>
                  <dd className="font-semibold text-ink">{contract.vendor_venmo_handle}</dd>
                </div>
              ) : null}
              {contract.vendor_zelle_contact ? (
                <div className="flex justify-between rounded-xl border border-line bg-card px-4 py-2.5">
                  <dt className="text-ink-soft">Zelle</dt>
                  <dd className="font-semibold text-ink">{contract.vendor_zelle_contact}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <p className="mt-2 text-xs text-ink-faint">Jorna tracks these payments, but your money goes straight to {vendor}.</p>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink-soft">
          {booking.signed_at ? "Nothing scheduled — see the contract." : "No payments yet. Nothing is owed until a contract is signed."}
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-2 border-t border-line pt-5 text-sm font-semibold">
        {token ? (
          <Link href={contractInChatPath(booking.booking_id)} className="text-gold hover:underline">
            View contract
          </Link>
        ) : null}
        <Link href={`/bundle?id=${row.bundleId}`} className="text-gold hover:underline">
          Manage this booking in your plan
        </Link>
      </div>
    </Drawer>
  );
}
