import { test, expect, pastLinkSteps } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";

// The negotiation workspace (backend DECISIONS #23, #24): the couple
// proposes edits on their signing link, the vendor sees them in the
// contract and answers — accept, decline, or revise the values inline — and
// the couple sees what changed before signing. Either side can save a draft.
test.describe("contract change proposals", () => {
  const schedule = [
    { id: "dep", label: "Deposit", amount_cents: 50000, due_type: "on_signing", due_date: null, due_days: null, due_on: null, marked_paid_at: null, confirmed_at: null },
    { id: "bal", label: "Final balance", amount_cents: 110000, due_type: "before_event", due_date: null, due_days: 14, due_on: "2030-05-18", marked_paid_at: null, confirmed_at: null },
  ];
  const bareSchedule = schedule.map(({ id, label, amount_cents, due_type, due_date, due_days }) => ({
    id, label, amount_cents, due_type, due_date, due_days,
  }));
  const lines = [
    { id: "pkg", kind: "package", service_id: "svc-1", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140000, quantity: 1, total_cents: 140000 },
    { id: "lights", kind: "custom", service_id: null, addon_id: null, name: "Uplighting", description: null, unit: "item", unit_price_cents: 10000, quantity: 2, total_cents: 20000 },
  ];
  const clauses = [
    { key: "scope", title: "Scope", body: "DJ and MC for the reception." },
    { key: "travel", title: "Travel", body: "Travel within 30 miles is included." },
  ];

  const contract = (over: Record<string, unknown> = {}) => ({
    booking_id: "c-1",
    vendor_id: "vendor-1",
    service_id: "svc-1",
    service_name: "Reception set",
    date_iso: "2030-06-01",
    date_end: null,
    time_start: "18:00",
    time_end: "22:00",
    location: "Pines Manor",
    guest_count: 200,
    amount_cents: 160000,
    subtotal_cents: 160000,
    discount_cents: null,
    line_items: lines,
    payment_schedule: schedule,
    terms_clauses: clauses,
    document_title: null,
    document_layout: null,
    revision: 1,
    signed_snapshot_sha256: null,
    deposit_percent: null,
    deposit_amount_cents: null,
    cancellation_window_hours: 720,
    overtime_rate_cents: 15000,
    addon_rate_cents: null,
    contract_terms: null,
    guest_name: "Priya Mehta",
    guest_email: "priya@example.com",
    guest_phone: null,
    signer_name: null,
    signed_at: null,
    status: "approved",
    payment_status: "unpaid",
    contract_status: "viewed",
    sent_at: "2030-05-01T12:00:00",
    viewed_at: "2030-05-02T12:00:00",
    hold_expires_at: "2030-05-08T12:00:00",
    declined_at: null,
    decline_reason: null,
    voided_at: null,
    contract_token: "tok-1",
    vendor_display_name: "Arjun Kapoor",
    vendor_venmo_handle: "@arjun",
    vendor_zelle_contact: null,
    deposit_marked_paid_at: null,
    deposit_confirmed_received_at: null,
    proposal_status: null,
    timeline: [],
    ...over,
  });

  const terms = (over: Record<string, unknown> = {}) => ({
    date_iso: "2030-06-01",
    date_end: null,
    time_start: "18:00",
    time_end: "22:00",
    location: "Pines Manor",
    guest_count: 200,
    line_items: lines,
    discount_cents: null,
    amount_cents: 160000,
    payment_schedule: bareSchedule,
    terms_clauses: clauses,
    cancellation_window_hours: 720,
    overtime_rate_cents: 15000,
    ...over,
  });

  /** Three lights instead of two, the balance to match, a longer radius. */
  const proposedTerms = terms({
    line_items: [lines[0], { ...lines[1], quantity: 3, total_cents: 30000 }],
    amount_cents: 170000,
    payment_schedule: [bareSchedule[0], { ...bareSchedule[1], amount_cents: 120000 }],
    terms_clauses: [clauses[0], { ...clauses[1], body: "Travel within 50 miles is included." }],
  });

  const proposal = (over: Record<string, unknown> = {}) => ({
    proposal_id: "p-1",
    base_revision: 1,
    status: "open",
    message: "Could we add a light, and stretch the travel?",
    response_note: null,
    result_revision: null,
    created_at: "2030-05-03T12:00:00",
    responded_at: null,
    proposed: proposedTerms,
    ...over,
  });

  const history = (over: Record<string, unknown> = {}) => ({
    current_revision: 1,
    open_proposal: null,
    proposals: [],
    revisions: [{ revision: 1, created_at: "2030-05-01T12:00:00", terms: terms() }],
    ...over,
  });

  const workspace = (page: import("@playwright/test").Page, who: string) =>
    page.getByRole("region", { name: `${who} contract negotiation` });

  test("the client changes values in the workspace and sends only what changed", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", contract());
    api.get("/guest-bookings/tok-1/proposals", history());
    api.post("/guest-bookings/tok-1/proposals", history({ open_proposal: proposal(), proposals: [proposal()] }));

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await page.getByRole("button", { name: "Ask for changes" }).click();
    const ws = workspace(page, "Arjun Kapoor");
    await expect(ws.getByRole("heading", { name: "Review and revise" })).toBeVisible();
    // Nothing changed yet, nothing to send.
    await expect(ws.getByRole("button", { name: /Send to Arjun Kapoor/ })).toBeDisabled();

    await ws.getByLabel("Change something else").selectOption({ label: "Uplighting · quantity" });
    await ws.getByLabel("Your uplighting · quantity").fill("3");
    // The balance follows the total until they touch a payment.
    await expect(ws.getByText("$1,200.00").first()).toBeVisible();
    await ws.getByLabel("Change something else").selectOption({ label: "Travel" });
    await ws.getByLabel("Your travel").fill("Travel within 50 miles is included.");
    await ws.getByLabel(/A note for Arjun Kapoor/).fill("Could we add a light, and stretch the travel?");
    await ws.getByRole("button", { name: /Send to Arjun Kapoor/ }).click();

    await expect(page.getByText("Waiting for Arjun Kapoor")).toBeVisible();
    const [call] = api.requestsTo("POST", "/guest-bookings/tok-1/proposals");
    expect(call.body).toMatchObject({
      base_revision: 1,
      message: "Could we add a light, and stretch the travel?",
      changes: {
        line_items: [{ id: "pkg", quantity: 1 }, { id: "lights", quantity: 3 }],
        payment_schedule: [{ id: "dep", amount_cents: 50000 }, { id: "bal", amount_cents: 120000 }],
        terms_clauses: [{ key: "scope" }, { key: "travel", body: "Travel within 50 miles is included." }],
      },
    });
    expect(Object.keys((call.body as { changes: object }).changes).sort()).toEqual([
      "line_items",
      "payment_schedule",
      "terms_clauses",
    ]);
  });

  test("the client app's Propose changes link opens the workspace, where they can ask for something extra and save a draft", async ({
    page,
    api,
  }) => {
    api.get("/guest-bookings/tok-1", contract());
    api.get("/guest-bookings/tok-1/proposals", history());
    api.put("/guest-bookings/tok-1/proposals/draft", {
      base_revision: 1, changes: {}, message: null, proposal_id: null, updated_at: "2030-05-03T12:00:00", stale: false,
    });
    api.patch("/guest-bookings/tok-1", contract());

    // A first visit: the workspace waits until they've given their email and details.
    await page.goto("booking-link/?t=tok-1&propose=1");
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue to the contract" }).click();
    const ws = workspace(page, "Arjun Kapoor");
    await ws.getByRole("button", { name: "+ Ask for something extra" }).click();
    await ws.getByLabel("Your item").fill("Cold sparklers");
    await expect(ws.getByRole("article").getByText("Cold sparklers")).toBeVisible();
    await ws.getByRole("button", { name: "Save draft" }).click();
    await expect(ws.getByText("Draft saved.").first()).toBeVisible();
    const [call] = api.requestsTo("PUT", "/guest-bookings/tok-1/proposals/draft");
    const body = call.body as { base_revision: number; changes: { line_items: { name: string }[] } };
    expect(body.base_revision).toBe(1);
    expect(body.changes.line_items.map((l) => l.name)).toEqual(["Reception set", "Uplighting", "Cold sparklers"]);
  });

  test("a saved draft comes back, and a clause can be dropped", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", contract());
    api.get(
      "/guest-bookings/tok-1/proposals",
      history({
        draft: {
          base_revision: 1,
          changes: terms({ overtime_rate_cents: 12000 }),
          message: null,
          proposal_id: null,
          updated_at: "2030-05-03T12:00:00",
          stale: false,
        },
      }),
    );
    api.post("/guest-bookings/tok-1/proposals", history({ open_proposal: proposal(), proposals: [proposal()] }));

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1&propose=1");
    const ws = workspace(page, "Arjun Kapoor");
    await expect(ws.getByLabel("Your overtime rate (per hour)")).toHaveValue("120");
    await ws.getByRole("button", { name: /^Travel/ }).click();
    await ws.getByRole("button", { name: /Send to Arjun Kapoor/ }).click();
    const [call] = api.requestsTo("POST", "/guest-bookings/tok-1/proposals");
    expect(call.body).toMatchObject({
      changes: { overtime_rate_cents: 12000, terms_clauses: [{ key: "scope" }] },
    });
  });

  test("an open proposal says it's waiting, opens read-only, and can be withdrawn", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", contract({ proposal_status: "open" }));
    api.get("/guest-bookings/tok-1/proposals", history({ open_proposal: proposal(), proposals: [proposal()] }));
    api.post(
      "/guest-bookings/tok-1/proposals/p-1/withdraw",
      history({ proposals: [proposal({ status: "withdrawn" })] }),
    );

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("Waiting for Arjun Kapoor")).toBeVisible();
    await page.getByRole("button", { name: "See your proposal" }).click();
    const ws = workspace(page, "Arjun Kapoor");
    await expect(ws.getByText("Waiting for Arjun Kapoor.").first()).toBeVisible();
    await expect(ws.getByRole("button", { name: "Change your proposal" })).toBeVisible();
    await expect(ws.getByRole("button", { name: /Send to/ })).toHaveCount(0);
    await ws.getByRole("button", { name: "Close negotiation" }).click();

    // They can still sign the version on the table.
    await expect(page.getByRole("button", { name: "Sign it as it is" })).toBeVisible();
    await page.getByRole("button", { name: "Withdraw it" }).click();
    await expect(page.getByText("Withdrawn. The contract is as it was.")).toBeVisible();
    expect(api.requestsTo("POST", "/guest-bookings/tok-1/proposals/p-1/withdraw")).toHaveLength(1);
  });

  test("after a revision the client sees what the vendor changed, in the contract", async ({ page, api }) => {
    const revised = terms({
      line_items: [lines[0], { ...lines[1], quantity: 3, total_cents: 30000 }],
      amount_cents: 170000,
      payment_schedule: [bareSchedule[0], { ...bareSchedule[1], amount_cents: 120000 }],
      terms_clauses: [clauses[0], { ...clauses[1], body: "Travel within 40 miles is included." }],
    });
    api.get(
      "/guest-bookings/tok-1",
      contract({
        revision: 2,
        proposal_status: "revised",
        line_items: revised.line_items,
        amount_cents: 170000,
        payment_schedule: [schedule[0], { ...schedule[1], amount_cents: 120000 }],
        terms_clauses: revised.terms_clauses,
      }),
    );
    api.get(
      "/guest-bookings/tok-1/proposals",
      history({
        current_revision: 2,
        proposals: [proposal({ status: "revised", result_revision: 2, response_note: "40 miles is the most I can do." })],
        revisions: [
          { revision: 2, created_at: "2030-05-04T12:00:00", terms: revised },
          { revision: 1, created_at: "2030-05-01T12:00:00", terms: terms() },
        ],
      }),
    );

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("Arjun Kapoor sent a new version")).toBeVisible();
    const reply = page.getByRole("region", { name: "Their reply" });
    await expect(reply.getByText("Quantity 2 → 3")).toBeVisible();
    await reply.getByRole("button", { name: "See it in the contract" }).click();

    const ws = workspace(page, "Arjun Kapoor");
    // Sent, proposed, revised: the third turn.
    await expect(ws.getByText("Round 3").first()).toBeVisible();
    await expect(ws.getByText(/40 miles is the most I can do/).first()).toBeVisible();
    // The extra light was the couple's ask, which the vendor took; the
    // travel radius was their ask too, which the vendor countered.
    await expect(ws.getByText("You asked for this — Arjun Kapoor accepted it.").first()).toBeVisible();
    await expect(ws.getByText("How Arjun Kapoor changed your wording").first()).toBeVisible();
    await expect(ws.getByText(/of your asks accepted/).last()).toBeVisible();
    await expect(ws.getByLabel("Your uplighting · quantity")).toHaveValue("3");
  });

  test("the vendor sees the couple's changes in the contract and accepts them with a note", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract({ proposal_status: "open" }));
    api.get("/contracts/c-1/proposals", history({ open_proposal: proposal(), proposals: [proposal()] }));
    api.post("/contracts/c-1/proposals/p-1/accept", contract({ revision: 2, proposal_status: "accepted" }));
    api.get("/contracts/c-1/documents", { items: [], total: 0 });

    await page.goto("contracts/changes/?id=c-1");
    const ws = workspace(page, "Priya Mehta");
    await expect(ws.getByRole("heading", { name: "Priya Mehta" })).toBeVisible();
    await expect(ws.getByText("“Could we add a light, and stretch the travel?”").first()).toBeVisible();
    await expect(ws.getByText("Original agreement").first()).toBeVisible();
    await expect(ws.getByText("Priya Mehta's proposal").first()).toBeVisible();
    // Their values are in the contract, marked.
    await expect(ws.getByRole("article").locator(".bg-rose-500\\/15").first()).toBeVisible();

    await ws.getByLabel(/A note for Priya Mehta/).fill("Happy to.");
    await ws.getByRole("button", { name: /Accept changes/ }).click();
    await expect(page).toHaveURL(/contracts\/view\/?\?id=c-1/);
    await expect(page.getByText(/You accepted Priya Mehta's changes/)).toBeVisible();
    const [call] = api.requestsTo("POST", "/contracts/c-1/proposals/p-1/accept");
    expect(call.body).toEqual({ note: "Happy to." });
  });

  test("revising a value inline sends the vendor's version as the answer, with the note", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract({ proposal_status: "open" }));
    api.get("/contracts/c-1/proposals", history({ open_proposal: proposal(), proposals: [proposal()] }));
    api.patch("/contracts/c-1", contract({ revision: 2, proposal_status: "revised" }));
    api.get("/contracts/c-1/documents", { items: [], total: 0 });

    await page.goto("contracts/changes/?id=c-1");
    const ws = workspace(page, "Priya Mehta");
    await ws.getByLabel("Your travel").fill("Travel within 40 miles is included.");
    await ws.getByLabel(/A note for Priya Mehta/).fill("40 is the most I can do.");
    await ws.getByRole("button", { name: /Send to Priya Mehta/ }).click();

    await expect(page).toHaveURL(/contracts\/view\/?\?id=c-1/);
    const [call] = api.requestsTo("PATCH", "/contracts/c-1");
    expect(call.body).toMatchObject({
      proposal_id: "p-1",
      proposal_note: "40 is the most I can do.",
      line_items: [{ id: "pkg" }, { id: "lights", quantity: 3 }],
      terms_clauses: [{ key: "scope" }, { key: "travel", body: "Travel within 40 miles is included." }],
    });
  });

  test("declining keeps the vendor's version, and a date clash on accept is explained", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract({ proposal_status: "open" }));
    api.get("/contracts/c-1/proposals", history({ open_proposal: proposal(), proposals: [proposal()] }));
    api.error("POST", "/contracts/c-1/proposals/p-1/accept", 409, "You already have a booking that overlaps this date/time");
    api.post("/contracts/c-1/proposals/p-1/decline", contract({ proposal_status: "declined" }));
    api.get("/contracts/c-1/documents", { items: [], total: 0 });

    await page.goto("contracts/changes/?id=c-1");
    const ws = workspace(page, "Priya Mehta");
    await ws.getByRole("button", { name: /Accept changes/ }).click();
    await expect(ws.getByRole("alert").filter({ hasText: "overlaps" })).toBeVisible();

    await ws.getByLabel(/A note for Priya Mehta/).fill("Travel is fixed, sorry.");
    await ws.getByRole("button", { name: "Decline their changes" }).click();
    await ws.getByRole("button", { name: "Decline their changes" }).click();
    await expect(page).toHaveURL(/contracts\/view\/?\?id=c-1/);
    const [call] = api.requestsTo("POST", "/contracts/c-1/proposals/p-1/decline");
    expect(call.body).toEqual({ note: "Travel is fixed, sorry." });
  });

  test("the vendor saves a draft answer, and it's there next time", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract({ proposal_status: "open" }));
    api.get(
      "/contracts/c-1/proposals",
      history({
        open_proposal: proposal(),
        proposals: [proposal()],
        draft: {
          base_revision: 1,
          changes: { ...proposedTerms, overtime_rate_cents: 20000 },
          message: null,
          proposal_id: "p-1",
          updated_at: "2030-05-03T12:00:00",
          stale: false,
        },
      }),
    );
    api.put("/contracts/c-1/proposals/draft", {
      base_revision: 1, changes: {}, message: null, proposal_id: "p-1", updated_at: "2030-05-03T13:00:00", stale: false,
    });

    await page.goto("contracts/changes/?id=c-1");
    const ws = workspace(page, "Priya Mehta");
    await expect(ws.getByLabel("Your overtime rate (per hour)")).toHaveValue("200");
    await expect(ws.getByRole("button", { name: /Send to Priya Mehta/ })).toBeVisible();
    await ws.getByRole("button", { name: "Save draft" }).click();
    await expect(ws.getByText("Draft saved.").first()).toBeVisible();
    const [call] = api.requestsTo("PUT", "/contracts/c-1/proposals/draft");
    expect(call.body).toMatchObject({ base_revision: 1, proposal_id: "p-1", changes: { overtime_rate_cents: 20000 } });
  });

  test("the contract page points the vendor at proposed changes", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/contracts/c-1", contract({ proposal_status: "open" }));
    api.get("/contracts/c-1/documents", { items: [], total: 0 });

    await page.goto("contracts/view/?id=c-1");
    await expect(page.getByText("Priya Mehta proposed changes.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Review changes" })).toHaveAttribute(
      "href",
      /contracts\/changes\/?\?id=c-1/,
    );
  });
});
