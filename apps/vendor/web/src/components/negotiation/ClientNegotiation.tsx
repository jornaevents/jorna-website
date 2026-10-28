"use client";

// The couple's side of the negotiation workspace, on their signing link
// (backend DECISIONS #23, #24). The same screen the vendor answers in:
//
// - after the vendor sent a new version (Accept or Revise), what they changed
//   is in rose, against the version the couple had been reading;
// - with a proposal of theirs open, it's shown read-only — waiting on the
//   vendor — with Change it and Withdraw;
// - otherwise they change any value, toggle items and clauses, and send it
//   as a proposal. Save draft keeps their work on the server.

import { useMemo, useState } from "react";
import { Field } from "@jorna/shared/components/ui";
import { fillGuestBookingDetails, proposeGuestChanges, saveGuestDraft, withdrawGuestProposal } from "@/lib/jorna";
import { fromContract, proposalChanges } from "@jorna/shared/lib/contractDraft";
import { termsOf } from "@jorna/shared/lib/contractDiff";
import { draftToSave, proposalProblems, roundOf } from "@jorna/shared/lib/negotiation";
import type { GuestBooking, ProposalHistory } from "@/lib/types";
import { NegotiationWorkspace } from "@jorna/shared/components/negotiation/NegotiationWorkspace";

export function ClientNegotiation({
  token,
  booking,
  history,
  onHistory,
  onClose,
}: {
  token: string;
  booking: GuestBooking;
  history: ProposalHistory;
  /** After Send or Withdraw: the new history, and what to tell them. */
  onHistory: (history: ProposalHistory, message: string) => void;
  onClose: () => void;
}) {
  const vendorName = booking.vendor_display_name ?? "Your vendor";
  const you = booking.guest_name || "You";
  const open = history.open_proposal;
  const latest = history.proposals[0];
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState(booking.guest_email ?? "");

  const drafts = useMemo(() => {
    const current = fromContract(booking);
    const saved = history.draft;
    const fromSaved = saved ? fromContract({ ...booking, ...saved.changes }) : null;
    if (open) {
      // Their own proposal: shown as their changes (gold) against the
      // current version, nothing in rose — the vendor hasn't moved.
      const mine = fromContract({ ...booking, ...open.proposed });
      return {
        original: current,
        proposed: current,
        initial: changing ? (fromSaved ?? mine) : mine,
        ask: null,
        stale: changing && Boolean(saved?.stale),
      };
    }
    // The vendor's answer is still the version on the table: show what it
    // changed against what the couple had asked for, so their own asks the
    // vendor took read as theirs, not the vendor's.
    const answered =
      latest && (latest.status === "accepted" || latest.status === "revised") && latest.result_revision === booking.revision;
    const declined = latest && latest.status === "declined" && latest.base_revision === booking.revision;
    const before = answered ? history.revisions.find((r) => r.revision === latest.base_revision)?.terms : null;
    return {
      original: before ? fromContract({ ...booking, ...before }) : current,
      proposed: current,
      initial: fromSaved ?? current,
      ask: (answered && before) || declined ? fromContract({ ...booking, ...latest.proposed }) : null,
      stale: Boolean(saved?.stale),
    };
  }, [booking, history, open, latest, changing]);

  const readOnly = Boolean(open) && !changing;
  const base = termsOf(booking);
  const theirNote =
    !open && latest && latest.status !== "withdrawn" && latest.status !== "superseded" ? latest.response_note : null;

  return (
    <NegotiationWorkspace
      key={`${booking.revision}-${open?.proposal_id ?? "none"}-${changing}`}
      perspective="client"
      header={{
        counterpart: vendorName,
        contractTitle: booking.document_title || `${booking.service_name ?? "Services"} agreement`,
        round: roundOf(history),
        lastEditedBy: open ? you : vendorName,
        updatedAt: open ? open.created_at : (latest?.responded_at ?? null),
      }}
      original={drafts.original}
      proposed={drafts.proposed}
      initial={drafts.initial}
      ask={drafts.ask}
      stale={drafts.stale}
      vendorName={vendorName}
      clientName={you}
      otherMessage={theirNote}
      readOnly={readOnly}
      readOnlyNotice={
        open ? (
          <>
            <strong className="text-ink">Waiting for {vendorName}.</strong> You can still sign the contract as it is —
            that withdraws your proposal.
          </>
        ) : null
      }
      extraActions={
        open && readOnly ? (
          <>
            <button
              type="button"
              onClick={async () => {
                const h = await withdrawGuestProposal(token, open.proposal_id);
                onHistory(h, "You withdrew your proposal. The contract stands as it is.");
              }}
              className="rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink"
            >
              Withdraw it
            </button>
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold"
            >
              Change your proposal
            </button>
          </>
        ) : null
      }
      canSendUnchanged={false}
      sendLabel={() => `Send to ${vendorName}`}
      noteLabel={`A note for ${vendorName} (optional)`}
      beforeSend={
        booking.guest_email ? null : (
          <Field
            label="Your email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="We'll email you when they reply."
            required
          />
        )
      }
      onClose={onClose}
      onSaveDraft={async (yours, note) => {
        await saveGuestDraft(token, {
          base_revision: booking.revision ?? 1,
          changes: draftToSave(yours),
          message: note || null,
        });
      }}
      onSend={async ({ yours, note }) => {
        const issues = proposalProblems(yours, base);
        if (issues.length) throw new Error(issues[0]);
        if (!booking.guest_email) {
          if (!email.trim()) throw new Error("Add your email so we can tell you when they reply.");
          await fillGuestBookingDetails(token, { guest_email: email.trim() });
        }
        const h = await proposeGuestChanges(token, booking.revision ?? 1, proposalChanges(yours, base), note || null);
        onHistory(h, `Sent. We'll email you when ${vendorName} replies.`);
      }}
    />
  );
}
