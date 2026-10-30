import { describe, expect, it } from "vitest";
import {
  bookingStage,
  centsMoney,
  contractSignUrl,
  contractStep,
  describePayment,
  nextPayment,
  paymentRows,
  utcToday,
  type PaymentRow,
} from "./contract";
import type { BundleBooking, Installment } from "./types";

const booking = (over: Partial<BundleBooking> = {}) =>
  ({ booking_id: "b", status: "approved", contract_token: "tok", contract_status: "sent", signed_at: null, ...over }) as BundleBooking;

describe("contractStep", () => {
  it("asks for a signature while the proposal is out", () => {
    expect(contractStep(booking())).toBe("sign");
    expect(contractStep(booking({ contract_status: "viewed" }))).toBe("sign");
  });

  it("says when it lapsed unsigned", () => {
    expect(contractStep(booking({ contract_status: "expired" }))).toBe("expired");
  });

  it("has nothing to ask once signed, or with no contract at all", () => {
    expect(contractStep(booking({ signed_at: "2030-01-01T00:00:00" }))).toBeNull();
    expect(contractStep(booking({ contract_token: null, contract_status: null }))).toBeNull();
    expect(contractStep(booking({ contract_status: "voided" }))).toBeNull();
  });
});

const installment = (over: Partial<Installment> = {}): Installment => ({
  id: "i",
  label: "Deposit",
  amount_cents: 30_000,
  due_type: "on_signing",
  effective_due: "2030-03-10",
  marked_paid_at: null,
  confirmed_at: null,
  ...over,
});

describe("paymentRows", () => {
  const signed = (schedule: Installment[]) =>
    booking({ contract_status: "signed", signed_at: "2030-03-01T00:00:00+00:00", payment_schedule: schedule });

  it("says where each payment stands, by the UTC day", () => {
    const rows = paymentRows(
      signed([
        installment({ id: "a", confirmed_at: "2030-03-02T00:00:00+00:00", marked_paid_at: "2030-03-01T00:00:00+00:00" }),
        installment({ id: "b", marked_paid_at: "2030-03-02T00:00:00+00:00" }),
        installment({ id: "c", effective_due: "2030-03-09" }),
        installment({ id: "d", effective_due: "2030-03-10" }),
        installment({ id: "e", effective_due: "2030-04-01" }),
      ]),
      "2030-03-10",
    );
    expect(rows.map((r) => r.state)).toEqual(["received", "sent", "overdue", "due", "upcoming"]);
  });

  it("owes nothing before signing, or without a schedule", () => {
    expect(paymentRows(booking({ payment_schedule: [installment()] }), "2030-03-10")).toEqual([]);
    expect(paymentRows(booking({ signed_at: "2030-03-01T00:00:00", payment_schedule: null }), "2030-03-10")).toEqual([]);
  });

  it("finds the next payment still to send", () => {
    const b = signed([
      installment({ id: "a", marked_paid_at: "2030-03-02T00:00:00+00:00" }),
      installment({ id: "b", label: "Balance", effective_due: "2030-05-01" }),
    ]);
    expect(nextPayment(b, "2030-03-10")?.installment.id).toBe("b");
    expect(nextPayment(signed([installment({ marked_paid_at: "x" })]), "2030-03-10")).toBeNull();
  });
});

describe("describePayment", () => {
  it("names the vendor while waiting on them, and the day otherwise", () => {
    const row = (state: PaymentRow["state"], due: string | null = "2030-03-10") =>
      ({ installment: installment(), state, due }) as PaymentRow;
    expect(describePayment(row("sent"), "DJ Rav")).toBe("Sent — waiting for DJ Rav to confirm");
    expect(describePayment(row("received"), "DJ Rav")).toBe("Received by DJ Rav");
    expect(describePayment(row("due"), "DJ Rav")).toBe("Due today");
    expect(describePayment(row("upcoming"), "DJ Rav")).toMatch(/^Due /);
    expect(describePayment(row("overdue"), "DJ Rav")).toMatch(/^Was due /);
  });
});

