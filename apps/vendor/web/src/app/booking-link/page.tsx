"use client";

// Where a vendor-authored contract link lands (/booking-link?t=…). An
// addendum or cancellation agreement attached to a signed booking has its
// own link, ?d=…, read and signed in DocumentView.
//
// The only page in this app with no account behind it, same shape as the
// old RSVP flow this was cloned from — no sign-in, no app, just the token
// in the URL. Built for someone who found this vendor on Instagram or
// WhatsApp and has never heard of Jorna. An unsigned contract is a few
// steps (lib/linkSteps): their email, their details, the contract — where
// they can ask for changes — then their signature. Jorna never
// touches the money — see the callout below and docs/DECISIONS.md #13 in
// the backend for why that's the whole trust model here.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@jorna/shared/lib/api";
import {
  declineGuestBooking,
  fillGuestBookingDetails,
  getGuestBooking,
  getGuestNegotiation,
  getGuestProposals,
  saveGuestNegotiationDraft,
  sendGuestNegotiation,
  guestMarkDepositPaid,
  guestMarkFullPaid,
  guestMarkInstallmentPaid,
  signGuestBooking,
  requestGuestSigningCode,
  withdrawGuestProposal,
} from "@/lib/jorna";
import { describeDue, fromContract } from "@jorna/shared/lib/contractDraft";
import { termsOf } from "@jorna/shared/lib/contractDiff";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { ContractCompare } from "@jorna/shared/components/negotiation/ContractCompare";
import { ContractPaper } from "@jorna/shared/components/negotiation/ContractPaper";
import type { GuestBooking, Installment, PaidVia, ProposalHistory, SigningProof } from "@/lib/types";
import { DocumentView } from "./DocumentView";
import { SignatureStep } from "./SignatureStep";
import { Stepper } from "./Stepper";
import {
  CONTRACT_STEPS,
  looksLikeEmail,
  rememberDetails,
  rememberedDetails,
  startingStep,
  type LinkStep,
} from "@/lib/linkSteps";
import { ClientNegotiation } from "@/components/negotiation/ClientNegotiation";
import { FieldNegotiationWorkspace } from "@jorna/shared/components/negotiation/FieldNegotiationWorkspace";
import type { FieldNegotiationState } from "@jorna/shared/lib/contractTypes";
import { display } from "@jorna/shared/lib/fieldNegotiation";
import { guestContractPdfUrl } from "@/lib/download";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** One day, or a multi-day event's first and last. */
function dateRange(start: string, end?: string | null): string {
  return end && end !== start ? `${prettyDate(start)} – ${prettyDate(end)}` : prettyDate(start);
}

function mediumDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A venue the vendor wrote in, as opposed to the "TBD" placeholder. */
function isSet(location: string | null | undefined): boolean {
  return Boolean(location && location !== "TBD");
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const hour = Number(m[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${((hour + 11) % 12) + 1}:${m[2]} ${suffix}`;
}

/** What's being bought, line by line, and the total. A contract made before
 *  line items has one line — then the service name above already says it. */
function Items({ booking }: { booking: GuestBooking }) {
  const lines = booking.line_items ?? [];
  if (lines.length <= 1 && !booking.discount_cents && !lines[0]?.description) return null;
  return (
    <table className="mt-3 w-full border-t border-line-soft text-sm">
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-line-soft">
            <td className="py-1.5 text-ink-soft">
              {l.name}
              {l.quantity !== 1 ? ` × ${l.quantity}` : ""}
              {l.description ? <span className="block text-xs text-ink-faint">{l.description}</span> : null}
            </td>
            <td className="py-1.5 text-right text-ink">{money(l.total_cents)}</td>
          </tr>
        ))}
        {booking.discount_cents ? (
          <tr className="border-b border-line-soft">
            <td className="py-1.5 text-ink-soft">Discount</td>
            <td className="py-1.5 text-right text-ink-soft">−{money(booking.discount_cents)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function Schedule({
  schedule,
  onMark,
  busyId,
  ways = [],
}: {
  schedule: Installment[];
  onMark?: (id: string, paidVia: PaidVia) => void;
  busyId?: string | null;
  /** The vendor's own ways to be paid, offered first (backend DECISIONS #33). */
  ways?: PaidVia[];
}) {
  // Which payment is asking "How did you send it?".
  const [asking, setAsking] = useState<string | null>(null);
  const choices: { value: PaidVia; label: string }[] = [
    ...ways.map((w) => ({ value: w, label: w === "venmo" ? "Venmo" : "Zelle" })),
    { value: "other", label: "Other" },
  ];
  return (
    <ul className="grid gap-2 text-sm">
      {schedule.map((i) => {
        const overdue = !i.confirmed_at && !i.marked_paid_at && !!i.due_on && i.due_on < todayIso();
        return (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-ink">
              {i.label} · {money(i.amount_cents)}
            </p>
            <p className={`text-xs ${overdue ? "font-semibold text-maroon dark:text-gold" : "text-ink-faint"}`}>
              {i.confirmed_at
                ? "Received by your vendor"
                : i.marked_paid_at
                  ? "Marked as sent — waiting for your vendor to confirm"
                  : overdue
                    ? `Overdue — was due ${mediumDate(i.due_on!)}`
                    : describeDue(i)}
            </p>
          </div>
          {onMark && !i.marked_paid_at ? (
            asking === i.id ? (
              <div role="group" aria-label="How did you send it?" className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-soft">How did you send it?</span>
                {choices.map((c) => (
                  <Button
                    key={c.value}
                    size="md"
                    variant="ghost"
                    disabled={busyId === i.id}
                    onClick={() => {
                      setAsking(null);
                      onMark(i.id, c.value);
                    }}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            ) : (
              <Button size="md" variant="ghost" disabled={busyId === i.id} onClick={() => setAsking(i.id)}>
                {busyId === i.id ? "Marking…" : "I've sent this"}
              </Button>
            )
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Where a field-by-field negotiation stands, above the contract, and the
 *  way into the workspace (backend DECISIONS #26). */
function FieldStatus({ state, vendorName, onOpen }: { state: FieldNegotiationState; vendorName: string; onOpen: () => void }) {
  const mine = state.turn === "client";
  const waitingOnMe = state.fields.filter((f) => f.state === "waiting_client").length;
  const asks = state.fields.filter((f) => f.state === "waiting_vendor");
  const waitingOnThem = asks.length;
  return (
    <Card className="mt-6 p-5">
      {/* "Round 2" right after their own send read as if the vendor had
          already answered (2026-10-26 test); say what's happening instead. */}
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">
        {waitingOnMe ? "Your turn" : waitingOnThem ? `Waiting on ${vendorName}` : "Agreed"}
      </p>
      <p className="mt-1 text-sm text-ink">
        {waitingOnMe
          ? `${vendorName} answered your changes. ${waitingOnMe === 1 ? "One needs" : `${waitingOnMe} need`} your answer before you sign.`
          : waitingOnThem
            ? `You asked for ${waitingOnThem === 1 ? "a change" : `${waitingOnThem} changes`}. It's ${vendorName}'s turn — we'll email you when they answer.`
            : state.round <= 1
              ? "Read the contract below. Sign it, or ask for a change."
              : "Everything in the contract below is agreed. Read it over and sign, or ask for a change."}
      </p>
      {!waitingOnMe && waitingOnThem ? (
        <ul className="mt-2 grid gap-1 text-sm text-ink-soft">
          {asks.map((f) => (
            <li key={f.key}>
              {f.label}: you asked for <strong className="text-ink">{display(f.key, f.proposed)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Asking for a change sits with Sign under the contract; answering
          the vendor comes first, so it's up here. */}
      {mine && waitingOnMe ? (
        <Button type="button" className="mt-3" onClick={onOpen}>
          Review their answers
        </Button>
      ) : null}
    </Card>
  );
}

/**
 * Where the client's change proposal stands (backend DECISIONS #23): waiting
 * on the vendor, or answered. After an Accept or a Revise it shows what
 * changed between the version they were reading and the one now on the
 * table, so they can see it before signing.
 */
function ProposalStatus({
  booking,
  history,
  vendorName,
  busy,
  onWithdraw,
  onOpen,
}: {
  booking: GuestBooking;
  history: ProposalHistory;
  vendorName: string;
  busy: boolean;
  onWithdraw: (id: string) => void;
  /** The negotiation workspace, where their proposal and the vendor's answers live. */
  onOpen: () => void;
}) {
  const latest = history.proposals[0];
  if (!latest) return null;
  const current = termsOf(booking);
  const versionOf = (revision: number) => history.revisions.find((r) => r.revision === revision)?.terms ?? null;

  if (latest.status === "open") {
    return (
      <section aria-label="Your proposal">
      <Card className="mt-6 p-5">
        <p className="eyebrow">Changes proposed</p>
        <p className="mt-1 text-ink">Waiting for {vendorName}</p>
        <p className="mt-1 text-sm text-ink-soft">
          You sent your changes on {shortDate(latest.created_at)}. We&apos;ll email you when they reply. You can
          still sign the contract as it is — that withdraws your proposal.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="text-sm font-semibold text-gold underline-offset-4 hover:underline"
          >
            See your proposal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onWithdraw(latest.proposal_id)}
            className="text-sm text-ink-faint underline-offset-4 hover:text-ink hover:underline"
          >
            Withdraw it
          </button>
        </div>
      </Card>
      </section>
    );
  }

  // An answer only matters while the version it produced is still the one
  // on the table; a later edit has its own story.
  const answered = latest.status === "accepted" || latest.status === "revised";
  if (answered && latest.result_revision !== booking.revision) return null;
  if (!answered && latest.status !== "declined") return null;
  const before = versionOf(latest.base_revision);

  return (
    <section aria-label="Their reply">
    <Card className="mt-6 p-5">
      <p className="eyebrow">{answered ? "New version to review" : "Your proposal"}</p>
      <p className="mt-1 text-ink">
        {latest.status === "accepted"
          ? `${vendorName} accepted your changes`
          : latest.status === "revised"
            ? `${vendorName} sent a new version`
            : `${vendorName} kept their version`}
      </p>
      {latest.response_note ? (
        <p className="mt-1 text-sm text-ink-soft">They said: “{latest.response_note}”</p>
      ) : null}
      {answered && before ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <p className="mb-2 text-sm font-medium text-ink-soft">What changed</p>
          <ContractCompare before={before} after={current} beforeLabel="Before" afterLabel="Now" />
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 text-sm font-semibold text-gold underline-offset-4 hover:underline"
          >
            See it in the contract
          </button>
        </div>
      ) : null}
      {!answered ? (
        <p className="mt-1 text-sm text-ink-soft">
          The contract below is unchanged. You can sign it, or propose something else.
        </p>
      ) : null}
    </Card>
    </section>
  );
}

/** What signing "as it is" does to the changes still open, naming only the
 *  sides that have any: the vendor's are taken, the client's are dropped
 *  (backend field_negotiation_service.before_signing). */
function signAsIsNote(state: FieldNegotiationState, vendorName: string): string {
  const theirs = state.fields.filter((f) => f.state === "waiting_client").length;
  const mine = state.fields.filter((f) => f.state === "waiting_vendor").length;
  const n = (count: number) => (count === 1 ? "1 change" : `${count} changes`);
  return [
    theirs ? `${vendorName}'s ${n(theirs)} ${theirs === 1 ? "is" : "are"} taken.` : null,
    mine ? `Your ${n(mine)} ${mine === 1 ? "hasn't" : "haven't"} been answered yet; signing drops ${mine === 1 ? "it" : "them"}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A term of the contract the client can read here but not change. */
function SetTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">{children}</div>;
}

function BookingLinkInner() {
  const params = useSearchParams();
  const token = params.get("t") ?? "";
  // The vendor's own "View as client" (guestBookingPreviewLink): same page,
  // but it mustn't count as the client opening it, or act on their behalf.
  const preview = params.get("preview") === "1";

  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [loadError, setLoadError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [location, setLocation] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [signerName, setSignerName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  // Change proposals (backend DECISIONS #23). ?propose=1 — the client app's
  // "Propose changes" — opens straight into the form.
  const [history, setHistory] = useState<ProposalHistory | null>(null);
  // Opens once the client reaches the contract, not over the email step.
  const wantsPropose = params.get("propose") === "1" && !preview;
  const [proposing, setProposing] = useState(false);
  // Null until the booking loads; then where this visit starts.
  const [step, setStep] = useState<LinkStep | null>(null);
  const [proposalNotice, setProposalNotice] = useState<string | null>(null);
  // Field-by-field contracts (backend DECISIONS #26) replace proposals; a
  // 409 from the negotiation route leaves this null.
  const [fields, setFields] = useState<FieldNegotiationState | null>(null);
  const [signAsIs, setSignAsIs] = useState(false);
  // The emailed code + consent box (backend DECISIONS #27); null until both are in.
  const [proof, setProof] = useState<SigningProof | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // An older backend has no proposals; the page reads fine without them.
    getGuestProposals(token)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => undefined);
    getGuestNegotiation(token)
      .then((f) => !cancelled && setFields(f))
      .catch(() => undefined);
    getGuestBooking(token, preview)
      .then((b) => {
        if (cancelled) return;
        setBooking(b);
        setGuestName(b.guest_name ?? "");
        setGuestEmail(b.guest_email ?? "");
        setGuestPhone(b.guest_phone ?? "");
        setLocation(b.location === "TBD" ? "" : b.location);
        setGuestCount(b.guest_count?.toString() ?? "");
        // The vendor's preview walks the steps from the start, as a client would.
        const start = preview ? "email" : startingStep(b, rememberedDetails(token));
        setStep(start);
        if (start === "review" && wantsPropose) setProposing(true);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This link isn't valid. Check you copied all of it, or ask your vendor for a new one."
            : "Couldn't open this booking. Check your connection and try again.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, preview, wantsPropose]);

  function goTo(next: LinkStep) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function askForChanges() {
    setProposalNotice(null);
    setProposing(true);
    window.scrollTo({ top: 0 });
  }

  /** Step 1. Saved as soon as it's given, so the vendor can reach them —
   *  and so a different email than the vendor typed shows on their side. */
  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = guestEmail.trim();
    // The vendor's preview walks the steps without filling them in.
    if (preview) return goTo("details");
    if (!looksLikeEmail(email)) {
      setError("Enter the email you'd like your copy sent to.");
      return;
    }
    if (email === (booking?.guest_email ?? "")) return goTo("details");
    setBusy(true);
    setError(null);
    try {
      setBooking(await fillGuestBookingDetails(token, { guest_email: email }));
      goTo("details");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Step 2. A set venue or guest count isn't the client's to change here —
   *  that's a change to ask for (backend #27 note). */
  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    const enter = () => {
      goTo("review");
      if (wantsPropose) setProposing(true);
    };
    if (preview) return enter();
    if (!guestName.trim()) {
      setError("Add your full name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setBooking(
        await fillGuestBookingDetails(token, {
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim() || null,
          location: isSet(booking?.location) ? null : location.trim() || null,
          guest_count: booking?.guest_count != null || !guestCount ? null : Number(guestCount),
        }),
      );
      rememberDetails(token);
      enter();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your details. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  /** A 410 means the offer ended while this page was open: the hold ran
   *  out, or the vendor withdrew it. Reload it, so the page says which
   *  instead of leaving an error on a form that can't be sent any more. */
  function endedWhileOpen(err: unknown): boolean {
    if (!(err instanceof ApiError && err.status === 410)) return false;
    setProposing(false);
    getGuestBooking(token, preview).then(setBooking).catch(() => undefined);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const waiting = fields ? fields.waiting_count > 0 : false;
      if (waiting && !signAsIs) {
        setError("Some changes are still waiting. Answer them first, or tick “Sign it as it is”.");
        return;
      }
      const signed = await signGuestBooking(token, signerName, booking?.revision, waiting && signAsIs, proof);
      setBooking(signed);
    } catch (err) {
      if (endedWhileOpen(err)) return;
      // The vendor changed it after this page loaded: show the new version,
      // keep what the client typed, and say why they're signing again.
      if (err instanceof ApiError && err.status === 409) {
        getGuestBooking(token, preview).then(setBooking).catch(() => undefined);
        getGuestProposals(token).then(setHistory).catch(() => undefined);
        getGuestNegotiation(token).then(setFields).catch(() => undefined);
      }
      setError(
        err instanceof ApiError ? err.message : "Couldn't send your reply. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    setProposalNotice(null);
    try {
      setHistory(await withdrawGuestProposal(token, id));
      setProposalNotice("Withdrawn. The contract is as it was.");
    } catch (err) {
      setProposalNotice(err instanceof ApiError ? err.message : "Couldn't withdraw that.");
      getGuestProposals(token).then(setHistory).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      setBooking(await declineGuestBooking(token, declineReason.trim() || null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function markInstallment(id: string, paidVia: PaidVia) {
    setPaymentBusy(id);
    setPaymentNotice(null);
    try {
      setBooking(await guestMarkInstallmentPaid(token, id, paidVia));
      setPaymentNotice("Marked as sent — your vendor still needs to confirm receiving it.");
    } catch (err) {
      setPaymentNotice(err instanceof ApiError ? err.message : "Couldn't mark that as sent.");
    } finally {
      setPaymentBusy(null);
    }
  }

  async function reportPaid(kind: "deposit" | "full") {
    setPaymentBusy(kind);
    setPaymentNotice(null);
    try {
      if (kind === "deposit") await guestMarkDepositPaid(token);
      else await guestMarkFullPaid(token);
      const refreshed = await getGuestBooking(token);
      setBooking(refreshed);
      setPaymentNotice("Marked as paid — your vendor still needs to confirm receiving it.");
    } catch (err) {
      setPaymentNotice(err instanceof ApiError ? err.message : "Couldn't mark that as paid.");
    } finally {
      setPaymentBusy(null);
    }
  }

  if (!token) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">Booking link</h1>
        <p className="mt-3 text-ink-soft">
          This link is missing its code. Ask your vendor to send it again.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return <p className="py-20 text-center text-ink-soft">Opening your booking…</p>;
  }

  if (loadError || !booking) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">We couldn&apos;t open this</h1>
        <p className="mt-3 text-ink-soft">{loadError}</p>
      </Shell>
    );
  }

  const vendorName = booking.vendor_display_name ?? "your vendor";
  // Terms of the contract: the client fills them in only where the vendor
  // left them blank; changing a set one is a negotiation (backend #27 note).
  const venueSet = isSet(booking.location);
  const guestsSet = booking.guest_count != null;
  const canAskForChange = !preview && Boolean(fields || history);
  const holdUntil = booking.hold_expires_at
    ? new Date(booking.hold_expires_at).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  if (booking.contract_status === "declined") {
    return (
      <Shell>
        <p className="eyebrow">Declined</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">You turned this offer down</h1>
        <p className="mt-3 text-ink-soft">
          We let {vendorName} know. Nothing was signed and nothing is owed. If you change your
          mind, ask them for a new link.
        </p>
      </Shell>
    );
  }

  // The client signed and the vendor chose not to (backend DECISIONS #34).
  if (booking.status === "rejected" && booking.rejected_reason === "vendor_declined_signature") {
    return (
      <Shell>
        <p className="eyebrow">Not signed</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">{vendorName} didn&apos;t sign this</h1>
        <p className="mt-3 text-ink-soft">
          You signed, but {vendorName} decided not to, so it isn&apos;t booked and nothing is owed.
        </p>
        {booking.vendor_decline_note ? (
          <p className="mt-3 text-ink-soft">They said: “{booking.vendor_decline_note}”</p>
        ) : null}
      </Shell>
    );
  }

  // A booking both sides signed, then cancelled by the vendor (backend
  // DECISIONS #37). It was agreed and may have been paid toward, so it never
  // reads as "nothing was signed and nothing is owed".
  if (booking.status === "rejected" && booking.signed_at) {
    const received = (booking.payment_schedule ?? []).filter((i) => i.confirmed_at);
    const receivedCents = received.reduce((sum, i) => sum + i.amount_cents, 0);
    return (
      <Shell>
        <p className="eyebrow">Cancelled</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">
          {vendorName} cancelled your booking for {prettyDate(booking.date_iso)}
        </h1>
        {booking.vendor_decline_note ? (
          <p className="mt-3 text-ink-soft">They said: “{booking.vendor_decline_note}”</p>
        ) : null}
        <p className="mt-3 text-ink-soft">
          You both signed this agreement, so its cancellation terms still apply.{" "}
          {receivedCents > 0
            ? `${vendorName} confirmed receiving ${money(receivedCents)} from you. Talk to them about what happens to it — Jorna doesn't hold the money.`
            : `${vendorName} hadn't confirmed receiving any payment from you.`}
        </p>
        <a
          href={guestContractPdfUrl(token)}
          download
          className="mt-4 inline-block text-sm font-semibold text-gold hover:underline"
        >
          Download your signed copy (PDF)
        </a>
      </Shell>
    );
  }

  // Voided by the vendor. The backend still serves the link so this can say
  // so, instead of the generic "not valid" a dead token gets.
  if (booking.status === "rejected") {
    return (
      <Shell>
        <p className="eyebrow">Withdrawn</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">
          {vendorName} withdrew this booking offer
        </h1>
        <p className="mt-3 text-ink-soft">
          Nothing was signed and nothing is owed. If you still want to book, ask{" "}
          {vendorName} to send you a new link.
        </p>
      </Shell>
    );
  }

  // The vendor held the date for a while; once that ran out it may have gone
  // to someone else, so the backend won't take a signature until they resend.
  if (booking.contract_status === "expired" && !booking.signed_at) {
    return (
      <Shell>
        <p className="eyebrow">Expired</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">This offer has expired</h1>
        <p className="mt-3 text-ink-soft">
          {vendorName} was holding {prettyDate(booking.date_iso)} for you
          {holdUntil ? ` until ${holdUntil}` : ""}. If you&apos;d still like to book, ask them to
          resend it — they&apos;ll check the date is still free.
        </p>
      </Shell>
    );
  }

  // Signed by the client; booked once the vendor signs too (DECISIONS #34).
  if (booking.contract_status === "awaiting_vendor" && !booking.signed_at) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-14">
        <div className="text-center">
          <p className="eyebrow">You signed</p>
          <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">Waiting for {vendorName} to sign</h1>
          <p className="mt-2 text-ink-soft">
            Signed by {booking.signer_name}
            {booking.client_signed_at ? ` on ${mediumDate(booking.client_signed_at)}` : ""}. {vendorName} signs next,
            and it&apos;s booked once they do. {prettyDate(booking.date_iso)} is held for you until then.
          </p>
          <p className="mt-2 text-ink-soft">We&apos;ll email you the signed copy, with both signatures, as soon as it&apos;s booked.</p>
        </div>
        <Card className="mt-6 p-5">
          <h2 className="serif text-lg text-ink">{booking.service_name ?? "Service"}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {dateRange(booking.date_iso, booking.date_end)} · {prettyTime(booking.time_start)}–{prettyTime(booking.time_end)}
          </p>
          <p className="text-sm text-ink-faint">{booking.location}</p>
          <Items booking={booking} />
          <p className="mt-3 text-sm text-ink-soft">Total: {money(booking.amount_cents)}</p>
        </Card>
        <p className="mt-4 text-center text-sm text-ink-faint">Nothing is due until {vendorName} has signed.</p>
      </div>
    );
  }

  const schedule = booking.payment_schedule?.length ? booking.payment_schedule : null;
  const depositDue =
    booking.deposit_percent != null && booking.deposit_amount_cents != null
      ? money(booking.deposit_amount_cents)
      : null;

  if (booking.signed_at) {
    const depositPaid = Boolean(booking.deposit_marked_paid_at);
    const depositConfirmed = Boolean(booking.deposit_confirmed_received_at);
    const fullyPaid = booking.payment_status === "marked_paid" || booking.payment_status === "confirmed_paid";
    // The vendor's side calls this "Deposit due" until the first payment
    // arrives, so the client's side mustn't call it set.
    const first = schedule?.[0];
    const securedBy = first
      ? first.confirmed_at ? null : `${first.label.toLowerCase()} (${money(first.amount_cents)})`
      : depositDue && !depositConfirmed ? `${depositDue} deposit` : null;

    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-14">
        <div className="text-center">
          <p className="eyebrow">Signed</p>
          <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">You signed with {vendorName}</h1>
          <p className="mt-2 text-ink-soft">
            Signed by {booking.signer_name} on {mediumDate(booking.client_signed_at ?? booking.signed_at)}
            {booking.vendor_signer_name
              ? ` and by ${booking.vendor_signer_name} on ${mediumDate(booking.vendor_signed_at ?? booking.signed_at)}`
              : ""}
            .
          </p>
          {securedBy ? (
            <p className="mt-1 text-ink-soft">
              Your date is secured once {vendorName} receives the {securedBy}.
            </p>
          ) : null}
        </div>

        <Card className="mt-6 p-5">
          <h2 className="serif text-lg text-ink">{booking.service_name ?? "Service"}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {dateRange(booking.date_iso, booking.date_end)} · {prettyTime(booking.time_start)}–{prettyTime(booking.time_end)}
          </p>
          <p className="text-sm text-ink-faint">{booking.location}</p>
          <Items booking={booking} />
          <p className="mt-3 text-sm text-ink-soft">Total: {money(booking.amount_cents)}</p>
          {depositDue && !schedule ? (
            <p className="text-sm text-ink-soft">
              Deposit due: {depositDue} {depositPaid ? "— marked paid" : ""}
              {depositConfirmed ? " (confirmed)" : ""}
            </p>
          ) : null}
        </Card>

        <div className="mt-4 rounded-lg bg-gold/10 px-4 py-3 text-sm text-ink-soft">
          You&apos;ll pay {vendorName} directly — Jorna doesn&apos;t handle the money.{" "}
          {booking.vendor_venmo_handle ? `Venmo: ${booking.vendor_venmo_handle}` : null}
          {booking.vendor_venmo_handle && booking.vendor_zelle_contact ? " · " : null}
          {booking.vendor_zelle_contact ? `Zelle: ${booking.vendor_zelle_contact}` : null}
        </div>

        {paymentNotice ? (
          <p className="mt-4 rounded-lg bg-ground-2 px-3 py-2 text-center text-sm text-ink-soft">
            {paymentNotice}
          </p>
        ) : null}

        {schedule ? (
          <Card className="mt-5 p-5">
            <p className="mb-3 text-sm font-medium text-ink-soft">Your payments</p>
            <Schedule
              schedule={schedule}
              onMark={preview ? undefined : markInstallment}
              busyId={paymentBusy}
              ways={[
                ...(booking.vendor_venmo_handle ? (["venmo"] as const) : []),
                ...(booking.vendor_zelle_contact ? (["zelle"] as const) : []),
              ]}
            />
          </Card>
        ) : (
        <div className="mt-5 grid gap-2">
          {depositDue && !depositPaid ? (
            <Button disabled={paymentBusy === "deposit"} onClick={() => reportPaid("deposit")}>
              {paymentBusy === "deposit" ? "Marking…" : "I've paid the deposit"}
            </Button>
          ) : null}
          {!fullyPaid ? (
            <Button variant={depositDue ? "ghost" : "primary"} disabled={paymentBusy === "full"} onClick={() => reportPaid("full")}>
              {paymentBusy === "full" ? "Marking…" : "I've paid in full"}
            </Button>
          ) : (
            <p className="text-center text-sm text-green">Marked as fully paid.</p>
          )}
        </div>
        )}
        <div className="mt-6 text-center">
          <a
            href={guestContractPdfUrl(token)}
            download
            className="inline-flex items-center rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold"
          >
            Download your signed copy (PDF)
          </a>
        </div>
        {booking.signed_snapshot_sha256 ? (
          <p className="mt-4 break-all text-center text-xs text-ink-faint">
            Your signed copy&apos;s fingerprint (SHA-256): {booking.signed_snapshot_sha256}
          </p>
        ) : null}
      </div>
    );
  }

  const current = step ?? "email";
  // Anything still open in the negotiation: signing now takes it as it
  // stands (field by field), or withdraws the client's proposal (older flow).
  const openAsks = fields ? fields.waiting_count > 0 : Boolean(history?.open_proposal);
  const clientsTurn = !fields || fields.turn === "client";
  const waitingOnMe = fields ? fields.fields.filter((f) => f.state === "waiting_client").length : 0;
  const alert = error ? (
    <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
      {error}
    </p>
  ) : null;

  return (
    <div className="mx-auto w-[min(560px,100%-2rem)] py-12">
      {preview ? (
        <p className="mb-6 rounded-lg bg-panel px-3 py-2 text-center text-sm text-ink-soft">
          Preview — this is what your client sees. Opening it here doesn&apos;t count as them
          opening it, and nothing you type is saved.
        </p>
      ) : null}
      <div className="text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">{vendorName} sent you a contract</h1>
        {/* What it is before they're asked for anything — the email and
            details steps showed no title, date or price (2026-10-26 test). */}
        <p className="mt-2 text-ink">
          {booking.document_title || `${booking.service_name ?? "Services"} agreement`} ·{" "}
          {dateRange(booking.date_iso, booking.date_end)} · {money(booking.amount_cents)}
        </p>
        {holdUntil ? (
          <p className="mt-2 text-sm text-ink-soft">
            {vendorName} is holding this date for you until {holdUntil}.
          </p>
        ) : null}
      </div>

      <Stepper steps={CONTRACT_STEPS} current={current} onPick={goTo} openAll={preview} />

      {proposing && fields ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-ground">
          <FieldNegotiationWorkspace
            key={fields.round}
            state={fields}
            title={booking.document_title || `${booking.service_name ?? "Services"} agreement`}
            vendorName={vendorName}
            clientName={booking.guest_name || "You"}
            onClose={() => setProposing(false)}
            footerNote={
              holdUntil ? <>{vendorName} is holding your date until {holdUntil} — send your answers before then.</> : null
            }
            onSaveDraft={async (answers, message) => {
              try {
                await saveGuestNegotiationDraft(token, answers, message);
              } catch (err) {
                endedWhileOpen(err);
                throw err;
              }
            }}
            onSend={async (answers, message) => {
              let next: FieldNegotiationState;
              try {
                next = await sendGuestNegotiation(token, fields.round, answers, message);
              } catch (err) {
                endedWhileOpen(err);
                throw err;
              }
              setFields(next);
              setProposing(false);
              setProposalNotice(
                next.can_sign
                  ? "Everything's agreed. You can sign it now."
                  : `Sent to ${vendorName}. It's their turn — we'll email you when they answer.`,
              );
              getGuestBooking(token, true).then(setBooking).catch(() => undefined);
              goTo("review");
            }}
          />
        </div>
      ) : null}
      {proposing && history && !fields ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-ground">
          <ClientNegotiation
            token={token}
            booking={booking}
            history={history}
            onClose={() => setProposing(false)}
            onHistory={(h, message) => {
              setHistory(h);
              setProposing(false);
              setProposalNotice(message);
              getGuestBooking(token, true).then(setBooking).catch(() => undefined);
              goTo("review");
            }}
          />
        </div>
      ) : null}

      {current === "email" ? (
        <form onSubmit={saveEmail} className="mt-8 grid gap-4" noValidate>
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-soft">Where should we send your copy?</p>
            <p className="mt-1 text-xs text-ink-faint">
              We&apos;ll email you when {vendorName} replies, and send your signed copy here.
            </p>
            <div className="mt-3">
              <Field
                label="Your email"
                type="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                required
              />
            </div>
            {booking.guest_email && guestEmail.trim() && guestEmail.trim() !== booking.guest_email ? (
              <p className="mt-2 text-xs text-ink-faint">
                {vendorName} had {booking.guest_email}. They&apos;ll see you changed it.
              </p>
            ) : null}
          </Card>
          {alert}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </form>
      ) : null}

      {current === "details" ? (
        <form onSubmit={saveDetails} className="mt-8 grid gap-4" noValidate>
          <Card className="p-5">
            <p className="text-sm font-medium text-ink-soft">Your details</p>
            <div className="mt-3 grid gap-3">
              <Field
                label="Your full name"
                autoComplete="name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
              <Field label="Phone (optional)" type="tel" autoComplete="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
              {venueSet ? (
                <SetTerm label="Venue" value={booking.location} />
              ) : (
                <Field
                  label="Venue address"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Where the event will be"
                />
              )}
              {guestsSet ? (
                <SetTerm label="Guest count" value={String(booking.guest_count)} />
              ) : (
                <Field
                  label="Guest count"
                  type="number"
                  min={1}
                  hint="Helps your vendor plan. Your price is the total in the contract."
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              )}
              {venueSet || guestsSet ? (
                <p className="text-xs text-ink-faint">
                  {venueSet && guestsSet ? "These are" : "This is"} part of the contract.{" "}
                  {canAskForChange ? (
                    <>You can ask {vendorName} to change {venueSet && guestsSet ? "them" : "it"} in the next step.</>
                  ) : (
                    <>To change {venueSet && guestsSet ? "them" : "it"}, ask {vendorName}.</>
                  )}
                </p>
              ) : null}
            </div>
          </Card>
          {alert}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => goTo("email")}>
              Back
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={busy}>
              {busy ? "Saving…" : "Continue to the contract"}
            </Button>
          </div>
        </form>
      ) : null}

      {current === "review" ? (
        <>
          {proposalNotice ? (
            <p role="status" className="mt-6 rounded-lg bg-ground-2 px-3 py-2 text-center text-sm text-ink-soft">
              {proposalNotice}
            </p>
          ) : null}
          {fields ? <FieldStatus state={fields} vendorName={vendorName} onOpen={askForChanges} /> : null}
          {history && !fields ? (
            <ProposalStatus
              booking={booking}
              history={history}
              vendorName={vendorName}
              busy={busy}
              onWithdraw={withdraw}
              onOpen={askForChanges}
            />
          ) : null}

          {/* The contract as the vendor laid it out — the same page their
              preview and the PDF show — so what's signed is what was agreed:
              title, section order and the cancellation window included
              (2026-10-26 test). */}
          <div className="mt-8">
            <ContractPaper
              draft={fromContract(booking)}
              markOf={() => null}
              vendorName={vendorName}
              clientName={booking.guest_name || "Client"}
              title={booking.document_title || `${booking.service_name ?? "Services"} agreement`}
            />
          </div>
          {/* The contract states the rule ("14 days before the event"); the
              client also needs the dates, and which are already late. */}
          {schedule ? (
            <Card className="mt-4 p-5">
              <p className="mb-2 text-sm font-medium text-ink-soft">How you&apos;ll pay</p>
              <Schedule schedule={schedule} />
            </Card>
          ) : null}
          <p className="mt-4 rounded-lg bg-gold/10 px-3 py-2.5 text-sm text-ink-soft">
            <strong className="text-ink">You&apos;ll pay {vendorName} directly</strong> — Jorna
            doesn&apos;t handle the money. This is your written agreement.
          </p>
          <a
            href={guestContractPdfUrl(token)}
            download
            className="mt-3 inline-block text-sm font-semibold text-gold underline-offset-4 hover:underline"
          >
            Download as PDF to read later
          </a>

          <div className="mt-6 grid gap-2">
            <Button type="button" size="lg" variant={openAsks || waitingOnMe ? "ghost" : "primary"} onClick={() => goTo("sign")}>
              {openAsks ? "Sign it as it is" : "Looks good — sign it"}
            </Button>
            {canAskForChange && clientsTurn && !waitingOnMe ? (
              <Button type="button" size="lg" variant="ghost" onClick={askForChanges}>
                {history?.open_proposal && !fields ? "Change your proposal" : "Ask for changes"}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {current === "sign" ? (
        <form onSubmit={submit} className="mt-8 grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-soft">
            <span>
              {booking.service_name ?? "Service"} · {money(booking.amount_cents)}
            </span>
            <button
              type="button"
              onClick={() => goTo("review")}
              className="font-semibold text-gold underline-offset-4 hover:underline"
            >
              Back to the contract
            </button>
          </div>

          <SignatureStep
            kindLabel="agreement"
            signerName={signerName}
            onSignerName={setSignerName}
            nameOnContract={booking.guest_name ?? guestName}
            vendorName={vendorName}
            consent={booking.esign_consent}
            onProof={setProof}
            disabled={preview}
            sendCode={async () => {
              // Step 1 saved it; a vendor may have cleared it since.
              if (!booking.guest_email) throw new ApiError(400, "Add your email first — go back to the first step");
              return requestGuestSigningCode(token);
            }}
          />

          {fields && fields.waiting_count > 0 ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-card-edge px-3 py-2.5 text-sm text-ink-soft">
              <input type="checkbox" className="mt-1" checked={signAsIs} onChange={(e) => setSignAsIs(e.target.checked)} />
              <span>Sign it as it is. {signAsIsNote(fields, vendorName)}</span>
            </label>
          ) : null}

          {alert}

          <div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={busy || preview || !signerName.trim() || (!!booking.esign_consent && !proof)}
            >
              {busy ? "Signing…" : "Sign the contract →"}
            </Button>
            <p className="mt-2 text-center text-xs text-ink-faint">
              Signing is your electronic signature on this agreement. {vendorName} signs next; it&apos;s booked once they do, and we&apos;ll email you both a signed copy then.
            </p>
          </div>
        </form>
      ) : null}

      <div className="mt-8 border-t border-line-soft pt-6 text-center">
        {declining ? (
          <div className="grid gap-3 text-left">
            <Field
              label={`Anything you'd like ${vendorName} to know? (optional)`}
              value={declineReason}
              maxLength={500}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
            <div className="flex justify-center gap-2">
              <Button variant="ghost" disabled={busy || preview} onClick={decline}>
                {busy ? "Sending…" : "Decline this offer"}
              </Button>
              <Button variant="quiet" onClick={() => setDeclining(false)}>
                Never mind
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="text-sm text-ink-faint underline-offset-4 hover:text-ink hover:underline"
          >
            Not going ahead? Let {vendorName} know
          </button>
        )}
      </div>
    </div>
  );
}

function LinkRouter() {
  const params = useSearchParams();
  const documentToken = params.get("d");
  return documentToken ? (
    <DocumentView token={documentToken} preview={params.get("preview") === "1"} />
  ) : (
    <BookingLinkInner />
  );
}

export default function BookingLinkPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <LinkRouter />
    </Suspense>
  );
}
