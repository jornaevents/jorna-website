import { describe, expect, it } from "vitest";
import { agreedInChat, agreedPrefill, type AgreedMessage } from "./agreedInChat";

let n = 0;
const at = () => `2026-11-${String(10 + n++).padStart(2, "0")}T12:00:00Z`;
const proposal = (field: string, value: string, status = "agreed", extra: object = {}): AgreedMessage => ({
  message_id: `p${n}`, created_at: at(), kind: "detail_proposal",
  meta: { field, value, label: value, status, proposed_by: "c", ...extra },
});
const inquiry = (fields: object): AgreedMessage => ({ message_id: `i${n}`, created_at: at(), kind: "text", meta: { inquiry: fields } });
const fields = (ms: AgreedMessage[]) => agreedInChat(ms).map((a) => `${a.meta.field}=${a.meta.value}`);

describe("agreedInChat", () => {
  it("keeps the latest agreed value per field and skips open or declined ones", () => {
    expect(
      fields([proposal("guests", "150"), proposal("guests", "180"), proposal("date", "2027-03-14", "declined"), proposal("times", "16:00-22:00", "open")]),
    ).toEqual(["guests=180"]);
  });

  it("an inquiry sent after drops what it changed and keeps what it matched or left out", () => {
    const ms = [
      proposal("guests", "150"),
      proposal("date", "2027-03-14"),
      proposal("times", "16:00-22:00"),
      proposal("addon", "ao-1"),
      inquiry({ guest_count: 200, event_date_iso: "2027-03-14", time_start: null, time_end: null }),
    ];
    expect(fields(ms)).toEqual(["date=2027-03-14", "times=16:00-22:00", "addon=ao-1"]);
  });

  it("an agreement after the inquiry stands", () => {
    expect(fields([inquiry({ guest_count: 200 }), proposal("guests", "150")])).toEqual(["guests=150"]);
  });

  it("a price stands unless the inquiry asks about another package", () => {
    const price = proposal("price", "2400", "agreed", { unit: "event", package: { service_id: "svc-1", name: "DJ set" } });
    expect(fields([price, inquiry({ service_id: "svc-1" })])).toEqual(["price=2400"]);
    expect(fields([price, inquiry({ service_id: "svc-2" })])).toEqual([]);
  });
});

describe("agreedPrefill", () => {
  it("fills the inquiry's fields, and the package an agreed price was for", () => {
    const ms = [
      proposal("date", "2027-03-14"),
      proposal("times", "16:00-22:30"),
      proposal("guests", "150"),
      proposal("price", "2400", "agreed", { unit: "event", package: { service_id: "svc-1", name: "DJ set" } }),
    ];
    expect(agreedPrefill(ms, "2026-11-22")).toEqual({ date: "2027-03-14", timeStart: "16:00", timeEnd: "22:30", guests: 150, serviceId: "svc-1" });
  });

  it("leaves out a date that has passed, and is null with nothing agreed", () => {
    expect(agreedPrefill([proposal("date", "2026-01-01")], "2026-11-22")).toBeNull();
    expect(agreedPrefill([proposal("guests", "150", "open")], "2026-11-22")).toBeNull();
  });
});
