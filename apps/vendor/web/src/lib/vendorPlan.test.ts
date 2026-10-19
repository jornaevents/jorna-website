import { describe, expect, it } from "vitest";
import {
  bookingMoney,
  bookingProgress,
  bookingSteps,
  bookingTab,
  effectiveDue,
  overdueInstallments,
  overPill,
  canAttachDocument,
  paymentsToConfirm,
  contractNeedsVendor,
  contractStatus,
  countdownLabel,
  depositsOwedCents,
  leadSummary,
  receivedThisMonthCents,
  upcomingBookings,
  pipelineStage,
  pipelineStats,
  vendorTasks,
} from "./vendorPlan";
import type { VendorBooking } from "./types";

function booking(overrides: Partial<VendorBooking> = {}): VendorBooking {
  return {
    booking_id: "b1",
    user_id: "u1",
    status: "approved",
    date_iso: "2026-06-01",
    price: 100,
    ...overrides,
  };
}

describe("vendorTasks — negotiation", () => {
  it("surfaces a task when it's the vendor's turn to answer an open offer", () => {
    const tasks = vendorTasks(
      [
        booking({
          status: "negotiation_ongoing",
          negotiation_awaiting_role: "vendor",
        }),
      ],
      null,
    );
    expect(tasks.map((t) => t.kind)).toContain("negotiation");
  });

  it("does not surface a task for the vendor's own unanswered counter", () => {
    // Regression: this used to fire for ANY negotiation_ongoing booking,
    // including the vendor's own counter still sitting with the client —
    // "{client} made an offer, Review offer" shown for an offer the vendor
    // themselves just made. negotiation_awaiting_role fixes that.
    const tasks = vendorTasks(
      [
        booking({
          status: "negotiation_ongoing",
          negotiation_awaiting_role: "client",
        }),
      ],
      null,
    );
    expect(tasks.map((t) => t.kind)).not.toContain("negotiation");
  });

  it("does not surface a task once the negotiation has settled", () => {
    const tasks = vendorTasks(
      [booking({ status: "approved", negotiation_awaiting_role: null })],
      null,
    );
    expect(tasks.map((t) => t.kind)).not.toContain("negotiation");
  });
});

describe("pipelineStage", () => {
  // Ordinary, marketplace-sourced bookings (no contract_token) — no
  // signature step, BookingStatus is what "confirmed" means for these.
  it("buckets a pending ordinary booking as inquiry", () => {
    expect(pipelineStage(booking({ status: "pending" }))).toBe("inquiry");
  });

  it("buckets a negotiating ordinary booking as inquiry", () => {
    expect(pipelineStage(booking({ status: "negotiation_ongoing" }))).toBe("inquiry");
  });

  it("buckets an approved ordinary booking as confirmed", () => {
    expect(pipelineStage(booking({ status: "approved" }))).toBe("confirmed");
  });

  // Guest/contract bookings (have a contract_token) — created already
  // "approved" with no accept/decline step, so the signature is what
  // "confirmed" means instead of status.
  it("buckets an unsigned contract booking as awaiting_client, even though status is already approved", () => {
    expect(
      pipelineStage(
        booking({ status: "approved", contract_token: "tok", signed_at: null }),
      ),
    ).toBe("awaiting_client");
  });

  it("buckets a signed contract booking as confirmed", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
        }),
      ),
    ).toBe("confirmed");
  });

  // Deposit received — only reachable when a deposit is actually configured.
  it("buckets a signed contract with a confirmed deposit as deposit_received", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          deposit_percent: 50,
          deposit_confirmed_received_at: "2027-01-02T00:00:00Z",
        }),
      ),
    ).toBe("deposit_received");
  });

  it("does not treat a marked-but-unconfirmed deposit as deposit_received", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          deposit_percent: 50,
          deposit_marked_paid_at: "2027-01-02T00:00:00Z",
          deposit_confirmed_received_at: null,
        }),
      ),
    ).toBe("confirmed");
  });

  // Done — only once everything owed is confirmed received.
  it("buckets a fully-confirmed-paid booking with no deposit as done", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          payment_status: "confirmed_paid",
        }),
      ),
    ).toBe("done");
  });

  it("does not reach done on full payment alone when a deposit was never confirmed", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          deposit_percent: 50,
          payment_status: "confirmed_paid",
        }),
      ),
    ).toBe("confirmed");
  });

  it("reaches done once both the deposit and the full payment are confirmed", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          deposit_percent: 50,
          deposit_confirmed_received_at: "2027-01-02T00:00:00Z",
          payment_status: "confirmed_paid",
        }),
      ),
    ).toBe("done");
  });

  it("does not auto-advance to done just because the event date has passed", () => {
    // Explicit product decision: accuracy over tidiness — see the function's
    // own doc comment.
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          date_iso: "2020-01-01",
          payment_status: "unpaid",
        }),
      ),
    ).toBe("confirmed");
  });

  it("treats the Stripe track's released status as fully paid too", () => {
    expect(
      pipelineStage(
        booking({
          status: "approved",
          contract_token: "tok",
          signed_at: "2027-01-01T00:00:00Z",
          payment_status: "released",
        }),
      ),
    ).toBe("done");
  });
});

