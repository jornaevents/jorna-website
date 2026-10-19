"use client";

// One contract, from the vendor's side: what it says, where each payment
// stands, what happened when, and what can be done next — send or resend,
// edit, void, confirm a payment arrived.
//
// /contracts/view?id=… rather than /contracts/[id]: the site is a static
// export, so a page per contract can't be generated ahead of time.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  confirmInstallment,
  countersignContract,
  countersignDocument,
  declineContractSignature,
  declineDocumentSignature,
  getContract,
  listDocuments,
  sendContract,
  sendDocument,
  voidContract,
  voidDocument,
} from "@/lib/jorna";
import { KIND_LABEL, documentStatus } from "@/lib/attachedDocuments";
import { downloadContractPdf, downloadDocumentPdf } from "@/lib/download";
import { describeDue, describeWhen, money } from "@jorna/shared/lib/contractDraft";
import {
  emailNotice,
  guestBookingLink,
  guestBookingPreviewLink,
  guestDocumentLink,
  guestDocumentPreviewLink,
} from "@/lib/contractLink";
import { describeEvent, prettyDate, visibleEvents } from "@/lib/contractTimeline";
import { changesWaiting } from "@/lib/vendorPlan";
import type { AttachedDocument, Contract, Installment } from "@/lib/types";
import { CountersignPanel } from "@/components/vendor/CountersignPanel";
import { Button, Card, LinkButton } from "@jorna/shared/components/ui";
import { StatusPill } from "@/components/vendor/ui";


function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft — not sent",
  sent: "Sent — not opened yet",
  viewed: "Opened — awaiting signature",
  awaiting_vendor: "Signed by your client — your signature next",
  expired: "Expired — date released",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
};


function installmentState(i: Installment): { text: string; tone: string } {
  if (i.confirmed_at) return { text: "Received", tone: "text-green" };
  if (i.marked_paid_at) {
    const via = i.paid_via === "venmo" ? " by Venmo" : i.paid_via === "zelle" ? " by Zelle" : "";
    return { text: `Client says it's sent${via}`, tone: "text-maroon dark:text-gold" };
  }
  return { text: describeDue(i), tone: "text-ink-soft" };
}

function ContractViewInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  // What the negotiation workspace just did, when it sends the vendor here.
  const notice = params.get("notice");

  const [c, setC] = useState<Contract | null>(null);
  const [docs, setDocs] = useState<AttachedDocument[]>([]);
  const [copiedDoc, setCopiedDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [emailOnSend, setEmailOnSend] = useState(true);
  /** What signing or declining just did (the countersign panel). */
  const [done, setDone] = useState<string | null>(null);
  /** The send went through but the client's email didn't (backend email_sent). */
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/contracts/view?id=${id}`)}&role=vendor`);
  }, [authLoading, user, router, id]);

  const load = useCallback(() => getContract(id), [id]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    Promise.all([load(), listDocuments(id).catch(() => ({ items: [] as AttachedDocument[] }))])
      .then(([res, attached]) => {
        if (cancelled) return;
        setC(res);
        setDocs(attached.items);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load this contract."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, id, load]);

  /** Do something, then re-read the contract so the timeline catches up. */
  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      const [fresh, attached] = await Promise.all([load(), listDocuments(id).catch(() => null)]);
      setC(fresh);
      if (attached) setDocs(attached.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copyDocLink(d: AttachedDocument) {
    if (!d.token) return;
    try {
      await navigator.clipboard.writeText(guestDocumentLink(d.token));
      setCopiedDoc(d.document_id);
      setTimeout(() => setCopiedDoc((x) => (x === d.document_id ? null : x)), 2000);
    } catch {
      /* clipboard can be denied — "View as client" still opens it */
    }
  }

  async function copyLink() {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(guestBookingLink(c.contract_token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard can be denied — "View as client" still opens the link */
    }
  }

  if (authLoading || !user || (loading && id)) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }
  if (!c) {
    return (
      <div className="py-20 text-center">
        <p role="alert" className="text-ink-soft">{error ?? "No contract picked."}</p>
        <LinkButton href="/contracts" variant="ghost" className="mt-4">
          All contracts
        </LinkButton>
      </div>
    );
  }

  const status = c.contract_status ?? (c.signed_at ? "signed" : "sent");
  const closed = status === "declined" || status === "voided";
  // The client signed and it waits on the vendor (backend DECISIONS #34):
  // nothing can change now, only sign or decline.
  const awaitingVendor = status === "awaiting_vendor";
  const unsigned = !c.signed_at && !closed && !awaitingVendor;
  const client = c.guest_name || c.signer_name || "Your client";
  const canSend = unsigned && (status === "draft" || status === "expired" || status === "sent" || status === "viewed");
  const lines = c.line_items ?? [];
  // The client's changes waiting on the vendor: the status says so and the
  // negotiation is the main action, not a link under "awaiting signature" (#151).
  const waiting = unsigned ? changesWaiting(c) : 0;
  const statusText = waiting
    ? `${c.guest_name || "Your client"} asked for ${waiting === 1 ? "a change" : `${waiting} changes`} — your turn`
    : (STATUS_LABEL[status] ?? status);

  return (
    <div className="mx-auto w-[min(760px,100%-2rem)]">
      <Link href="/contracts" className="eyebrow hover:text-gold">
        ← All contracts
      </Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          {c.document_title ? <p className="eyebrow">{c.document_title}</p> : null}
          <h1 className="serif text-3xl text-maroon dark:text-gold">
            {c.guest_name || "Client hasn't filled in details"}
          </h1>
          <p className="mt-1 text-ink-soft">
            {describeWhen(c.date_iso, c.date_end, c.time_start, c.time_end)} · {c.location}
          </p>
        </div>
        <div className="text-right">
          <p className="serif text-2xl text-ink">{money(c.amount_cents)}</p>
          <p className={`text-sm ${waiting ? "font-semibold text-maroon dark:text-gold" : "text-ink-soft"}`}>{statusText}</p>
        </div>
      </header>

      {status === "sent" || status === "viewed" ? (
        c.hold_expires_at ? (
          <p className="mt-3 text-sm text-ink-faint">Your date is held for them until {prettyDate(c.hold_expires_at)}.</p>
        ) : null
      ) : null}

      {notice || done ? (
        <p role="status" className="mt-4 rounded-lg bg-ground-2 px-3 py-2 text-sm text-ink-soft">
          ✓ {done ?? notice}
        </p>
      ) : null}

      {awaitingVendor ? (
        <div className="mt-4">
          <CountersignPanel
            clientName={client}
            clientSignedAt={c.client_signed_at}
            what="the contract"
            freesDate={prettyDate(c.date_iso)}
            consent={c.vendor_esign_consent}
            onSign={(input) => countersignContract(c.booking_id, input)}
            onDecline={(reason) => declineContractSignature(c.booking_id, reason)}
            onDone={(message) => {
              setDone(message);
              act("reload", async () => {});
            }}
          />
        </div>
      ) : null}

      {c.signed_at && c.vendor_signer_name ? (
        <p className="mt-3 text-sm text-ink-soft">
          Signed by {c.signer_name}
          {c.client_signed_at ? ` on ${prettyDate(c.client_signed_at)}` : ""} and by you ({c.vendor_signer_name}) on{" "}
          {prettyDate(c.vendor_signed_at ?? c.signed_at)}.
        </p>
      ) : null}

      {waiting && c.negotiation ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <p className="text-sm text-ink">
            <strong>
              {c.guest_name || "Your client"} asked for {waiting === 1 ? "a change" : `${waiting} changes`}.
            </strong>{" "}
            <span className="text-ink-soft">Accept, counter or keep each one.</span>
          </p>
          <LinkButton href={`/contracts/changes?id=${c.booking_id}`} size="md">
            Answer them
          </LinkButton>
        </div>
      ) : unsigned && c.proposal_status === "open" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <p className="text-sm text-ink">
            <strong>{c.guest_name || "Your client"} proposed changes.</strong>{" "}
            <span className="text-ink-soft">Accept them, keep your version, or send a new one.</span>
          </p>
          <LinkButton href={`/contracts/changes?id=${c.booking_id}`} size="md">
            Review changes
          </LinkButton>
        </div>
      ) : unsigned && c.contract_status !== "draft" ? (
        <p className="mt-4 text-sm text-ink-soft">
          Want to change something before they sign?{" "}
          <Link href={`/contracts/changes?id=${c.booking_id}`} className="font-semibold text-gold hover:underline">
            Open the negotiation
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
      {emailWarning ? (
        <p role="status" className="mt-4 rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink">
          {emailWarning}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {canSend ? (
          <>
            <Button
              disabled={busy !== null}
              onClick={() =>
                act("send", async () => {
                  const sent = await sendContract(c.booking_id, { emailClient: emailOnSend && Boolean(c.guest_email) });
                  if (sent.email_sent === false) setEmailWarning(emailNotice(false, c.guest_email));
                })
              }
            >
              {busy === "send"
                ? "Sending…"
                : status === "draft"
                  ? "Send & hold date"
                  : status === "expired"
                    ? "Resend & hold date"
                    : "Resend & extend hold"}
            </Button>
            {c.guest_email ? (
              <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                <input type="checkbox" checked={emailOnSend} onChange={(e) => setEmailOnSend(e.target.checked)} />
                Email it to {c.guest_email}
              </label>
            ) : null}
          </>
        ) : null}
        {status !== "draft" && !closed ? (
          <>
            <Button variant="ghost" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <a
              href={guestBookingPreviewLink(c.contract_token)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full px-3 py-2.5 text-[0.95rem] font-semibold text-ink-soft transition hover:text-ink"
            >
              View as client
            </a>
          </>
        ) : null}
        <Button
          variant="ghost"
          disabled={busy !== null}
          onClick={() => act("pdf", () => downloadContractPdf(c.booking_id))}
        >
          {busy === "pdf" ? "Preparing…" : c.signed_at ? "Download signed PDF" : "Download PDF"}
        </Button>
        {unsigned ? (
          <>
            <LinkButton href={`/contracts/new?edit=${c.booking_id}`} variant="ghost">
              Edit
            </LinkButton>
            <Button variant="quiet" onClick={() => setConfirmVoid(true)}>
              Void
            </Button>
          </>
        ) : null}
      </div>

      {confirmVoid ? (
        <div className="mt-3 rounded-lg bg-panel p-3">
          <p className="text-sm text-ink-soft">
            Void this contract? The link stops working and {prettyDate(c.date_iso)} opens up for other bookings.
            {c.guest_email ? " Your client will get an email saying it was withdrawn." : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="md" disabled={busy !== null} onClick={() => act("void", () => voidContract(c.booking_id)).then(() => setConfirmVoid(false))}>
              {busy === "void" ? "Voiding…" : "Void contract"}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setConfirmVoid(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5">
        <Card className="p-5">
          <h2 className="serif text-lg text-ink">What&apos;s included</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-line-soft">
                  <td className="py-2 text-ink">
                    {l.name}
                    {l.quantity !== 1 ? (
                      <span className="text-ink-faint">
                        {" "}
                        × {l.quantity} at {money(l.unit_price_cents)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right text-ink">{money(l.total_cents)}</td>
                </tr>
              ))}
              {c.discount_cents ? (
                <tr className="border-t border-line-soft">
                  <td className="py-2 text-ink-soft">Discount</td>
                  <td className="py-2 text-right text-ink-soft">−{money(c.discount_cents)}</td>
                </tr>
              ) : null}
              <tr className="border-t border-line-soft font-semibold">
                <td className="py-2 text-ink">Total</td>
                <td className="py-2 text-right text-ink">{money(c.amount_cents)}</td>
              </tr>
            </tbody>
          </table>
          {c.guest_email || c.guest_phone ? (
            <p className="mt-3 text-sm text-ink-soft">{[c.guest_email, c.guest_phone].filter(Boolean).join(" · ")}</p>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="serif text-lg text-ink">Payments</h2>
          {c.payment_schedule?.length ? (
            <ul className="mt-3 grid gap-2">
              {c.payment_schedule.map((i) => {
                const state = installmentState(i);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2">
                    <div>
                      <p className="text-ink">
                        {i.label} · {money(i.amount_cents)}
                      </p>
                      <p className={`text-sm ${state.tone}`}>{state.text}</p>
                    </div>
                    {c.signed_at && !i.confirmed_at ? (
                      <Button
                        size="md"
                        variant={i.marked_paid_at ? "primary" : "ghost"}
                        disabled={busy !== null}
                        onClick={() => act(`pay-${i.id}`, () => confirmInstallment(c.booking_id, i.id))}
                      >
                        {busy === `pay-${i.id}` ? "Confirming…" : "Confirm received"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            // A contract from before schedules: one deposit and a balance,
            // confirmed from the Bookings page as they always were.
            <div className="mt-3 text-sm text-ink-soft">
              {c.deposit_amount_cents != null ? (
                <p>
                  Deposit {money(c.deposit_amount_cents)} ({c.deposit_percent}%)
                </p>
              ) : null}
              <p>Balance: {c.payment_status === "confirmed_paid" ? "received" : "confirm on your Bookings page when it arrives"}.</p>
              {c.signed_at ? (
                <LinkButton href="/my-bookings" variant="ghost" className="mt-2">
                  Go to Bookings
                </LinkButton>
              ) : null}
            </div>
          )}
          {!c.signed_at && c.payment_schedule?.length ? (
            <p className="mt-3 text-xs text-ink-faint">Payments can be confirmed once it&apos;s signed.</p>
          ) : null}
        </Card>

        {c.terms_clauses?.length || c.cancellation_window_hours != null || c.overtime_rate_cents != null ? (
          <Card className="p-5">
            <h2 className="serif text-lg text-ink">Terms</h2>
            <div className="mt-3 grid gap-2 text-sm text-ink-soft">
              {c.cancellation_window_hours != null ? (
                <p>Cancellation window: {Math.round(c.cancellation_window_hours / 24)} days</p>
              ) : null}
              {c.overtime_rate_cents != null ? <p>Overtime: {money(c.overtime_rate_cents)}/hr</p> : null}
              {(c.terms_clauses ?? []).map((t) => (
                <p key={t.key}>
                  <strong className="text-ink">{t.title}.</strong> {t.body}
                </p>
              ))}
            </div>
          </Card>
        ) : null}

        {c.signed_at || docs.length ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="serif text-lg text-ink">Attached documents</h2>
              {c.signed_at && !closed ? (
                <span className="flex flex-wrap gap-2">
                  <LinkButton href={`/contracts/document?kind=addendum&booking=${c.booking_id}`} variant="ghost" size="md">
                    Add an addendum
                  </LinkButton>
                  <LinkButton href={`/contracts/document?kind=cancellation&booking=${c.booking_id}`} variant="ghost" size="md">
                    Cancellation agreement
                  </LinkButton>
                </span>
              ) : null}
            </div>
            {docs.length === 0 ? (
              <p className="mt-2 text-sm text-ink-faint">
                Need to change or end what was signed? An addendum or cancellation agreement goes to your client to
                sign on its own link. It doesn&apos;t change the price, date or payments here.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {docs.map((d) => {
                  const st = documentStatus(d);
                  const open = d.status === "draft" || d.status === "sent" || d.status === "viewed";
                  return (
                    <li key={d.document_id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2">
                      <div className="min-w-0">
                        <p className="truncate text-ink">{d.title}</p>
                        <p className="text-xs text-ink-faint">
                          {KIND_LABEL[d.kind]}
                          {d.signed_at
                            ? ` · signed by ${d.signer_name}${d.vendor_signer_name ? ` and ${d.vendor_signer_name}` : ""} ${prettyDate(d.signed_at)}`
                            : d.status === "awaiting_vendor"
                              ? ` · signed by ${d.signer_name} — your signature next`
                              : ""}
                          {d.decline_reason ? ` · “${d.decline_reason}”` : ""}
                        </p>
                      </div>
                      <span className="flex flex-wrap items-center gap-1">
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                        {d.status === "draft" ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => act(`doc-send-${d.document_id}`, () => sendDocument(d.document_id, Boolean(c.guest_email)))}
                            className="px-2 py-1 text-xs font-semibold text-gold disabled:opacity-50"
                          >
                            Send
                          </button>
                        ) : null}
                        {d.token && d.status !== "draft" && d.status !== "voided" ? (
                          <>
                            <button type="button" onClick={() => copyDocLink(d)} className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink">
                              {copiedDoc === d.document_id ? "Copied!" : "Copy link"}
                            </button>
                            <a
                              href={guestDocumentPreviewLink(d.token)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                            >
                              View as client
                            </a>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => act(`doc-pdf-${d.document_id}`, () => downloadDocumentPdf(d.document_id))}
                          className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-50"
                        >
                          PDF
                        </button>
                        {open ? (
                          <>
                            <Link
                              href={`/contracts/document?booking=${c.booking_id}&id=${d.document_id}`}
                              className="px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => act(`doc-void-${d.document_id}`, () => voidDocument(d.document_id))}
                              className="px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
                            >
                              Void
                            </button>
                          </>
                        ) : null}
                      </span>
                      {d.status === "awaiting_vendor" ? (
                        <div className="basis-full">
                          <CountersignPanel
                            clientName={d.signer_name || client}
                            clientSignedAt={d.client_signed_at}
                            what={`“${d.title}”`}
                            freesDate={null}
                            consent={d.vendor_esign_consent}
                            onSign={(input) => countersignDocument(d.document_id, input)}
                            onDecline={(reason) => declineDocumentSignature(d.document_id, reason)}
                            onDone={(message) => {
                              setDone(message);
                              act("reload", async () => {});
                            }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : null}

        <Card className="p-5">
          <h2 className="serif text-lg text-ink">Timeline</h2>
          <ol className="mt-3 grid gap-2">
            {visibleEvents(c.timeline ?? []).map((e, idx) => (
              <li key={`${e.at}-${idx}`} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 text-ink-faint">{when(e.at)}</span>
                <span className="text-ink">{describeEvent(e, c)}</span>
              </li>
            ))}
          </ol>
          {c.signed_snapshot_sha256 ? (
            <p className="mt-4 break-all text-xs text-ink-faint">
              Signed copy fingerprint (SHA-256): {c.signed_snapshot_sha256}
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

export default function ContractViewPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ContractViewInner />
    </Suspense>
  );
}
