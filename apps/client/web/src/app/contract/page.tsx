"use client";

// A contract, read in this app: what was agreed, what's been paid, and the
// signature. Signing still happens on jornaevents.com's no-login page — the
// one page every client signs on, guest or account (backend DECISIONS.md
// #17) — so an unsigned contract here just points there.
//
// Opened by the contract's token, the same credential its link carries;
// the plan passes it from the booking (contractViewPath).

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import { getContract, markInstallmentSent } from "@/lib/jorna";
import {
  bookingStage,
  centsMoney,
  contractProposeUrl,
  contractSignUrl,
  paymentRows,
  STAGE_LABELS,
} from "@/lib/contract";
import { parseServerTime, type Contract, type Installment } from "@/lib/types";
import { PaymentSchedule } from "@/components/PaymentSchedule";
import { Button, Card } from "@jorna/shared/components/ui";

function longDate(iso?: string | null): string | null {
  if (!iso || iso === "TBD") return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function clock(raw?: string | null): string | null {
  const m = raw?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function when(c: Contract): string {
  const start = longDate(c.date_iso) ?? "Date to be confirmed";
  const end = c.date_end && c.date_end !== c.date_iso ? longDate(c.date_end) : null;
  const from = clock(c.time_start);
  const to = clock(c.time_end);
  return [end ? `${start} – ${end}` : start, from && to ? `${from}–${to}` : from].filter(Boolean).join(" · ");
}

function signedOn(ts?: string | null): string | null {
  const ms = parseServerTime(ts);
  return ms === null
    ? null
    : new Date(ms).toLocaleString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/** Where it stands, in the words the plan uses for it. */
function standing(c: Contract, token: string): { text: string; tone: string } {
  // Read by its link, so the payload has no token of its own; the link's is it.
  const stage = bookingStage({ ...c, contract_token: token });
  if (stage === "completed") return { text: STAGE_LABELS.completed, tone: "text-ink-soft" };
  if (stage === "confirmed") return { text: STAGE_LABELS.confirmed, tone: "text-green" };
  if (stage === "deposit_due" || stage === "contract_to_review" || stage === "new_version") {
    return { text: STAGE_LABELS[stage], tone: "text-gold" };
  }
  if (stage === "changes_proposed" || stage === "awaiting_vendor") {
    return { text: STAGE_LABELS[stage], tone: "text-ink-soft" };
  }
  // Signed but off the lifecycle — a booking cancelled after signing.
  if (c.signed_at) return { text: "Signed", tone: "text-ink-soft" };
  switch (c.contract_status) {
    case "expired":
      return { text: "Expired unsigned", tone: "text-maroon dark:text-gold" };
    case "declined":
      return { text: "You declined this", tone: "text-ink-faint" };
    case "voided":
      return { text: "Withdrawn by the vendor", tone: "text-ink-faint" };
    default:
      return { text: "Not sent yet", tone: "text-ink-faint" };
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-line-soft pt-5 print:break-inside-avoid">
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Items({ c }: { c: Contract }) {
  const lines = c.line_items ?? [];
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.length > 0 ? (
          lines.map((l) => (
            <tr key={l.id} className="border-b border-line-soft align-top">
              <td className="py-2 pr-3">
                <span className="text-ink">{l.name}</span>
                {l.quantity !== 1 ? (
                  <span className="text-ink-faint">
                    {" "}
                    · {l.quantity} × {centsMoney(l.unit_price_cents)}
                  </span>
                ) : null}
                {l.description ? <span className="block text-xs text-ink-faint">{l.description}</span> : null}
              </td>
              <td className="py-2 text-right tabular-nums text-ink">{centsMoney(l.total_cents)}</td>
            </tr>
          ))
        ) : (
          <tr className="border-b border-line-soft">
            <td className="py-2 text-ink">{c.service_name || "Package"}</td>
            <td className="py-2 text-right tabular-nums text-ink">{centsMoney(c.amount_cents)}</td>
          </tr>
        )}
        {c.discount_cents ? (
          <tr className="border-b border-line-soft">
            <td className="py-2 text-ink-soft">Discount</td>
            <td className="py-2 text-right tabular-nums text-ink-soft">−{centsMoney(c.discount_cents)}</td>
          </tr>
        ) : null}
        <tr>
          <td className="pt-3 font-semibold text-ink">Total</td>
          <td className="pt-3 text-right font-semibold tabular-nums text-ink">{centsMoney(c.amount_cents)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Terms({ c }: { c: Contract }) {
  const clauses = c.terms_clauses?.length
    ? c.terms_clauses
    : Object.entries(c.contract_terms ?? {})
        .filter(([, body]) => typeof body === "string" && body.trim())
        .map(([key, body]) => ({
          key,
          title: key.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase()),
          body,
        }));
  if (clauses.length === 0) {
    return <p className="text-sm text-ink-soft">No terms beyond the items and payments above.</p>;
  }
  return (
    <div className="grid gap-4">
      {clauses.map((cl) => (
        <div key={cl.key}>
          <h3 className="text-sm font-semibold text-ink">{cl.title}</h3>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{cl.body}</p>
        </div>
      ))}
    </div>
  );
}

function ContractInner() {
  const token = useSearchParams().get("t") ?? "";
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its contract.");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getContract(token)
      .then((c) => !cancelled && setContract(c))
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this contract.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function mark(installment: Installment) {
    setMarkingId(installment.id);
    setNote(null);
    try {
      setContract(await markInstallmentSent(token, installment.id));
      setNote({
        text: `Marked “${installment.label}” as sent. It shows as received once your vendor confirms it arrived.`,
        ok: true,
      });
    } catch (err) {
      setNote({ text: err instanceof ApiError ? err.message : "Couldn't mark this payment as sent.", ok: false });
    } finally {
      setMarkingId(null);
    }
  }

  if (error) {
    return (
      <Card className="mx-auto mt-10 max-w-lg p-6 text-center">
        <p className="text-ink-soft">{error}</p>
        <Link href="/bundles" className="mt-4 inline-block text-sm font-semibold text-gold hover:underline">
          Back to your plans
        </Link>
      </Card>
    );
  }
  if (!contract) return <p className="py-20 text-center text-ink-soft">Loading…</p>;

  const c = contract;
  const vendor = c.vendor_display_name || "Your vendor";
  const status = standing(c, token);
  const rows = paymentRows(c);
  const awaitingSignature = !c.signed_at && (c.contract_status === "sent" || c.contract_status === "viewed");
  // The client signs first, then the vendor; it's booked once both have
  // (backend DECISIONS #34). Older contracts have only signed_at.
  const clientSigned = signedOn(c.client_signed_at ?? c.signed_at);
  const vendorSigned = c.vendor_signer_name ? signedOn(c.vendor_signed_at ?? c.signed_at) : null;

  return (
    <div className="mx-auto w-[min(var(--container-page),100%-2rem)] py-10">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/bundles" className="text-sm text-ink-soft hover:text-ink">
          ← Your plans
        </Link>
        {c.signed_at ? (
          <Button variant="ghost" size="md" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
        ) : null}
      </div>

      <Card className="mt-5 p-6 print:border-0 print:shadow-none">
        <p className="eyebrow">Contract with {vendor}</p>
        <h1 className="serif mt-1 text-3xl text-maroon dark:text-gold">{c.service_name || "Your booking"}</h1>
        <span
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full bg-ground-2 px-2.5 py-0.5 text-xs font-medium ${status.tone}`}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {status.text}
        </span>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">When</dt>
            <dd className="text-ink">{when(c)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Where</dt>
            <dd className="text-ink">{c.location && c.location !== "TBD" ? c.location : "To be confirmed"}</dd>
          </div>
          {c.guest_count ? (
            <div>
              <dt className="text-ink-faint">Guests</dt>
              <dd className="text-ink">{c.guest_count.toLocaleString()}</dd>
            </div>
          ) : null}
          {c.guest_name ? (
            <div>
              <dt className="text-ink-faint">Client</dt>
              <dd className="text-ink">{c.guest_name}</dd>
            </div>
          ) : null}
        </dl>

        {awaitingSignature ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/50 bg-gold/[0.07] p-4 print:hidden">
            <p className="text-sm text-ink-soft">
              {c.proposal_status === "open"
                ? "Your proposed changes are with your vendor. You can still sign it as it is."
                : "Nothing is booked until you sign — and nothing is owed before then."}
            </p>
            {/* The signing page is on the vendor site; see the note at the top. */}
            <div className="flex flex-wrap items-center gap-2">
              {c.proposal_status !== "open" ? (
                <a
                  href={contractProposeUrl(token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink hover:border-gold"
                >
                  Propose changes
                </a>
              ) : null}
              <a
                href={contractSignUrl(token)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-ground hover:brightness-110"
              >
                Review &amp; sign
              </a>
            </div>
          </div>
        ) : null}

        <Section title="What's included">
          <Items c={c} />
        </Section>

        {rows.length > 0 ? (
          <Section title="Payments">
            <PaymentSchedule rows={rows} vendorName={vendor} busyId={markingId} onMark={mark} />
            {note ? (
              <p className={`mt-3 text-sm ${note.ok ? "text-green" : "text-maroon dark:text-gold"}`}>{note.text}</p>
            ) : null}
            {c.vendor_venmo_handle || c.vendor_zelle_contact ? (
              <p className="mt-3 text-sm text-ink-soft">
                Pay {vendor} directly —
                {c.vendor_venmo_handle ? (
                  <>
                    {" "}
                    Venmo <span className="font-medium text-ink">{c.vendor_venmo_handle}</span>
                  </>
                ) : null}
                {c.vendor_venmo_handle && c.vendor_zelle_contact ? " or" : null}
                {c.vendor_zelle_contact ? (
                  <>
                    {" "}
                    Zelle <span className="font-medium text-ink">{c.vendor_zelle_contact}</span>
                  </>
                ) : null}
                . Jorna doesn&apos;t hold the money.
              </p>
            ) : null}
          </Section>
        ) : null}

        <Section title="Terms">
          <Terms c={c} />
        </Section>

        {c.signed_at || c.client_signed_at ? (
          <Section title="Signatures">
            <p className="text-sm text-ink">
              Signed by <span className="font-semibold">{c.signer_name}</span>
              {clientSigned ? ` on ${clientSigned}` : ""}.
            </p>
            {c.vendor_signer_name ? (
              <p className="text-sm text-ink">
                Signed for {vendor} by <span className="font-semibold">{c.vendor_signer_name}</span>
                {vendorSigned ? ` on ${vendorSigned}` : ""}.
              </p>
            ) : !c.signed_at ? (
              <p className="text-sm text-ink-soft">Waiting for {vendor} to sign. It&apos;s booked once they do.</p>
            ) : null}
            {c.signed_snapshot_sha256 ? (
              <p className="mt-1 text-xs text-ink-faint">
                Fingerprint of the signed copy:{" "}
                <span className="font-mono break-all">{c.signed_snapshot_sha256}</span>. Jorna keeps an exact
                copy of what was signed; this is how it can be shown to be unchanged.
              </p>
            ) : null}
          </Section>
        ) : null}
      </Card>
    </div>
  );
}

export default function ContractPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ContractInner />
    </Suspense>
  );
}