describe("pipelineStats", () => {
  it("counts stages and sums unconfirmed deposits owed, excluding dead bookings", () => {
    const stats = pipelineStats([
      booking({ status: "pending" }), // inquiry
      booking({ status: "approved", contract_token: "t1" }), // awaiting_client
      booking({ status: "approved" }), // confirmed
      booking({
        status: "approved",
        contract_token: "t2",
        deposit_percent: 50,
        deposit_amount_cents: 50_000,
      }), // awaiting_client, deposit owed
      booking({ status: "rejected", contract_token: "t3", deposit_percent: 50, deposit_amount_cents: 99_999 }), // dead, excluded
    ]);
    expect(stats).toEqual({
      openInquiries: 1,
      awaitingClient: 2,
      depositsOwedCents: 50_000,
      confirmedEvents: 1,
    });
  });
});

describe("contractStatus", () => {
  const contract = (overrides: Partial<VendorBooking> = {}) =>
    booking({ contract_token: "tok", is_guest_booking: true, user_id: null, ...overrides });

  it("waits on a signature until signed, whether or not details are in", () => {
    expect(contractStatus(contract())).toBe("awaiting_signature");
    expect(contractStatus(contract({ guest_name: "Anjali Rao" }))).toBe("awaiting_signature");
  });

  it("is owed a deposit after signing when one is configured", () => {
    expect(
      contractStatus(
        contract({ guest_name: "A", signed_at: "2026-05-01T00:00:00Z", deposit_percent: 25 }),
      ),
    ).toBe("deposit_due");
  });

  it("hands the move to the vendor once the guest says the deposit is sent", () => {
    const status = contractStatus(
      contract({
        guest_name: "A",
        signed_at: "2026-05-01T00:00:00Z",
        deposit_percent: 25,
        deposit_marked_paid_at: "2026-05-02T00:00:00Z",
      }),
    );
    expect(status).toBe("confirm_deposit");
    expect(contractNeedsVendor(status)).toBe(true);
  });

  it("skips straight to the balance when there's no deposit", () => {
    expect(
      contractStatus(contract({ guest_name: "A", signed_at: "2026-05-01T00:00:00Z" })),
    ).toBe("balance_due");
  });

  it("asks the vendor to confirm a balance the guest marked paid", () => {
    expect(
      contractStatus(
        contract({
          guest_name: "A",
          signed_at: "2026-05-01T00:00:00Z",
          payment_status: "marked_paid",
        }),
      ),
    ).toBe("confirm_payment");
  });

  it("is paid exactly when the pipeline calls it done", () => {
    const b = contract({
      guest_name: "A",
      signed_at: "2026-05-01T00:00:00Z",
      deposit_percent: 25,
      deposit_confirmed_received_at: "2026-05-03T00:00:00Z",
      payment_status: "confirmed_paid",
    });
    expect(pipelineStage(b)).toBe("done");
    expect(contractStatus(b)).toBe("paid");
  });

  it("hands a draft or a lapsed offer back to the vendor", () => {
    const draft = contractStatus(contract({ contract_status: "draft" }));
    const expired = contractStatus(contract({ contract_status: "expired" }));
    expect([draft, expired]).toEqual(["draft", "expired"]);
    expect(contractNeedsVendor(draft)).toBe(true);
    expect(contractNeedsVendor(expired)).toBe(true);
    // Opened or not, a live offer is waiting on the client.
    expect(contractStatus(contract({ contract_status: "viewed" }))).toBe("awaiting_signature");
  });

  it("is the vendor's to sign once the client has, and booked only after (backend #34)", () => {
    const waiting = contractStatus(
      contract({ contract_status: "awaiting_vendor", client_signed_at: "2026-05-01T00:00:00Z", deposit_percent: 25 }),
    );
    expect(waiting).toBe("countersign");
    expect(contractNeedsVendor(waiting)).toBe(true);
    expect(
      contractStatus(
        contract({
          contract_status: "signed",
          client_signed_at: "2026-05-01T00:00:00Z",
          signed_at: "2026-05-02T00:00:00Z",
          deposit_percent: 25,
        }),
      ),
    ).toBe("deposit_due");
  });

  it("says declined rather than cancelled when the client turned it down", () => {
    expect(
      contractStatus(contract({ status: "rejected", contract_status: "declined" })),
    ).toBe("declined");
  });

  it("is cancelled when the booking is dead, whatever else is set", () => {
    expect(
      contractStatus(contract({ status: "cancelled", signed_at: "2026-05-01T00:00:00Z" })),
    ).toBe("cancelled");
  });
});

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const signed = (overrides: Partial<VendorBooking> = {}) =>
  booking({ contract_token: "t", signed_at: "2026-09-01T00:00:00Z", date_iso: isoInDays(30), ...overrides });

