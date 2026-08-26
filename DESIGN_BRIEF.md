# Jorna — design brief for Figma AI

Prompts for designing jornaevents.com end to end.

**Use it in two stages.** Figma's AI degrades badly when asked for thirty screens
at once — it produces thirty shallow ones. Paste **Part 1** first to establish the
system and get the core components, then run **Part 2** prompts one screen at a
time, each of which references the system by name.

Everything below reflects the real tokens in
[`web/src/app/globals.css`](web/src/app/globals.css) and the real routes in
[`web/src/app/`](web/src/app/) as of 2026-07-26. Keep them in sync — a design in
colours the code doesn't have is a design nobody ships.

---

## Part 1 — the master brief (paste this first)

> You are designing **Jorna**, a marketplace web app for planning South Asian
> celebrations — weddings, sangeets, mehndis, poojas, and large parties. Design
> for **mobile first (390×844)**, then desktop (1440). Produce a design system
> plus the core components; I'll ask for individual screens afterwards.
>
> **The product, so the design has something to be about.**
> Two kinds of people use Jorna. **Hosts** are planning one enormous, expensive,
> emotionally loaded event — often the biggest purchase of their life after a
> house — and they are assembling a *team* of vendors: venue, catering, DJ, dhol,
> mehndi artist, photographer, florist. **Vendors** are small businesses, often
> one person, who list services and get booked.
>
> The core loop is: a host describes their event (city, date, guest count,
> budget, vibe) → Jorna generates **three complete vendor teams** to compare
> (Budget / Balanced / Top Rated) → they pick one, adjust it, and book → they pay
> into **escrow**, where the money is held → the event happens → both sides
> confirm → the vendor is paid. Money sitting in escrow for months is the single
> most anxious part of the experience, and the interface has to feel trustworthy
> enough to carry it.
>
> **Tone.** Heritage, not costume. This is a South Asian product and should feel
> like it — deep maroon, gold, warm cream, editorial serif headlines — but
> through restraint and quality, never through clip-art mandalas, paisley
> borders, or henna-pattern dividers. The reference points are a well-made
> wedding invitation and a good print magazine, not a festival flyer and not a
> generic blue SaaS dashboard. Warm, calm, confident, a little formal. Every
> screen handles either a lot of money or someone's wedding.
>
> **Use these exact colours. Do not invent a palette.**
>
> Light theme:
> - Page background `#F6EEE1` (warm cream), secondary surface `#FCF7EE`, panel `#FBF4E7`, card `#FFFFFF`
> - Text `#35101B`, secondary text `#6B4A45`, faint text `#7A5A52`
> - Primary maroon `#6B1226`, deep maroon `#4A0B1A`
> - Gold `#A9791F`, bright gold `#C69329`
> - Success green `#3F6B4E`
> - Hairlines: `rgba(107,18,38,0.16)`; softer `rgba(107,18,38,0.09)`; card edge `rgba(107,18,38,0.12)`
>
> Dark theme (design every screen in both):
> - Background `#1C0610`, secondary `#250A16`, panel `#2A0C19`, card `#2B0D1A`
> - Text `#F3E6D6`, secondary `#D8B79C`, faint `#B08E7E`
> - Maroon `#8A1B34`, deep `#3A0C1B`; gold `#E0B457`, bright `#F0C971`; green `#7FB48E`
> - Hairlines `rgba(224,180,87,0.20)` / `0.11` / `0.16`
>
> **Type** (updated 2026-08-25 — was a two-font pairing, see below). One
> humanist sans (Avenir Next, Segoe UI, system-ui) for headings, body, and UI
> alike — nothing downloaded, nothing fetched over the network. Headings are
> maroon in light and gold in dark. Generous line height; body no smaller than
> 16px on mobile.
>
> Headings previously used a separate high-contrast Didot-style serif (Didot,
> Bodoni 72, Hoefler Text, Palatino). Dropped because on a system with none of
> those installed, the fallback chain read as a generic, less-readable serif
> (Times New Roman on Windows) sitting inconsistently next to the sans body
> text — one typeface everywhere reads more consistent and is more reliably
> legible across platforms than a serif/sans pairing that depends on which
> fonts happen to be installed.
>
> **Shape and depth.** Rounded but not pill-soft: 16–20px on cards, fully rounded
> on buttons and chips. One shadow only, very soft and low:
> `0 1px 2px rgba(74,11,26,.05), 0 12px 34px -18px rgba(74,11,26,.28)`. Prefer a
> hairline border over a shadow. No glassmorphism, no gradients except a barely
> perceptible warm one behind hero sections.
>
> **Build these components, in light and dark, with every state (default, hover,
> pressed, disabled, loading, error, empty):**
> 1. **Button** — primary (maroon fill, cream text), ghost (text + hairline), destructive (for cancel/dispute). Fully rounded, 44px min tap target.
> 2. **Card** — white/`#2B0D1A` surface, hairline edge, 16–20px radius, the soft shadow.
> 3. **Field** — label above, input, hint line below, and an error state that keeps the layout from jumping.
> 4. **Chip** — filter/toggle pill, active and inactive.
> 5. **Stars** — 0–5 rating in gold, with a half state and an empty ("No reviews yet") treatment.
> 6. **Avatar** — circular, with initials fallback on maroon.
> 7. **Rule** — a hairline divider.
> 8. **Vendor card** — photo, name, category, star rating, price with its unit ("$1,200 per event" / "per person" / "per hour" / "per day"), distance, and a badge slot.
> 9. **Bottom tab bar** (mobile) — 5 items, maroon active state.
> 10. **Money row** — a label/amount pair used in totals and earnings; amounts right-aligned and tabular.
> 11. **Status pill** — the booking states: Pending, Approved, Rejected, Negotiating, Paid, In escrow, Released, Refunded, Disputed. Each needs its own colour treatment; green only for genuinely-good states, maroon for attention, neutral for waiting.
> 12. **Empty state** — icon, one line of explanation, one action.
>
> **Rules that are not negotiable:**
> - **Never show a rate as if it were a total.** Prices carry a unit; a per-person price with no guest count yet must read as "from $X per person", never a single number that looks like the bill.
> - **Money needs a visible state at all times.** A host must always be able to tell whether their money is unpaid, held in escrow, released to the vendor, refunded, or disputed. Never let "paid" and "released" look the same.
> - **Design the empty state for every list.** A new host has no events, no bundles, and no messages; a new vendor has no bookings and no earnings. These are the first screens most people see, so they are not edge cases.
> - **Both themes, every screen.** Dark is not an afterthought — the tokens above are already defined for it.
> - **Accessible contrast** — AA minimum. Gold on cream is the danger spot: gold is for accents and headings, not small body text on a light background.
> - No stock photography of white couples at Western weddings. If you use imagery, it's South Asian celebration imagery, and it's incidental — the interface carries the design, not the photos.

