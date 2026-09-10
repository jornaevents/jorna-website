# Rescheduling a paid booking — build spec

**Shipped** (2026-08-28 note): despite the "decisions made; not yet built"
line below, this was built and is live — see `CLIENT_FLOW_PLAN.md` item 16
("Built and live") and `docs/BOOKING_FLOW.md`'s client journey step 7.
`proposeChange()` / `respondToChange()` / `consentToChangePrice()` /
`refundAfterFailedReschedule()` (`web/src/lib/jorna.ts`) and
`DateChangePanel.tsx` / `DateChangeRequest.tsx` implement everything below,
including the flat 10% cancellation fee, the 7-day vendor deadline, and
re-pricing with client consent on a rise. Treat what follows as design
rationale for why it works this way, not as a statement it's unbuilt.

Item 16 in `CLIENT_FLOW_PLAN.md`. **Decisions made and built** — see the
shipped note above.

---

## The hole

Events move. Once a request reaches a vendor, `plan_readiness.COMMITTED_FIELDS`
freezes the date, times, location, headcount and end date — correctly, since
those are what the vendor agreed to. But for a **paid** booking there is no way
to change them: no cancel button (`isBeyondActionable`), and
`remove_booking_from_bundle` refuses once money has moved. Past the 24-hour
refund window the only exits are a dispute (adversarial, wrong for "the venue
flooded") or nothing (the vendor turns up on a dead date, and escrow
auto-releases seven days after a day that no longer means anything).

## Shape

A **change request**, mirroring `negotiation_service`: turn-based, server
enforces whose turn it is, resolution mutates the booking. One mental model for
"I want to change something we agreed", whether it's a price or a date.

**Escrow does not move on a proposal, only on a resolution.** A client cannot
free their money by proposing an impossible date; a vendor cannot strand it by
ignoring one.

---

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Scope | **Per plan, per-vendor answer.** One proposal, each vendor answers independently. |
| 2 | Vendor declines | **Refund less a cancellation fee**, at the client's option. |
| 3 | Fee | **Flat 10%**, published, from a single constant. |
| 4 | Conflict on accept | **Refuse**, naming the clash. Same guard approval uses. |
| 5 | Vendor deadline | **7 days**, reusing `AUTO_RELEASE_DAYS`. |
| 6 | Re-pricing | **Re-price both ways; a rise needs the client's second consent.** |
| 7 | Sequencing | Spec first, build on approval. |

### Why 10%

Roughly the platform fee already taken, so it reads as "you keep what was
already spent" rather than a penalty. That matters because of who triggers it:
the *vendor* declined. A fee that looked punitive would be hardest to defend in
exactly the case that produces it.

---

## Flow

```
client proposes new date/times, plan-wide
  │
  ├─ each live booking gets a pending change_request
  │  vendors are notified; escrow untouched
  │
  ├─ vendor ACCEPTS
  │    → re-run the double-booking check
  │        conflict → refuse, name the clash, vendor declines instead
  │    → re-price from the new dates
  │        lower  → apply, refund the difference
  │        higher → hold pending the client's consent
  │        same   → apply
  │    → booking's committed fields updated
  │
  ├─ vendor DECLINES
  │    → booking stays at its original date, still paid
  │    → client offered: keep it, or refund at 90%
  │
  └─ 7 days, no answer
       → client may withdraw for a refund at 90%
```

The plan shows a per-vendor board: accepted / declined / waiting.

---

## Schema

One table. Nullable throughout except the keys — a proposal may move only the
date, only the times, or both.

```python
class ChangeRequest(Base):
    change_request_id  # uuid pk
    booking_id         # fk, indexed
    proposed_by        # user_id — always the client in v1
    status             # pending | accepted | declined | withdrawn | expired
    # What is being asked for. Null means "unchanged".
    date_iso, date_end, time_start, time_end
    # Set when a re-price needs the client's second consent.
    repriced_amount_cents
    client_consented_at
    message            # optional, like a negotiation offer
    created_at, resolved_at
```

`plan_id` is deliberately absent: the group is the plan the bookings already
belong to, so a proposal is *n* rows created in one transaction and read back by
joining on `bundle_id`. Nothing new owns the grouping.

---

## Endpoints

```
POST   /bundles/{bundle_id}/change-request     client proposes, plan-wide
POST   /change-requests/{id}/respond           vendor: accept | decline
POST   /change-requests/{id}/consent           client: OK a price rise
DELETE /bundles/{bundle_id}/change-request     client withdraws the lot
```

Guards, each mirroring one that already exists:

- Propose: caller owns the bundle; at least one live booking; the plan is sent
  (a draft is still editable directly, so this would be the wrong tool).
- Respond: caller is the booking's vendor; request is `pending`.
- Accept: re-run `update_booking_status`'s overlap check. **Refuse on conflict**,
  returning the clashing booking's event name and date.
- Consent: caller owns the booking; there is a `repriced_amount_cents`.
- Expiry: a sweep like `auto_release_due`, marking `expired` after 7 days.

## Refunds

```python
RESCHEDULE_CANCELLATION_PCT = 10  # one constant; every string reads from it
```

Refund = `resolve_total_cents(booking) * (100 - PCT) / 100`, via the existing
Stripe refund path. Available to the client when a request is `declined` or
`expired`, and only then — it does not reopen the ordinary 24-hour window.

Disclosed at checkout and again on the propose screen, from the same constant,
so the copy and the arithmetic cannot drift.

---

## UI

**Client, on the plan** — "Propose a new date" beside the settled-details notice
that currently explains why nothing is editable. Then a per-vendor board, and a
consent prompt on any booking whose price rose: *"Moving this adds $500.
Confirm?"*

**Vendor, on the booking** — the request, what's changing, accept/decline with
an optional message. A refused acceptance says which booking clashed.

**Copy that changes** — the settled-details paragraph in `bundle/page.tsx`
currently says to message the vendor. It should point at the flow instead.

---

## Tests

- Propose creates one request per live booking; dead ones are skipped.
- Escrow does not move on propose.
- Accept updates the committed fields; decline leaves them alone.
- **Accept into a conflict is refused** and the booking is unchanged.
- Decline offers a 90% refund; accept offers none.
- A shorter booking refunds the difference; a longer one waits for consent and
  does **not** charge before it.
- Expiry at 7 days, not 6.
- A vendor cannot respond to another vendor's request; a client cannot accept
  their own.
- Withdraw cancels every outstanding request on the plan.

---

## Open, deliberately

- **Vendor-initiated proposals.** The schema allows it (`proposed_by`); v1 does
  not expose it. A vendor who needs to move asks in the chat.
- **Location changes.** `COMMITTED_FIELDS` freezes location too, and moving a
  venue is a different problem — it re-anchors check-in for every other vendor.
  Out of scope.
