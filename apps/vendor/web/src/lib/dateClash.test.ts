import { describe, expect, it } from "vitest";
import { clashWith, type ClashSource } from "./dateClash";

const now = new Date("2030-01-01T12:00:00Z");
const booking = (over: Partial<ClashSource> = {}): ClashSource => ({
  booking_id: "b1",
  status: "approved",
  contract_token: "tok",
  signed_at: "2029-12-01T00:00:00Z",
  date_iso: "2030-06-25",
  time_start: "18:00",
  time_end: "22:00",
  ...over,
});

describe("clashWith", () => {
  it("finds a signed booking on the same day when the hours overlap", () => {
    expect(clashWith([booking()], { dateIso: "2030-06-25", timeStart: "20:00", timeEnd: "23:00" }, { now })?.booking_id).toBe("b1");
  });

  it("lets a morning job sit beside an evening one", () => {
    expect(clashWith([booking()], { dateIso: "2030-06-25", timeStart: "09:00", timeEnd: "13:00" }, { now })).toBeNull();
  });

  it("counts whole days for a multi-day booking, and unknown hours as a clash", () => {
    expect(clashWith([booking({ date_end: "2030-06-27" })], { dateIso: "2030-06-26", timeStart: "09:00", timeEnd: "10:00" }, { now })).not.toBeNull();
    expect(clashWith([booking()], { dateIso: "2030-06-25" }, { now })).not.toBeNull();
  });

  it("ignores drafts, lapsed holds, declined requests and the contract being edited", () => {
    const draft = booking({ signed_at: null, contract_status: "draft" });
    const lapsed = booking({ signed_at: null, contract_status: "sent", hold_expires_at: "2029-12-30T00:00:00Z" });
    const declined = booking({ status: "rejected" });
    const wanted = { dateIso: "2030-06-25", timeStart: "18:00", timeEnd: "22:00" };
    expect(clashWith([draft, lapsed, declined], wanted, { now })).toBeNull();
    expect(clashWith([booking()], wanted, { now, exclude: "b1" })).toBeNull();
  });

  it("counts a contract still holding its date", () => {
    const holding = booking({ signed_at: null, contract_status: "viewed", hold_expires_at: "2030-01-05T00:00:00Z" });
    expect(clashWith([holding], { dateIso: "2030-06-25", timeStart: "18:00", timeEnd: "22:00" }, { now })).not.toBeNull();
  });
});
