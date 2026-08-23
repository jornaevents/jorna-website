# Vendor dashboard — design brief for Figma Make

**Shipped** (2026-08-22 note): this brief's design was ported and is live at
`/my-dashboard` (`web/src/app/my-dashboard/page.tsx`, whose own header
comment cites this brief and the 2026-07-27 Figma Make export by name). Same
staleness pattern as `MESSAGING_PROPOSAL.md`/`RESCHEDULE_PROPOSAL.md` (see
`docs/BOOKING_FLOW.md`): treat what follows as design rationale for the page
that exists, not as an open task — the "existing vendor pages" list near the
end of this doc predates the dashboard it's itself describing and should
read `/my-dashboard` alongside the rest.

Everything below is checked against the real API and the real tokens in
[`web/src/app/globals.css`](web/src/app/globals.css), as of 2026-07-27. Nothing
in the prompt asks for a number the backend can't supply — see
[What the API cannot give you](#what-the-api-cannot-give-you) before adding any.

---

## What belongs on it

Grouped by the question a vendor opens the tab to ask. Each line names the field
it comes from, so nothing here is aspirational.

### 1. What needs me right now

The vendor half of this already exists in
[`web/src/lib/attention.ts`](web/src/lib/attention.ts) and drives the "Needs you"
badge. The dashboard should show the same items, not a second set.

| Item | Source | Why it's urgent |
|---|---|---|
| Booking requests to answer | `status === "pending"` | A client is waiting on a yes or no |
| Confirm the event happened | `payment_status === "paid"` && `!vendor_confirmed_at` && date passed | **Their own payout is blocked on it** |
| Check in at the venue | same, plus `venue_latitude`/`venue_longitude` present | Same money, GPS route |
| Finish Stripe onboarding | `stripe_onboarding_complete === false` | Until done, clients **cannot pay them at all** |
| Open negotiations | `status === "negotiation_ongoing"` | A price offer is sitting unanswered |
| Unread messages | `getUnreadCount()` | — |

Stripe belongs at the very top when incomplete. It's the one state where the
vendor can accept bookings and still never be paid.

### 2. Money

`GET /payments/vendors/{id}/earnings` returns all of this already — the existing
`/my-earnings` page shows some of it, and the dashboard should lead with it.

- **Released** — `total_released_cents`, actually paid out
- **In escrow** — `in_escrow_cents`, held by Jorna, theirs once both sides confirm
- **Upcoming** — `upcoming_cents` across `upcoming_count` bookings, approved but unpaid
- **Disputed** / **Refunded** — `disputed_cents`, `refunded_cents`
- **Platform fees** — `platform_fees_cents`, what Jorna took
- Per booking, `history[]` carries `amount_cents`, `platform_fee_cents` and
  `net_cents` — gross vs net matters and most marketplaces hide it

The honest framing is a pipeline: *upcoming → in escrow → released*, with fees
shown against it. Not a single "balance".

### 3. The next jobs

Every booking carries a **required** `time_start` and `time_end`, its own
`location`, and an optional `date_end` for multi-day. The client side already
renders this as a run sheet; the vendor needs the same thing pointed the other
way.

- Today: each job with arrival time, address, client name, guest count
- This week, then further out
- `vendor_checked_in_at` / `client_checked_in_at` — has either party arrived
- `price_pending_quantity` — flags a job whose total isn't settled yet

### 4. Requests inbox

`status`: `pending` → `negotiation_ongoing` → `approved` / `rejected` →
`payment_confirmed`. Each request shows client, service, date, price, and
`negotiable`. Accept/decline live here.

### 5. Availability and calendar

`GET /vendors/{id}/availability` returns `baseline_hours_map`,
`internal_busy_times`, `google_busy_times`, and `google_calendar_connected`;
`/vendors/{id}/calendar-status` reports the connection.

- Weekly hours set, or a prompt to set them
- Google Calendar connected, or an invitation to connect
- Where bookings sit against those hours

**Note for the design: most vendors currently have no availability set at all.**
Design the empty state as the primary state, not an afterthought.

### 6. Listing health

Not a vanity score — each row is a concrete reason a vendor isn't getting booked,
and each is checkable:

- Stripe not connected → *nobody can pay you*
- No availability set → *the date filter can't match you*
- A service with `media` empty → *a listing with no photo*
- `bio` empty, no `tags`
- `travel_radius_miles` unset / `open_to_long_distance` false → *how far you'll go*
- `open_to_price_negotiation` — whether offers can reach them

### 7. Reputation

`rating`, `num_events`, and `GET /reviews/vendor/{id}` for recent reviews.

---

## What the API cannot give you

**Do not design charts for these.** There is no endpoint behind any of them, so
anything showing them would be a picture of numbers that don't exist:

- Profile / listing **views or impressions**
- **Search rank** or how often they appear in results
- **Conversion rate** (views → bookings), or any funnel
- **Response time** — no timestamp records when a request was answered
- Revenue **time series** — `history[]` has `paid_at` and `funds_released_at`,
  so a chart over time is possible, but there is no pre-aggregated series
- Competitor or category benchmarking

Acceptance rate and repeat-client counts *can* be derived by counting `status`
across bookings, if you want a "how you're doing" strip. Nothing finer.

---

## The prompt

Paste this into Figma Make.

> You are designing the **vendor dashboard** for **Jorna**, a marketplace for
> South Asian celebrations — weddings, sangeets, mehndis, poojas, large parties.
> Design **mobile first (390×844)**, then desktop (1440).
>
> **Who this is for.** Vendors are small businesses, often one person — a mehndi
> artist, a dhol player, a caterer, a banquet hall. They are not office workers
> with a second monitor. They check this on a phone between jobs. The dashboard
> has to answer three questions in the first screenful: *what needs me, when is
> my next job, and where is my money.*
>
> **The money model, because the whole design turns on it.** A client pays into
> **escrow** — Jorna holds the money, the vendor does not have it yet. After the
> event both sides confirm, and only then is it **released**. So a vendor's money
> is always in one of three states: **upcoming** (booked, not yet paid),
> **in escrow** (paid, held), **released** (theirs). Show it as that pipeline,
> not as one balance. Jorna takes a platform fee, so gross and net both matter
> and both should be visible — vendors are suspicious of marketplaces that hide
> the cut, and showing it plainly is a feature.
>
> **Sections, in priority order.**
>
> 1. **Needs you.** An action list, most urgent first. Booking requests waiting
>    on a yes/no. "Confirm the event happened" — which is what releases their
>    payout, so say that. "Check in at the venue." And, above everything when it
>    applies, **"Finish your payment setup"**: until Stripe onboarding is done a
>    vendor can accept bookings and still never be paid. That one state deserves
>    to look like an alarm; the rest should not.
> 2. **Money.** Released / In escrow / Upcoming as the pipeline above, plus
>    disputed and refunded when non-zero, plus platform fees taken. A per-booking
>    list showing gross, fee, and net.
> 3. **Next jobs.** Today first, then this week. Every job has a start and end
>    time, an address, a client name, and a guest count. A vendor's day is
>    "arrive 2pm at The Drake" — design for that, not for a month grid. Show
>    whether they've checked in.
> 4. **Requests.** Pending bookings to accept or decline, with the price and
>    whether the client can negotiate it.
> 5. **Availability.** Weekly hours, and whether Google Calendar is connected.
>    **Design the empty state as the main one** — most vendors have set nothing,
>    and the screen's job is to get them to.
> 6. **Listing health.** Not a score. A short list of concrete reasons they
>    aren't getting booked: no payment setup, no availability set, a service with
>    no photos, no bio, no travel radius. Each with the consequence spelled out
>    and one button to fix it.
> 7. **Reputation.** Star rating, events completed, two or three recent reviews.
>
> **Do not design** views, impressions, search rank, conversion funnels, response
> time, or benchmarking against other vendors. Jorna does not collect any of it,
> and a dashboard that shows invented numbers is worse than one that shows fewer
> real ones.
>
> **Visual system — match the existing app exactly.**
>
> Light: background `#F6EEE1`, secondary surface `#FCF7EE`, panel `#FBF4E7`,
> card `#FFFFFF`, text `#35101B`, secondary text `#6B4A45`, faint `#7A5A52`,
> maroon `#6B1226`, deep maroon `#4A0B1A`, gold `#A9791F`, bright gold `#C69329`,
> green `#3F6B4E`, hairline `rgba(107,18,38,0.16)`.
>
> Dark: background `#1C0610`, card `#2B0D1A`, panel `#2A0C19`, text `#F3E6D6`,
> secondary `#D8B79C`, maroon `#8A1B34`, gold `#E0B457`, green `#7FB48E`,
> hairline `rgba(224,180,87,0.20)`. Design both.
>
> Headings in an editorial serif (Didot / Bodoni / Hoefler Text), body in Avenir
> Next. Corner radius 16px. Card shadow
> `0 1px 2px rgba(74,11,26,0.05), 0 12px 34px -18px rgba(74,11,26,0.28)`.
>
> **Money uses colour with meaning, and only these:** green = released, gold =
> held in escrow, muted gold = upcoming, maroon = disputed or needs attention.
> Never green for "in escrow" — it isn't theirs yet.
>
> **Tone.** Heritage, not costume — deep maroon, gold, warm cream, editorial
> serif. But this is a working tool for someone's livelihood, so it should feel
> calm and precise rather than celebratory. The client-facing side of Jorna is
> the romantic one; this side is the ledger.
>
> Produce: the mobile dashboard, the desktop dashboard, and the components
> (action row, money pipeline, job card, request card, listing-health row).

---

## After Figma returns it

The export is a Vite + React app whose tokens will match `globals.css` if the
prompt was followed. Port it onto the app's own Tailwind utilities
(`bg-ground`, `text-ink-soft`, `border-card-edge`, …) rather than importing a
second set of variables — the values agreeing is not the same as sharing a
system. That's how the client marketing page was brought over; see the
`Home is the marketing screen now` commit.

Existing vendor pages the dashboard should absorb or link to, not duplicate:
`/my-bookings`, `/vendor-profile` (services CRUD folded in here, not a
separate `/my-services`), `/my-availability`, `/my-earnings`. (`/my-dashboard`
itself now exists too, per the note at the top of this doc.)
