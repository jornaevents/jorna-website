"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError } from "@jorna/shared/lib/api";
import { Button } from "@jorna/shared/components/ui";
import { confirmInstallment, markPaymentNotReceived, remindPayment } from "@/lib/jorna";
import { downloadContractPdf, downloadDocumentPdf } from "@/lib/download";
import { STATUS, dueRule, firstName, history, money, shortDate } from "@/lib/ledger";
import type { LedgerRow } from "@/lib/types";
import { Drawer, StatusPill } from "@/components/vendor/ui";

/** One payment: what it is, what happened to it, the signed contract that
 *  set it, and what the vendor can do (DECISIONS 2026-10-17). */
export function PaymentDrawer({
  row,
  showProof,
  onClose,
  onChanged,
}: {
  row: LedgerRow | null;
  /** Opened from the Contract link: start at the proof. */
  showProof: boolean;
  onClose: () => void;
  /** Something changed on the server; the ledger reloads. */
  onChanged: () => void;
}) {
  // Keyed by row (see the ledger), so each payment's drawer starts clean.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const proofRef = useRef<HTMLElement | null>(null);

  const rowId = row?.row_id;
  useEffect(() => {
    if (rowId && showProof) proofRef.current?.scrollIntoView({ block: "start" });
  }, [rowId, showProof]);

  if (!row) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const b = row.booking;
  const who = firstName(b.client_name);
  const installment = row.installment_id;

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setConfirming(false);
      setNotice(done);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const undo = () => run("undo", () => markPaymentNotReceived(row.booking_id, installment!), row.status === "received" ? "Your confirmation is taken back." : `We've told ${who} it hasn't arrived.`);

  const actions = (() => {
    if (!installment) return null;
    if (confirming) {
      const ask =
        row.status === "received"
          ? row.marked_by_client
            ? `Undo your confirmation? It goes back to waiting for you, since ${who} said it's sent.`
            : "Undo your confirmation? It goes back to not paid."
          : `Tell ${who} you haven't received it? Their mark is cleared and we email them.`;
      return (
        <div className="grid gap-2" role="group" aria-label="Confirm undo">
          <p className="text-sm text-ink">{ask}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy != null} onClick={undo}>
              {busy === "undo" ? "Moving it back…" : "Move it back"}
            </Button>
            <Button variant="ghost" disabled={busy != null} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      );
    }
    if (row.status === "client_says_sent") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy != null} onClick={() => run("confirm", () => confirmInstallment(row.booking_id, installment), "Confirmed. It's in your received earnings.")}>
            {busy === "confirm" ? "Confirming…" : "Confirm received"}
          </Button>
          <Button variant="ghost" disabled={busy != null} onClick={() => setConfirming(true)}>
            I haven&apos;t received it
          </Button>
        </div>
      );
    }
    if (row.status === "received") {
      return (
        <Button variant="quiet" disabled={busy != null} onClick={() => setConfirming(true)}>
          Mark as not received
        </Button>
      );
    }
    if (row.status === "overdue") {
      return (
        <Button
          disabled={busy != null || !row.can_remind}
          onClick={() => run("remind", () => remindPayment(row.booking_id, installment), `We emailed ${who} a reminder.`)}
        >
          {busy === "remind" ? "Sending…" : row.can_remind ? "Remind client" : "Reminded today"}
        </Button>
      );
    }
    return null;
  })();

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${row.label}, ${b.client_name}`}
      subtitle={[b.event_name, b.location].filter(Boolean).join(" · ") || undefined}
      footer={actions}
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-card-edge bg-card p-4">
        <div>
          <p className="text-xs font-semibold text-ink-faint">Amount</p>
          <p className="serif text-2xl text-ink">{money(row.amount_cents)}</p>
        </div>
        <StatusPill tone={STATUS[row.status].tone} dot>
          {STATUS[row.status].label}
        </StatusPill>
      </div>

      {notice ? (
        <p role="status" className="mt-4 rounded-lg bg-ground-2 px-3 py-2 text-sm text-ink-soft">
          ✓ {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <section aria-label="What happened" className="mt-6">
        <p className="eyebrow">What happened</p>
        <ol className="mt-3 grid gap-3 border-l border-line pl-4">
          {history(row).map((line, i) => (
            <li key={i} className={`relative text-sm ${line.done ? "text-green" : "text-ink"}`}>
              <i aria-hidden="true" className={`absolute -left-[1.3rem] top-1.5 size-2 rounded-full ${line.done ? "bg-green" : "bg-ink-faint"}`} />
              {line.text}
            </li>
          ))}
        </ol>
      </section>

      <section ref={proofRef} aria-label="Proof" className="mt-6 scroll-mt-4">
        <p className="eyebrow">Proof</p>
        {b.has_contract ? (
          <div className="mt-3 grid gap-3 rounded-xl border border-card-edge bg-card p-4">
            <div>
              <p className="font-semibold text-ink">{b.contract_title}</p>
              <p className="text-xs text-ink-faint">
                Signed by {b.signed_by ?? b.client_name}
                {b.signed_at ? ` on ${new Date(b.signed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
              </p>
            </div>
            <div className="rounded-lg bg-ground-2 p-3 text-sm">
              <p className="text-xs font-semibold text-ink-faint">From the signed payment schedule</p>
              <p className="mt-1 text-ink">
                {row.label} — {money(row.amount_cents)}
                {row.due_on ? `, due ${shortDate(row.due_on)} (${dueRule(row)})` : ""}
              </p>
              {b.total_cents != null ? <p className="mt-1 text-xs text-ink-faint">Contract total {money(b.total_cents)}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/contracts/view?id=${b.booking_id}`}
                className="inline-flex items-center rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.04]"
              >
                Open contract
              </Link>
              <Button variant="ghost" onClick={() => downloadContractPdf(b.booking_id).catch(() => setError("Couldn't download the PDF. Try again."))}>
                Download signed PDF
              </Button>
              {b.cancellation_document_id ? (
                <Button variant="ghost" onClick={() => downloadDocumentPdf(b.cancellation_document_id!).catch(() => setError("Couldn't download the PDF. Try again."))}>
                  Cancellation agreement
                </Button>
              ) : null}
            </div>
            {b.addenda_count > 0 ? (
              <p className="text-xs text-ink-faint">
                {b.addenda_count === 1 ? "1 addendum" : `${b.addenda_count} addenda`} on this booking — open the contract to read {b.addenda_count === 1 ? "it" : "them"}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">Booked before Jorna had contracts, so there&apos;s no signed copy.</p>
        )}
      </section>
    </Drawer>
  );
}
