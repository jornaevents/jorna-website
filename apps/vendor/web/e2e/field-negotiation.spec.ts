import { test, expect, pastLinkSteps, toSigning } from "./support/fixtures";
import { loginAs } from "./support/fixtures";
import { mockVendorDetail } from "./support/mock-data";
import type { HandlerArgs } from "./support/api-mock";

// Field-by-field negotiation (backend DECISIONS #26): each side answers the
// other's changes one labeled card at a time, in turns, and the client signs
// once nothing is waiting — or signs it as it is.
test.describe("field-by-field negotiation", () => {
  const lines = [
    { id: "pkg", kind: "package", service_id: "svc-1", addon_id: null, name: "Reception set", description: null, unit: "event", unit_price_cents: 140000, quantity: 1, total_cents: 140000 },
    { id: "lights", kind: "custom", service_id: null, addon_id: null, name: "Uplighting", description: null, unit: "item", unit_price_cents: 10000, quantity: 2, total_cents: 20000 },
  ];
  const terms = {
    date_iso: "2030-06-01", date_end: null, time_start: "18:00", time_end: "22:00", location: "Pines Manor",
    guest_count: 200, line_items: lines, discount_cents: null, amount_cents: 160000,
    payment_schedule: [
      { id: "dep", label: "Deposit", amount_cents: 50000, due_type: "on_signing", due_date: null, due_days: null },
      { id: "bal", label: "Final balance", amount_cents: 110000, due_type: "before_event", due_date: null, due_days: 14 },
    ],
    terms_clauses: [{ key: "travel", title: "Travel", body: "Travel within 30 miles is included." }],
    cancellation_window_hours: 720, overtime_rate_cents: 15000,
  };
  const field = (key: string, label: string, value: unknown, over: Record<string, unknown> = {}) => ({
    key, label, value, group: key.startsWith("event.") ? "event" : key.endsWith(".price") || key === "discount" ? "prices" : key.startsWith("policy.") ? "policies" : key.startsWith("clause:") ? "clauses" : "items",
    state: "agreed", proposed: null, proposed_by: null, round: null, note: null, locked: false, can_change: true, ...over,
  });
  const state = (over: Record<string, unknown> = {}) => ({
    mode: "fields", side: "vendor", round: 2, turn: "vendor", revision: 1, locks: [], nudge: false,
    can_sign: false, waiting_count: 1, terms, previous_terms: null, original_terms: terms, last_send: null, draft: null,
    fields: [
      field("event.date", "Event date", { date_iso: "2030-06-01", date_end: null }),
      field("line:lights.quantity", "Uplighting: quantity", 2, { state: "waiting_vendor", proposed: 3, proposed_by: "client", note: "One more for the dance floor?" }),
      field("line:pkg.price", "Reception set: price", 140000),
      field("discount", "Discount", 0),
      field("policy.overtime", "Overtime rate", 15000),
      field("clause:travel.included", "Include “Travel”", true),
    ],
    ...over,
  });
  const contract = {
    booking_id: "c-1", vendor_id: "vendor-1", service_id: "svc-1", service_name: "Reception set", ...terms,
    subtotal_cents: 160000, document_title: null, document_layout: null, revision: 1, deposit_percent: null,
    deposit_amount_cents: null, addon_rate_cents: null, contract_terms: null, guest_name: "Priya Mehta",
    guest_email: "priya@example.com", guest_phone: null, signer_name: null, signed_at: null, status: "approved",
    payment_status: "unpaid", contract_status: "viewed", sent_at: "2030-05-01T12:00:00", viewed_at: "2030-05-02T12:00:00",
    hold_expires_at: "2030-05-08T12:00:00", declined_at: null, decline_reason: null, voided_at: null,
    contract_token: "tok-1", vendor_display_name: "Arjun Kapoor", vendor_venmo_handle: "@arjun", vendor_zelle_contact: null,
    proposal_status: null, timeline: [],
  };
  const history = { current_revision: 1, open_proposal: null, proposals: [], revisions: [] };

  test("the vendor answers each open field on its own card, and sends once all are answered", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract);
    api.get("/contracts/c-1/proposals", history);
    api.get("/contracts/c-1/negotiation", state());
    api.post("/contracts/c-1/negotiation/send", ({ route }: HandlerArgs) => {
      const body = route.request().postDataJSON();
      return body ? state({ round: 3, turn: "client", can_sign: true, waiting_count: 0 }) : state();
    });

    await page.goto("contracts/changes/?id=c-1");
    const card = page.getByRole("region", { name: "Uplighting: quantity" });
    await expect(card.getByText("Priya Mehta asked:")).toBeVisible();
    await expect(card.getByText("“One more for the dance floor?”")).toBeVisible();

    const send = page.getByRole("button", { name: /^Send( |$)/ });
    await expect(send).toBeDisabled();
    await expect(page.getByText("Answer 1 more field to send.")).toBeVisible();

    // Counter opens the right input, in dollars or units as the field needs.
    await card.getByRole("button", { name: "Counter" }).click();
    await card.getByLabel("Uplighting: quantity").fill("4");
    await expect(page.getByText("Total if this is agreed")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Your answers" }).getByText("$1,800")).toBeVisible();
    // The contract reads as it would be, with the counter in it (#153).
    await expect(page.getByRole("region", { name: "Contract" }).getByText("$1,800").first()).toBeVisible();

    // Accept instead, and change something else on the way.
    await card.getByRole("button", { name: "Accept" }).click();
    await page.getByText("Change something else").click();
    await page.getByRole("complementary", { name: "Your answers" }).getByText("Overtime rate").locator("..").getByRole("button", { name: "Change" }).click();
    await page.getByLabel("Overtime rate ($)").fill("200");
    // An answer and a change of their own, counted apart (#168).
    await expect(send).toHaveText("Send 1 answer and 1 change");
    await send.click();

    await expect(page).toHaveURL(/contracts\/view\/?\?id=c-1/);
    const [call] = api.requestsTo("POST", "/contracts/c-1/negotiation/send");
    expect(call.body).toEqual({
      base_round: 2,
      answers: [
        { key: "line:lights.quantity", action: "accept" },
        { key: "policy.overtime", action: "change", value: 20000 },
      ],
      message: null,
    });
  });

  test("a locked group shows as fixed, and it's read-only on the other side's turn", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract);
    api.get("/contracts/c-1/proposals", history);
    api.get("/contracts/c-1/negotiation", state({ turn: "client", fields: state().fields.map((f) => ({ ...f, state: "agreed", proposed: null })) }));

    await page.goto("contracts/changes/?id=c-1");
    await expect(page.getByText("Waiting on Priya Mehta")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send/ })).toHaveCount(0);
  });

  test("the client answers on their link, then can only sign once nothing waits — or as it is", async ({ page, api }) => {
    const clientState = state({
      side: "client", turn: "client", round: 3, waiting_count: 2,
      fields: [
        field("line:lights.quantity", "Uplighting: quantity", 2, { state: "waiting_client", proposed: 2, proposed_by: "vendor", note: "Two is plenty for that room." }),
        field("policy.overtime", "Overtime rate", 15000, { state: "waiting_client", proposed: 20000, proposed_by: "vendor" }),
        field("line:pkg.price", "Reception set: price", 140000, { locked: true, can_change: false }),
        field("event.guests", "Guest count", 200),
      ],
      packages: [{
        service_id: "svc-1", name: "Reception set", price_cents: 140000, price_unit: "event",
        add_ons: [{ id: "fog", name: "Fog machine", price_cents: 7500 }],
      }],
    });
    api.get("/guest-bookings/tok-1", contract);
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", clientState);
    api.patch("/guest-bookings/tok-1", contract);
    api.post("/guest-bookings/tok-1/sign", { ...contract, signed_at: "2030-05-04T12:00:00", signer_name: "Priya Mehta" });
    api.post("/guest-bookings/tok-1/negotiation/send", state({ side: "client", turn: "vendor", round: 4, waiting_count: 1 }));

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("Arjun Kapoor answered your changes. 2 need your answer before you sign.")).toBeVisible();

    // Signing with changes open needs "as it is".
    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    await page.getByRole("button", { name: "Sign the contract →" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Sign it as it is" })).toBeVisible();
    expect(api.requestsTo("POST", "/guest-bookings/tok-1/sign")).toHaveLength(0);

    // Answer instead: keep asking for 3 lights, accept the overtime rate.
    await page.getByRole("button", { name: "Back to the contract" }).click();
    await page.getByRole("button", { name: "Review their answers" }).click();
    await page.getByText("Change something else").click();
    await expect(page.getByText("Fixed by Arjun Kapoor")).toBeVisible();
    const lights = page.getByRole("region", { name: "Uplighting: quantity" });
    await lights.getByRole("button", { name: "Counter" }).click();
    await lights.getByLabel("Uplighting: quantity").fill("3");
    await page.getByRole("region", { name: "Overtime rate" }).getByRole("button", { name: "Accept" }).click();
    // Add one of the vendor's listed add-ons.
    await page.getByLabel("Add an item").selectOption("svc-1|fog");
    await expect(page.getByText("Fog machine × 1 at $75")).toBeVisible();
    await page.getByRole("button", { name: "Send 2 answers and 1 change" }).click();

    await expect(page.getByText("It's Arjun Kapoor's turn")).toBeVisible();
    // Back on the contract: nothing more to ask while it's their turn, but it can be taken as it is.
    await expect(page.getByText("Sent to Arjun Kapoor. It's their turn — we'll email you when they answer.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask for changes" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign it as it is" })).toBeVisible();
    const [sent] = api.requestsTo("POST", "/guest-bookings/tok-1/negotiation/send");
    expect(sent.body).toMatchObject({
      base_round: 3,
      answers: [
        { key: "line:lights.quantity", action: "counter", value: 3 },
        { key: "policy.overtime", action: "accept" },
        { action: "change", value: { service_id: "svc-1", addon_id: "fog", name: "Fog machine", quantity: 1, unit_price_cents: 7500 } },
      ],
    });
    expect((sent.body as { answers: { key: string }[] }).answers[2].key).toMatch(/^line:new:/);
  });

  test("signing as it is sends as_is", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", contract);
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", state({ side: "client", turn: "vendor", waiting_count: 1 }));
    api.patch("/guest-bookings/tok-1", contract);
    api.post("/guest-bookings/tok-1/sign", { ...contract, signed_at: "2030-05-04T12:00:00", signer_name: "Priya Mehta" });

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    await page.getByLabel(/Sign it as it is/).check();
    await page.getByRole("button", { name: "Sign the contract →" }).click();
    await expect.poll(() => api.requestsTo("POST", "/guest-bookings/tok-1/sign").length).toBe(1);
    expect(api.requestsTo("POST", "/guest-bookings/tok-1/sign")[0].body).toMatchObject({ signer_name: "Priya Mehta", as_is: true });
  });

  test("the client sees the vendor's note, what was kept against their own ask, and can't send nonsense (#152, #168)", async ({ page, api }) => {
    const clientState = state({
      side: "client", turn: "client", round: 3, waiting_count: 2,
      last_send: { round: 3, side: "vendor", message: "150 guests is fine. I can meet you at $3,000.", answers: [], sent_at: "2030-05-03T12:00:00" },
      fields: [
        field("policy.cancellation", "Cancellation window", 720, { state: "waiting_client", proposed: 720, proposed_by: "vendor", your_last_ask: 0 }),
        field("line:pkg.price", "Reception set: price", 140000, { state: "waiting_client", proposed: 130000, proposed_by: "vendor", your_last_ask: 120000 }),
        field("event.guests", "Guest count", 200),
      ],
    });
    api.get("/guest-bookings/tok-1", contract);
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", clientState);

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await page.getByRole("button", { name: "Review their answers" }).click();
    await expect(page.getByText("“150 guests is fine. I can meet you at $3,000.”")).toBeVisible();
    await expect(page.getByText("Arjun Kapoor kept 30 days")).toBeVisible();
    await expect(page.getByText("(you asked 0 days)")).toBeVisible();
    const price = page.getByRole("region", { name: "Reception set: price" });
    await expect(price.getByText("You asked:")).toBeVisible();
    await expect(price.getByText("$1,200", { exact: true })).toBeVisible();
    await expect(price.getByText("Arjun Kapoor answered:")).toBeVisible();
    // The answers name what they settle on (2026-10-26 test).
    await expect(price.getByRole("button", { name: "Accept $1,300" })).toBeVisible();
    await expect(price.getByRole("button", { name: "Ask for $1,200 again" })).toBeVisible();

    // Opening a field isn't a change; a guest count of 0 can't be sent.
    await page.getByText("Change something else").click();
    await page.getByRole("complementary", { name: "Your answers" }).getByText("Guest count").locator("..").getByRole("button", { name: "Change" }).click();
    await expect(page.getByText("Not changed yet")).toBeVisible();
    await page.getByRole("region", { name: "Cancellation window" }).getByRole("button", { name: "Accept" }).click();
    await page.getByRole("region", { name: "Reception set: price" }).getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("button", { name: "Send 2 answers" })).toBeEnabled();
    await page.getByLabel("Guest count", { exact: true }).fill("0");
    await expect(page.getByText("A guest count is a whole number from 1 to 100,000.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send/ })).toBeDisabled();
  });

  test("an offer that expires while the client answers shows as expired, not as a failed send", async ({ page, api }) => {
    // The page reads the booking again after a 410; by then the backend says expired.
    let expired = false;
    api.get("/guest-bookings/tok-1", () => (expired ? { ...contract, contract_status: "expired" } : contract));
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", state({
      side: "client", turn: "client", round: 3, waiting_count: 1,
      fields: [field("policy.overtime", "Overtime rate", 15000, { state: "waiting_client", proposed: 20000, proposed_by: "vendor" })],
    }));
    api.post("/guest-bookings/tok-1/negotiation/send", ({ route }: HandlerArgs) => {
      expired = true;
      return route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ detail: "This offer has expired — ask your vendor to resend it if the date is still open" }),
      });
    });

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await page.getByRole("button", { name: "Review their answers" }).click();
    // How long they have, where they answer.
    await expect(page.getByText(/Arjun Kapoor is holding your date until .+ — send your answers before then\./)).toBeVisible();
    await page.getByRole("region", { name: "Overtime rate" }).getByRole("button", { name: "Accept" }).click();
    await page.getByRole("button", { name: "Send 1 answer" }).click();

    await expect(page.getByRole("heading", { name: "This offer has expired" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Send/ })).toHaveCount(0);
  });

  test("signing an offer that expired meanwhile shows it as expired", async ({ page, api }) => {
    let expired = false;
    api.get("/guest-bookings/tok-1", () => (expired ? { ...contract, contract_status: "expired" } : contract));
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", state({ side: "client", turn: "client", can_sign: true, waiting_count: 0, fields: [] }));
    api.patch("/guest-bookings/tok-1", contract);
    api.post("/guest-bookings/tok-1/sign", ({ route }: HandlerArgs) => {
      expired = true;
      return route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({ detail: "This offer has expired — ask your vendor to resend it if the date is still open" }),
      });
    });

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await toSigning(page);
    await page.getByPlaceholder("Type your full name to sign").fill("Priya Mehta");
    await page.getByRole("button", { name: "Sign the contract →" }).click();

    await expect(page.getByRole("heading", { name: "This offer has expired" })).toBeVisible();
  });

  test("the vendor's notice says whether the client was emailed (#155)", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract);
    api.get("/contracts/c-1/proposals", history);
    api.get("/contracts/c-1/negotiation", state());
    api.post("/contracts/c-1/negotiation/send", state({ round: 3, turn: "client", email_sent: false }));

    await page.goto("contracts/changes/?id=c-1");
    await page.getByRole("region", { name: "Uplighting: quantity" }).getByRole("button", { name: "Accept" }).click();
    await page.getByRole("button", { name: "Send 1 answer" }).click();
    await expect(page.getByText(/We couldn't email them/)).toBeVisible();
    await expect(page.getByText("We emailed them.")).toHaveCount(0);
  });

  test("the only package can't be left out, and leaving an item out drops its price ask", async ({ page, api }) => {
    const clientState = state({
      side: "client", turn: "client", round: 1, waiting_count: 0, can_sign: true,
      fields: [
        field("line:pkg.included", "Include Reception set", true),
        field("line:lights.included", "Include Uplighting", true),
        field("line:lights.price", "Uplighting: price", 10000),
      ],
    });
    api.get("/guest-bookings/tok-1", contract);
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", clientState);
    api.post("/guest-bookings/tok-1/negotiation/send", clientState);

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await page.getByRole("button", { name: "Ask for changes" }).click();
    await page.getByText("Change something else").click();
    const panel = page.getByRole("complementary", { name: "Your answers" });
    await expect(panel.getByText("Needs one package")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Leave out Reception set" })).toHaveCount(0);

    await panel.getByRole("button", { name: "Change Uplighting: price" }).click();
    await page.getByLabel("Uplighting: price ($)").fill("50");
    await panel.getByRole("button", { name: "Leave out Uplighting" }).click();
    const send = page.getByRole("button", { name: /^Send/ });
    await expect(send).toHaveText("Send 1 change");
    await send.click();
    const [call] = api.requestsTo("POST", "/guest-bookings/tok-1/negotiation/send");
    expect((call.body as { answers: unknown[] }).answers).toEqual([{ key: "line:lights.included", action: "change", value: false }]);
  });

  test("the vendor can accept everything at once, and in/out asks have no counter", async ({ page, api }) => {
    await loginAs(page, api);
    api.get("/vendors/me", mockVendorDetail());
    api.get("/contracts/c-1", contract);
    api.get("/contracts/c-1/proposals", history);
    api.get("/contracts/c-1/negotiation", state({
      waiting_count: 2,
      fields: [
        field("line:lights.quantity", "Uplighting: quantity", 2, { state: "waiting_vendor", proposed: 3, proposed_by: "client" }),
        field("clause:travel.included", "Include “Travel”", true, { state: "waiting_vendor", proposed: false, proposed_by: "client" }),
      ],
    }));

    await page.goto("contracts/changes/?id=c-1");
    await expect(page.getByRole("region", { name: "Include “Travel”" }).getByRole("button", { name: "Counter" })).toHaveCount(0);
    await page.getByRole("button", { name: "Accept all" }).click();
    await expect(page.getByRole("button", { name: "Send 2 answers" })).toBeEnabled();
  });

  test("after sending, the client sees what they asked for", async ({ page, api }) => {
    api.get("/guest-bookings/tok-1", contract);
    api.get("/guest-bookings/tok-1/proposals", history);
    api.get("/guest-bookings/tok-1/negotiation", state({
      side: "client", turn: "vendor", round: 2, waiting_count: 0,
      fields: [field("event.guests", "Guest count", 200, { state: "waiting_vendor", proposed: 180, proposed_by: "client" })],
    }));

    await pastLinkSteps(page, "tok-1");
    await page.goto("booking-link/?t=tok-1");
    await expect(page.getByText("Waiting on Arjun Kapoor")).toBeVisible();
    await expect(page.getByText(/Guest count: you asked for/)).toBeVisible();
    await expect(page.getByText(/^Round 2$/)).toHaveCount(0);
  });
});