describe("bookingTab", () => {
  it("leaves anything not yet agreed to Leads", () => {
    expect(bookingTab(booking({ status: "pending" }))).toBeNull();
    expect(bookingTab(booking({ contract_token: "t", signed_at: null }))).toBeNull();
  });

  it("is Deposit due while a signed contract's deposit is unconfirmed", () => {
    expect(bookingTab(signed({ deposit_percent: 30, deposit_amount_cents: 30000 }))).toBe("deposit_due");
    expect(
      bookingTab(signed({ deposit_percent: 30, deposit_confirmed_received_at: "2026-09-02T00:00:00Z" })),
    ).toBe("confirmed");
  });

  it("treats an accepted marketplace booking with no deposit as Confirmed", () => {
    expect(bookingTab(booking({ status: "approved", date_iso: isoInDays(10) }))).toBe("confirmed");
  });

  it("puts every past event in Over, paid or not", () => {
    expect(bookingTab(signed({ date_iso: isoInDays(-3) }))).toBe("over");
    expect(bookingTab(signed({ date_iso: isoInDays(-3), payment_status: "confirmed_paid" }))).toBe("over");
    expect(bookingTab(booking({ status: "payment_confirmed", date_iso: isoInDays(-40) }))).toBe("over");
  });

  it("goes by the last day of a multi-day event", () => {
    expect(bookingTab(signed({ date_iso: isoInDays(-2), date_end: isoInDays(1) }))).toBe("confirmed");
  });

  it("labels an Over row Paid or Balance due", () => {
    expect(overPill(signed({ date_iso: isoInDays(-3) }))).toEqual({ label: "Balance due", paid: false });
    expect(overPill(signed({ date_iso: isoInDays(-3), payment_status: "confirmed_paid" }))).toEqual({
      label: "Paid",
      paid: true,
    });
  });

  it("ignores dead bookings", () => {
    expect(bookingTab(signed({ status: "cancelled" }))).toBeNull();
  });
});

describe("Overview money", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("counts installments confirmed this month, and legacy deposits", () => {
    const withSchedule = signed({
      payment_schedule: [
        { id: "i1", label: "Deposit", amount_cents: 50000, due_type: "on_signing", due_date: null, due_days: null, due_on: null, marked_paid_at: null, confirmed_at: "2026-10-03T10:00:00Z" },
        { id: "i2", label: "Balance", amount_cents: 70000, due_type: "on_signing", due_date: null, due_days: null, due_on: null, marked_paid_at: null, confirmed_at: "2026-09-20T10:00:00Z" },
      ],
    } as Partial<VendorBooking>);
    const legacy = signed({ deposit_amount_cents: 20000, deposit_confirmed_received_at: "2026-10-01T09:00:00Z" });
    expect(receivedThisMonthCents([withSchedule, legacy], now)).toBe(70000);
  });

  it("sums deposits still owed on agreed bookings", () => {
    const owed = signed({ deposit_percent: 30, deposit_amount_cents: 30000 });
    const paid = signed({ deposit_percent: 30, deposit_amount_cents: 30000, deposit_confirmed_received_at: "2026-09-02T00:00:00Z" });
    const unsigned = booking({ contract_token: "t", deposit_percent: 30, deposit_amount_cents: 99900 });
    expect(depositsOwedCents([owed, paid, unsigned])).toBe(30000);
  });
});

