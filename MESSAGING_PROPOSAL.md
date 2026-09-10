# Messaging — build spec

**Shipped** (2026-08-28 note): despite the "decisions made; not yet built"
line below, this shipped within a day of being written — see
`docs/BOOKING_FLOW.md`'s "A note on the proposal docs" and `docs/API.md`.
Enquiry threads (`askVendor()` → `POST /conversations/enquiry`), per-booking threads
(`openBookingThread()`), and the unified conversation model (`subject_type`,
`unread_count` on `ConversationSummary`) are all live in
`web/src/lib/jorna.ts`/`types.ts`. Treat what follows as design rationale,
not a to-do list. One gap remains: `NegotiationPanel`'s own offer-history
rendering (`NegotiationPanel.tsx:123-138`) was never retired as planned, so
negotiation history currently renders in two places — the panel inline, and
the conversation thread.

Item 8 in `CLIENT_FLOW_PLAN.md`, plus the two halves it didn't cover.
**Decisions made and built** — see the shipped note above. Written after a
full read of both sides: the web app here and `Desiconnect/server`.

Three things are being answered at once, because they are one system:

1. A client asking a vendor a question **before** anything is booked.
2. A client and a vendor talking **about a booking inside a plan**.
3. **Price negotiation**, which is already a conversation and is currently
   held somewhere else.

---

## The hole

There is no way for a client to ask a vendor a question. Not from a listing, not
from a vendor profile, not before booking and not after. The only chat in the
product is the group chat opened for a plan when it's sent.

That much was known. What the backend read turned up is worse, and better.

**There are two complete messaging systems, and the web uses one.**

| | `/conversations` (group) | `/messages` (1:1) |
| --- | --- | --- |
| Scope | one bundle | one booking |
| Tables | `conversations`, `conversation_members`, `group_messages`, `group_message_reads` | `messages` |
| Live socket | yes — `/conversations/ws/{id}` | no |
| Read state | per-member rows | one `is_read` bool |
| Push | yes | yes |
| Unread count | `/conversations/unread-count` | `/messages/unread-count` |
| **Web callers** | `/messages`, `/conversation` | **none** |

`message_service.py` is a working, booking-scoped DM system with unread counts,
read receipts and push notifications, and nothing has ever called it. `lib/jorna.ts`
has no function for it. iOS may; the web does not.

So the pre-booking question is a genuine gap, and the private
client↔vendor-about-a-booking conversation is a **wiring** job that was mistaken
for a building job.

### Three blockers, verified

1. **`Conversation.bundle_id` is `nullable=False`**, FK to bundles
   (`db/models.py:363`). No conversation can exist without a plan.
2. **`list_conversations` deletes non-bundle chats from the inbox.** One line —
   `conversations = [c for c in conversations if c.bundle_id in live_bundle_ids]`
   (`conversation_service.py:229`). Written to hide orphans from historical
   bundle deletions; it now also means any enquiry thread would be created
   successfully, be sent successfully, and never appear. Highest-value line in
   this document.
3. **`ConversationSummary` has no unread count.** The tab can show one number
   for everything and nothing per row.

---

## Shape

**One model: a conversation with a subject.**

```
conversation
  ├─ subject_type: bundle | booking | enquiry
  ├─ bundle_id   (nullable)
  ├─ booking_id  (nullable)
  └─ vendor_id   (nullable)
```

Chosen over keeping both systems because the difference is not in the plumbing
but in what a person sees: two systems means two inboxes and two unread counts,
and the Messages tab can only list one of them. `conversations` already has the
socket, the membership table and per-user read state; `messages` has a boolean.
Unifying moves one table into another's shape. Not unifying means building the
socket, membership and read receipts a second time, or shipping DMs that don't
go live.

`messages` rows migrate into two-member conversations with `subject_type =
"booking"`, and `message_service.py` and its router are deleted rather than left
as a second way to do the same thing.

---

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Two systems, or one | **One.** Unify on `conversations`; migrate and delete `messages`. |
| 2 | Enquiry scope | **One thread per client↔vendor pair**, not per service. |
| 3 | Negotiation | **Typed messages in the thread.** Offers are written as real messages. |
| 4 | Group chat | **Stays.** A per-vendor thread is added beside it, not instead. |
| 5 | Who may open an enquiry | Any signed-in client, to any vendor, subject to §Limits. |
| 6 | Vendor opening one | **No.** A vendor cannot cold-open a thread with a client. |

### Why one thread per client↔vendor

A client comparing a vendor's three packages is one customer with one question,
not three. Per-service threads would have the vendor answering the same person
three times in three places, and the second thread's context is almost always
"the same as the first". The service that prompted it is carried as a reference
card on the opening message, so the subject is never lost — it just isn't the
thread's identity.

### Why a vendor can't cold-open

The client picks who they talk to. A vendor able to start threads turns the
inbox into an advertising channel, and every limit in §Limits would have to be
rebuilt pointing the other way.

---

## Flow

```
BEFORE BOOKING
  client opens /service or /vendor → "Ask a question"
    │
    ├─ existing enquiry thread with this vendor?  → open it
    └─ none → create one; first message carries a reference card
                (service name, price line, link)
       │
       └─ limits checked here, not on every message (§Limits)

INSIDE A PLAN
  plan sent → all_parties + vendors_only group chats  (unchanged, exists today)
    │
    └─ each booking row → "Message {vendor}"
         → per-booking thread, 2 members, private
         → an enquiry thread that preceded it is linked, not merged

NEGOTIATION
  offer / counter / accept / decline
    → written into the booking's thread as a typed message
    → rendered as a card with the live actions on it
    → pushes like any message; appears in the thread's ordering
```