---

## Part 2 — screens, one prompt at a time

Prefix each with: *"Using the Jorna design system and components already
established, design…"*

### The public site (nobody is signed in)

**1. Landing page** — *this does not exist yet; it's new work.*
> A marketing landing page at jornaevents.com. Sections: a hero with the one-line
> promise (plan an entire celebration, one matched team of vendors, paid safely
> through escrow) and a primary "Get started" plus secondary "Browse vendors"; a
> three-step explainer of the core loop (describe your event → compare three
> complete vendor teams → book and pay safely); a visual of the three-bundle
> comparison, which is the actual differentiator; a section for vendors ("list
> your services, get booked, get paid") with its own call to action; trust
> signals explaining escrow in plain language; an FAQ; and a footer with terms,
> privacy, support, and contact. Mobile and desktop.

**2. Walkthrough / help page** (`/help/`)
> A long-form explainer page covering how Jorna works for hosts and for vendors,
> with a tab or toggle between the two audiences. Long-form reading layout —
> narrow measure, clear hierarchy, anchored section nav on desktop.

**3. Legal pages** (`/privacy`, `/terms`, `/support`)
> A shared document template for legal text: readable measure (~65 characters),
> clear heading hierarchy, a table of contents on desktop, last-updated date.
> The support page also needs a contact block and a "report a problem" route.

**4. 404 page**

### Account

**5. Sign in / sign up** (`/login`) — one screen, two modes
> Email + password, a "Continue with Google" button, and a mode toggle between
> signing in and creating an account. Sign-up additionally asks name, username,
> location, and a required choice between **Host** ("Plan a celebration and book
> a team") and **Vendor** ("List your services and get booked") as two selectable
> cards. Include a "Forgot password?" link and the Google-completion variant
> where the email is locked to the Google address.

**6. Forgot password** (`/forgot-password`) and **7. Reset password** (`/reset-password`)
> Request form with a deliberately generic confirmation (it must never reveal
> whether an email exists), and the new-password form with the real rule stated
> up front: 8+ characters including upper, lower, and a digit.

### Host journey

**8. Browse / Home** (`/browse`) — *the app's front door*
> A search field, category filter chips (Venue, Catering, Photography, DJ, Dhol,
> Floral & Decor, Makeup, Mehndi, Cultural Services), a grid of vendor cards, and
> a "Trending celebrations" row of eight tappable tiles (Wedding, Sangeet,
> Mehndi, Pooja, Bachelor Party, Bachelorette Party, Birthday, Graduation) that
> open the planner pre-filled. Include loading skeletons and a no-results state.

**9. AI bundle builder** (`/plan`) — *the product's centrepiece, give it the most care*
> A single form: city (with autocomplete), date or date range, guest count,
> budget tier (Budget-friendly / Balanced / Premium), a vibe multi-select
> (elegant, traditional, modern, luxury, fun, minimal), and category checkboxes.
> Then the generating state — this takes real seconds, so design the wait, not a
> spinner. Then **the results: three complete vendor teams side by side**
> (Budget / Balanced / Top Rated), each showing its total, its per-slot vendors
> with photo, name and price, and a "Choose this team" action. On mobile these
> become a swipeable carousel or stacked cards. This comparison is the single
> most important screen in the product.

**10. Vendor profile** (`/vendor?id=`)
> Photo gallery, name, category, star rating and review count, bio, location and
> travel radius, a list of bookable services each with price + unit and a "Book
> this" action, reviews, and an overflow menu holding Report and Block.

**11. Book a service** (`/book?service=`)
> Date (with a multi-day toggle), time window, guest count — **required for
> per-person services** — location, and a live estimated total that updates as
> fields change. Plus the choice to add it to a new event or an existing one.

**12. My bundles** (`/bundles`) and **13. Bundle detail** (`/bundle?id=`)
> The list is simple. The detail screen is where money lives: every booking in
> the team with its status pill, the running total, and contextual actions — Pay,
> Swap this vendor, Remove, Negotiate, Confirm & release, Request refund, Report
> a problem. Design the escrow explainer that sits beside "Confirm & release", an
> "At the venue?" check-in affordance that makes clear it releases nothing, and
> the paid state where editing is locked.

**14. Events** (`/events`) and **15. Event detail** (`/event?id=`)
**16. Payment complete** (`/payment-complete`) — returning from Stripe; success, pending, and failure.

### Vendor journey

**17. Become a vendor / edit profile** (`/vendor-profile`)
**18. My services** — folded into `/vendor-profile` (`ServicesManager.tsx`),
not a separate route any more
> List, plus create/edit with rate + unit (flat / per person / per hour / per
> day), a negotiable toggle, photo management, and the venue-only case that
> **requires an address and map coordinates**.

**19. Booking requests** (`/my-bookings`)
> Filtered by needs-an-answer / accepted / all, with the pending count
> prominent. Each request needs approve and decline, a flag when the total is
> still pending a quantity, and — once paid — the vendor's half of releasing
> escrow: "Check in at venue" (GPS) or a plain "Confirm" for venue-less events.

**20. Earnings** (`/my-earnings`)
> Paid out, held in escrow, and upcoming, plus disputed and refunded when they
> apply, and a payment history. Amounts are net of the platform fee and the
> screen must say so. Include the un-onboarded state that says plainly that
> bookings can be accepted but **clients cannot pay you yet**.

**21. Availability** (`/my-availability`) — per-weekday editor with multiple time windows per day.
**22. Stripe onboarding** — the redirect-out and return states.

### Shared

**23. Messages inbox** (`/messages`) and **24. Conversation** (`/conversation?id=`)
> Per-event group chat between the host and all their vendors. Message bubbles,
> sender avatars, unread indicators, a live/offline indicator, and the empty
> state before anyone has written.

**25. Negotiation panel** — a component, not a page
> Turn-based offer / counter / accept / decline, showing the offer history and
> whose turn it is. Only the *other* party may counter or accept.

**26. Leave a review** — star selection plus comment, and the already-reviewed state.
**27. Activity / "Needs you"** (`/activity`) — a derived list of what is waiting on this person, with a push-notification opt-in.
**28. Profile hub** (`/profile`) and **29. Account settings** (`/account`) — name, email, phone, location, avatar upload, change password, and the blocked-users list.

---

## What to hand back to engineering

Ask Figma for: the token set as **variables** (not hardcoded fills), components
as **component sets with variants** for state and theme, and screens at 390 and
1440. Anything delivered as flat frames with baked-in colours will be rebuilt
from scratch, which defeats the point.