describe("upcomingBookings and countdownLabel", () => {
  it("lists agreed, dated, future bookings soonest first", () => {
    const later = signed({ booking_id: "later", date_iso: isoInDays(40) });
    const sooner = signed({ booking_id: "sooner", date_iso: isoInDays(5) });
    const past = signed({ booking_id: "past", date_iso: isoInDays(-5) });
    const lead = booking({ booking_id: "lead", status: "pending", date_iso: isoInDays(2) });
    expect(upcomingBookings([later, past, lead, sooner]).map((b) => b.booking_id)).toEqual(["sooner", "later"]);
  });

  it("reads like a person would say it", () => {
    expect(countdownLabel(isoInDays(0))).toBe("Today");
    expect(countdownLabel(isoInDays(1))).toBe("Tomorrow");
    expect(countdownLabel(isoInDays(4))).toBe("In 4 days");
    expect(countdownLabel(isoInDays(28))).toBe("In 4 weeks");
    expect(countdownLabel(isoInDays(-1))).toBeNull();
  });
});

describe("leadSummary", () => {
  it("counts unagreed bookings and open informal leads, and who's waiting on the vendor", () => {
    const summary = leadSummary(
      [
        booking({ booking_id: "req", status: "pending" }),
        booking({ booking_id: "offer", status: "negotiation_ongoing", negotiation_awaiting_role: "vendor" }),
        booking({ booking_id: "sent", contract_token: "t", signed_at: null }),
        signed({ booking_id: "booked" }),
      ],
      [
        { status: "new", converted_booking_id: null },
        { status: "contacted", converted_booking_id: null },
        { status: "won", converted_booking_id: "booked" },
      ],
    );
    expect(summary).toEqual({ open: 5, needReply: 3 });
  });
});

describe("bookingProgress", () => {
  it("walks the five steps from real fields", () => {
    expect(bookingProgress(booking({ contract_token: "t", contract_status: "draft", status: "approved" }))).toBe(0);
    expect(bookingProgress(booking({ contract_token: "t", contract_status: "sent", sent_at: "x" }))).toBe(1);
    expect(bookingProgress(signed({ deposit_percent: 30, deposit_amount_cents: 300 }))).toBe(2);
    expect(bookingProgress(signed())).toBe(3);
    expect(bookingProgress(signed({ date_iso: isoInDays(-2) }))).toBe(4);
    expect(bookingProgress(signed({ date_iso: isoInDays(-2), payment_status: "confirmed_paid" }))).toBe(5);
  });

  it("counts an accepted marketplace booking as signed", () => {
    expect(bookingProgress(booking({ status: "approved", date_iso: isoInDays(10) }))).toBe(3);
  });
});

describe("bookingMoney and paymentsToConfirm", () => {
  const inst = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
    id, label: id, amount_cents: amount, due_type: "on_signing", due_date: null, due_days: null,
    due_on: null, marked_paid_at: null, confirmed_at: null, ...extra,
  });

  it("reads a payment schedule", () => {
    const b = signed({
      amount_cents: 100000,
      payment_schedule: [inst("dep", 30000, { confirmed_at: "x" }), inst("bal", 70000, { marked_paid_at: "y" })],
    } as Partial<VendorBooking>);
    expect(bookingMoney(b)).toMatchObject({ totalCents: 100000, depositCents: 30000, depositPaid: true, balanceCents: 70000 });
    expect(paymentsToConfirm(b)).toEqual([{ kind: "installment", installmentId: "bal", label: "bal", amountCents: 70000 }]);
  });

  it("reads the legacy deposit and manual balance", () => {
    const b = signed({
      amount_cents: 100000,
      deposit_percent: 30,
      deposit_amount_cents: 30000,
      deposit_marked_paid_at: "x",
      payment_method: "manual",
    });
    expect(bookingMoney(b)).toMatchObject({ depositCents: 30000, depositPaid: false, balanceCents: 100000 });
    expect(paymentsToConfirm(b)).toEqual([{ kind: "deposit", amountCents: 30000 }]);
  });
  it("says when the rest is due from the contract's schedule, not a guess", () => {
    const bal = inst("Final balance", 90000, { due_type: "before_event", due_days: 14, due_on: "2030-05-31" });
    const b = signed({
      amount_cents: 170000,
      payment_schedule: [inst("Deposit", 80000, { confirmed_at: "x" }), bal],
    } as Partial<VendorBooking>);
    const m = bookingMoney(b);
    expect(m.balanceDue).toMatch(/^Due .*2030 \(14 days before the event\)$/);
    expect(m.balanceDue).not.toMatch(/after the event/);

    // The deposit has its own box: what's "remaining" starts after it (#170).
    const early = signed({ amount_cents: 170000, payment_schedule: [inst("Deposit", 80000), bal] } as Partial<VendorBooking>);
    expect(bookingMoney(early)).toMatchObject({ balanceCents: 90000, depositDue: "Due when signed" });
    expect(bookingMoney(early).balanceDue).toMatch(/^Due .*2030 \(14 days before the event\)$/);

    // Every payment confirmed: paid in full, whatever stage the booking is at.
    const done = signed({
      amount_cents: 170000,
      payment_schedule: [inst("Deposit", 80000, { confirmed_at: "x" }), { ...bal, confirmed_at: "y" }],
    } as Partial<VendorBooking>);
    expect(bookingMoney(done)).toMatchObject({ paidInFull: true, balanceDue: null, balanceCents: 0 });
  });

  it("has no due date to give without a schedule", () => {
    const b = signed({ amount_cents: 100000, deposit_percent: 30, deposit_amount_cents: 30000 });
    expect(bookingMoney(b).balanceDue).toBeNull();
  });
});