describe("centsMoney", () => {
  it("shows cents only when there are some", () => {
    expect(centsMoney(100_000)).toBe("$1,000");
    expect(centsMoney(133_333)).toBe("$1,333.33");
  });
});

describe("utcToday", () => {
  it("is the UTC calendar day, not the local one", () => {
    expect(utcToday(new Date("2030-03-10T23:30:00-05:00"))).toBe("2030-03-11");
  });
});

describe("contractSignUrl", () => {
  it("points at the vendor site's signing page", () => {
    expect(contractSignUrl("a b")).toBe("https://jornaevents.com/app/booking-link/?t=a%20b");
  });
});

describe("bookingStage", () => {
  const future = "2099-06-01";
  const past = "2020-06-01";
  const inst = (over: Partial<Installment> = {}) =>
    ({ id: "i", label: "Deposit", amount_cents: 1000, confirmed_at: null, ...over }) as Installment;

  it("is Requested until the vendor answers", () => {
    expect(bookingStage(booking({ status: "pending", contract_token: null, contract_status: null }))).toBe(
      "requested",
    );
  });

  it("waits on the vendor once the client has signed, with nothing to pay yet (backend #34)", () => {
    const waiting = booking({ contract_status: "awaiting_vendor", client_signed_at: "2026-05-01T00:00:00Z" });
    expect(bookingStage(waiting)).toBe("awaiting_vendor");
    expect(contractStep(waiting)).toBe("awaiting_vendor");
    expect(paymentRows({ ...waiting, payment_schedule: [inst()] })).toEqual([]);
  });

  it("is Contract to review while a sent contract is unsigned", () => {
    expect(bookingStage(booking())).toBe("contract_to_review");
    expect(bookingStage(booking({ contract_status: "viewed" }))).toBe("contract_to_review");
    expect(bookingStage(booking({ contract_status: "expired" }))).toBeNull();
    expect(bookingStage(booking({ contract_status: "voided" }))).toBeNull();
  });

  it("says where a negotiation stands while the contract is unsigned", () => {
    expect(bookingStage(booking({ proposal_status: "open" }))).toBe("changes_proposed");
    expect(bookingStage(booking({ contract_status: "viewed", proposal_status: "accepted" }))).toBe("new_version");
    expect(bookingStage(booking({ proposal_status: "revised" }))).toBe("new_version");
    // Declined or withdrawn: the version on the table is the one they had.
    expect(bookingStage(booking({ proposal_status: "declined" }))).toBe("contract_to_review");
    expect(bookingStage(booking({ proposal_status: "withdrawn" }))).toBe("contract_to_review");
    // An expired offer isn't negotiable whatever the proposal says.
    expect(bookingStage(booking({ contract_status: "expired", proposal_status: "open" }))).toBeNull();
  });

  it("is Deposit due on a signed contract until the first payment is confirmed", () => {
    const signed = { signed_at: "2030-01-01T00:00:00", contract_status: "signed" as const, date_iso: future };
    expect(bookingStage(booking({ ...signed, payment_schedule: [inst(), inst({ id: "j" })] }))).toBe(
      "deposit_due",
    );
    expect(
      bookingStage(
        booking({
          ...signed,
          payment_schedule: [inst({ confirmed_at: "2030-01-02T00:00:00" }), inst({ id: "j" })],
        }),
      ),
    ).toBe("confirmed");
  });

  it("has no deposit step for a single payment", () => {
    expect(
      bookingStage(booking({ signed_at: "2030-01-01T00:00:00", date_iso: future, payment_schedule: [inst()] })),
    ).toBe("confirmed");
  });

  it("is Completed once the event has passed, paid or not", () => {
    expect(
      bookingStage(booking({ signed_at: "2019-01-01T00:00:00", date_iso: past, payment_schedule: [inst(), inst()] })),
    ).toBe("completed");
  });

  it("leaves declined requests and pre-contract bookings to the caller", () => {
    expect(bookingStage(booking({ status: "rejected", contract_token: null }))).toBeNull();
    expect(bookingStage(booking({ status: "approved", contract_token: null, contract_status: null }))).toBeNull();
  });
});
