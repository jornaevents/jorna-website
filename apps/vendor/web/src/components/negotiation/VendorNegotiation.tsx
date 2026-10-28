"use client";

// The vendor's side of the negotiation workspace: loads the contract, its
// proposals and the vendor's saved draft, and decides what Send means
// (backend DECISIONS #23):
//
// - with the couple's proposal open and nothing changed: Accept;
// - with anything changed: Revise (PATCH with proposal_id) — the new
//   version goes back to them;
// - Decline keeps the current version, with the note;
// - with no proposal open: Send updated contract (a plain edit).
//
// Used by the Leads page's negotiation panel and /contracts/changes.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import {
  acceptProposal,
  declineProposal,
  getContract,
  getContractNegotiation,
  getContractProposals,
  getMyVendor,
  saveContractDraft,
  updateContract,
} from "@/lib/jorna";
import { defaultClauses, fromContract, problems, toDocument, type Draft } from "@jorna/shared/lib/contractDraft";
import { draftToSave, roundOf } from "@jorna/shared/lib/negotiation";
import type { Contract, ProposalHistory, VendorDetail } from "@/lib/types";
import { NegotiationWorkspace } from "@jorna/shared/components/negotiation/NegotiationWorkspace";
import type { FieldNegotiationState } from "@jorna/shared/lib/contractTypes";
import { VendorFieldNegotiation } from "./VendorFieldNegotiation";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Same checks the editor makes before it sends, in the vendor's words. */
function check(d: Draft, venueBefore?: string | null) {
  const issues = problems(d, todayIso(), venueBefore);
  if (issues.length) throw new Error(issues[0]);
}

export function VendorNegotiation({
  bookingId,
  onClose,
  onDone,
  headerActions,
}: {
  bookingId: string;
  onClose?: () => void;
  headerActions?: ReactNode;
  /** After Send or Decline went through: what happened, for the host to show. */
  onDone: (message: string) => void;
}) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [history, setHistory] = useState<ProposalHistory | null>(null);
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  // Field-by-field contracts (backend DECISIONS #26). A 409 from the
  // negotiation route means this one uses proposals, so it stays null.
  const [fields, setFields] = useState<FieldNegotiationState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getContract(bookingId),
      getContractProposals(bookingId),
      getMyVendor().catch(() => null),
      getContractNegotiation(bookingId).catch(() => null),
    ])
      .then(([c, h, v, f]) => {
        if (cancelled) return;
        setContract(c);
        setHistory(h);
        setVendor(v);
        setFields(f);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load this negotiation."));
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const drafts = useMemo(() => {
    if (!contract || !history) return null;
    const current = fromContract(contract);
    const open = history.open_proposal;
    const proposed = open ? fromContract({ ...contract, ...open.proposed }) : current;
    const saved = history.draft;
    const usable = saved && (open ? saved.proposal_id === open.proposal_id : !saved.proposal_id);
    const initial = usable ? fromContract({ ...contract, ...saved.changes }) : proposed;
    return { original: current, proposed, initial, stale: Boolean(usable && saved.stale) };
  }, [contract, history]);

  if (error) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p role="alert" className="text-ink-soft">{error}</p>
          <div className="mt-4 flex justify-center gap-3">
            {headerActions}
            {onClose ? (
              <button type="button" onClick={onClose} className="text-sm font-semibold text-gold hover:underline">
                Close
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  if (!contract || !history || !drafts) {
    return <p className="py-20 text-center text-ink-soft">Loading the negotiation…</p>;
  }
  if (contract.signed_at) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <p className="text-ink-soft">This contract is signed, so there&apos;s nothing left to negotiate.</p>
      </div>
    );
  }

  const client = contract.guest_name || "Your client";
  const vendorName = contract.vendor_display_name || "You";

  if (fields) {
    return (
      <VendorFieldNegotiation
        bookingId={bookingId}
        initial={fields}
        title={contract.document_title || `${contract.service_name ?? "Services"} agreement`}
        clientName={client}
        vendorName={vendorName}
        onClose={onClose}
        onDone={onDone}
        headerActions={headerActions}
      />
    );
  }
  const open = history.open_proposal;
  const latest = history.proposals[0];
  const answeredLast = latest && latest.status !== "open" && latest.responded_at;

  return (
    <NegotiationWorkspace
      key={`${contract.revision}-${open?.proposal_id ?? "none"}`}
      perspective="vendor"
      header={{
        counterpart: client,
        contractTitle: contract.document_title || `${contract.service_name ?? "Services"} agreement`,
        round: roundOf(history),
        lastEditedBy: open ? client : answeredLast ? vendorName : vendorName,
        updatedAt: open ? open.created_at : (latest?.responded_at ?? contract.sent_at ?? null),
      }}
      original={drafts.original}
      proposed={drafts.proposed}
      initial={drafts.initial}
      stale={drafts.stale}
      vendorName={vendorName}
      clientName={client}
      otherMessage={open?.message}
      clauseLibrary={defaultClauses(vendor).map(({ title, body }) => ({ title, body }))}
      canSendUnchanged={Boolean(open)}
      sendLabel={(unchanged) => (open ? (unchanged ? "Accept changes" : `Send to ${client}`) : "Send updated contract")}
      noteLabel={`A note for ${client} (optional)`}
      readOnlyNotice={null}
      onClose={onClose}
      headerActions={headerActions}
      onSaveDraft={async (yours, note) => {
        await saveContractDraft(bookingId, {
          base_revision: contract.revision ?? 1,
          changes: draftToSave(yours),
          message: note || null,
          proposal_id: open?.proposal_id ?? null,
        });
      }}
      onSend={async ({ yours, note, unchanged }) => {
        if (open && unchanged) {
          await acceptProposal(bookingId, open.proposal_id, note || null);
          onDone(`You accepted ${client}'s changes and sent the contract back to sign.`);
          return;
        }
        check(yours, contract?.location);
        const doc = toDocument(yours);
        await updateContract(
          bookingId,
          open ? { ...doc, proposal_id: open.proposal_id, proposal_note: note || null } : doc,
        );
        onDone(open ? `Your revised version is on its way to ${client}.` : `${client} has the updated contract.`);
      }}
      onDecline={
        open
          ? async (note) => {
              await declineProposal(bookingId, open.proposal_id, note || null);
              onDone(`You kept your version. ${client} can still sign it.`);
            }
          : undefined
      }
      declineLabel="Decline their changes"
    />
  );
}