describe("canAttachDocument", () => {
  const b = (over: Partial<VendorBooking>) => ({ status: "approved", payment_status: "unpaid", ...over }) as VendorBooking;

  it("needs a contract to be signed, and a plain booking to be accepted", () => {
    expect(canAttachDocument(b({ contract_token: "t", signed_at: null }))).toBe(false);
    expect(canAttachDocument(b({ contract_token: "t", signed_at: "2030-01-01" }))).toBe(true);
    expect(canAttachDocument(b({ status: "pending" }))).toBe(false);
    expect(canAttachDocument(b({ status: "approved" }))).toBe(true);
  });

  it("never attaches to a voided or declined booking", () => {
    expect(canAttachDocument(b({ status: "rejected", contract_token: "t", signed_at: "x" }))).toBe(false);
  });
});


describe("whose move, and money that's late (#151, #170)", () => {
  const now = new Date("2030-06-01T12:00:00");
  const inst2 = (id: string, label: string, amount: number, extra: Record<string, unknown> = {}) => ({
    id, label, amount_cents: amount, due_type: "date" as const, due_date: null, due_days: null,
    due_on: null, marked_paid_at: null, confirmed_at: null, ...extra,
  });

  it("calls a contract with the client's changes waiting the vendor's turn", () => {
    const b = booking({
      contract_token: "t", contract_status: "viewed", status: "approved",
      negotiation: { turn: "vendor", round: 2, waiting_vendor: 4, waiting_client: 0 },
    } as Partial<VendorBooking>);
    expect(contractStatus(b)).toBe("changes_waiting");
    expect(contractNeedsVendor("changes_waiting")).toBe(true);
    expect(vendorTasks([b], null).map((t) => t.kind)).toContain("changes");
  });

  it("finds a payment past due, never before the day it was signed", () => {
    const b = booking({
      contract_token: "t", status: "approved", signed_at: "2030-05-20T00:00:00Z", date_iso: "2030-09-01",
      payment_schedule: [
        inst2("d", "Deposit", 1000, { due_type: "on_signing", due_on: "2030-05-20" }),
        inst2("b", "Balance", 2000, { due_on: "2030-05-10" }),
      ],
    } as Partial<VendorBooking>);
    expect(overdueInstallments(b, now).map((i) => i.id)).toEqual(["d", "b"]);
    const marked = { ...b, payment_schedule: b.payment_schedule!.map((i) => ({ ...i, marked_paid_at: "x" })) };
    expect(overdueInstallments(marked, now)).toEqual([]);
    expect(effectiveDue({ due_on: "2030-05-10" }, "2030-05-20T00:00:00Z")).toBe("2030-05-20");
  });

  it("puts paid in full before the event when the last payment is due before it", () => {
    const b = booking({
      contract_token: "t", status: "approved", signed_at: "2030-01-01T00:00:00Z", date_iso: "2030-09-01",
      payment_schedule: [inst2("d", "Deposit", 1000, { due_on: "2030-01-01" }), inst2("b", "Balance", 2000, { due_on: "2030-08-18" })],
    } as Partial<VendorBooking>);
    expect(bookingSteps(b)).toEqual(["Contract sent", "Contract signed", "Deposit paid", "Paid in full", "Event over"]);
    const delivery = { ...b, payment_schedule: [b.payment_schedule![0], { ...b.payment_schedule![1], due_on: "2030-10-01" }] };
    expect(bookingSteps(delivery).at(-1)).toBe("Payment received");
  });
});