---

## Schema

One migration.

```
conversations
  + subject_type   varchar(16)  not null  default 'bundle'
  + booking_id     varchar(36)  null  fk bookings
  + vendor_id      varchar(36)  null  fk vendors
  ~ bundle_id      now nullable
  + unique (vendor_id, client_user_id) where subject_type = 'enquiry'

group_messages
  + kind           varchar(16)  not null  default 'text'   -- text | offer | system
  + meta           json         null                        -- offer_id, amount_cents, action, service_id
```

`meta` is JSON rather than columns because an offer, a system notice ("Priya
accepted your date change") and a reference card carry different fields, and
three sets of nullable columns to hold them is how a message table becomes a
booking table. Nothing queries inside `meta`; it is read only when the message
that owns it is rendered.

**Backfill:** each distinct `messages.booking_id` becomes one conversation with
`subject_type = 'booking'`, two `conversation_members`, and its messages copied
into `group_messages` preserving `created_at` and `sender_id`. `is_read = true`
becomes a `group_message_reads` row for the receiver. Verified up *and* down,
like migration 0041.

---

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/conversations/enquiry` | `{vendor_id, service_id?, content}` → creates or reuses. Rate limited. |
| `POST` | `/conversations/booking/{booking_id}` | Open or fetch the private thread for a booking. |
| `GET` | `/conversations` | Gains `subject_type`, `unread_count`, `subject_name` per row. **And loses the bundle filter.** |
| `GET` | `/conversations/{id}` | Gains members with roles, so the header can name the other party. |

`negotiation_service` gains one call — `_post_offer_message(...)` — at each of
its four mutation points. It does not learn about conversations beyond that: the
message write lives in `conversation_service`, and negotiation calls it the same
way it already calls `_notify`.

---

## Limits

Item 8 was deferred with a condition: *"to be built with rate limits, not
before them — it's the one surface a spammer can reach every vendor through."*
This is that.

`slowapi` is wired (`app/limiter.py`) but keyed on IP at 60/minute, which is a
flood control, not a spam control. Enquiries need per-user limits:

| Rule | Value | Why |
| --- | --- | --- |
| New enquiry threads per client per day | 10 | A real client contacts a handful of vendors. |
| **No new thread to a vendor who hasn't replied to your last** | — | The one that matters. Kills spraying without touching legitimate use. |
| Messages per minute, any thread | 20 | Flood control, per user rather than per IP. |
| Blocked either way | refused | `blocks` already exists; `ModerationMenu` already ships. |

The second rule is deliberately *not* "one open thread per vendor" — a client
whose question was answered may ask another. It only stops a client
accumulating unanswered threads, which is the only shape bulk contact can take.

---

## UI

**Messages tab** (`/messages`)

- Rows say what the chat is *about*: the celebration's name, or
  `Enquiry · Photography`, or the vendor's name for a booking thread.
- Per-row unread count, from the new field.
- Filter: All / Plans / Vendors. Not tabs — a filter row, like `/marketplace`.
- The empty state stops saying chats only exist for sent plans, which is the
  thing this change makes untrue.
- Vendor side: same page, sorted so unanswered enquiries come first. For a
  vendor, response time is the product.

**Thread** (`/conversation`)

- A header. It currently has a back link and a Live dot, and does not name the
  chat, the other party, or what it's about — survivable with one chat per plan,
  not with five.
- Offer cards inline, with Accept / Counter / Decline on them.
- The reference card on an enquiry's first message, linking the service.
- `ModerationMenu`, which exists and is not used here.

**Entry points**

- `/service` and `/vendor`: "Ask a question".
- `/bundle` booking rows: "Message {vendor}" beside the existing controls.
- `/my-bookings` and the vendor dashboard's event cards: the same, from the
  vendor's side.

**Retired:** `NegotiationPanel`'s own offer history
(`NegotiationPanel.tsx:123-138`). The panel keeps the offer *form*; the history
it renders becomes the thread, which is where the rest of the conversation
already is.

---

## Tests

Backend, in the house style — one class per behaviour, and the guard's own test
should fail with the guard removed:

- `TestEnquiryThreads` — create, reuse on a second question, the unanswered-thread
  refusal, the daily cap, blocked in both directions, vendor cannot open one.
- `TestConversationSubjects` — a bundle chat, a booking thread and an enquiry all
  appear in one inbox; the bundle filter no longer eats the last two; a deleted
  bundle still hides its own chat and nothing else.
- `TestOfferMessages` — each of the four negotiation actions writes exactly one
  message; ordering by `created_at` interleaves correctly with text; accepting
  twice does not write twice.
- `TestMessagesBackfill` — migration up preserves every row, sender and
  timestamp; down restores; read state survives both ways.

Frontend: `tsc`, `lint`, `build`, then the three screens against a real account.

---

## Open, deliberately

- **iOS.** `message_service` may have a live iOS caller. Deleting the router is
  the last step, not the first, and needs checking against the app before it
  happens. The migration is additive and safe to ship ahead of it.
- **Attachments.** Vendors will want to send a quote as a PDF and clients will
  want to send a venue photo. `storage_service` exists. Not in this pass —
  `meta` leaves room for it without another migration.
- **Typing indicators / delivery receipts.** The socket could carry them. Nothing
  in the product needs them yet.
