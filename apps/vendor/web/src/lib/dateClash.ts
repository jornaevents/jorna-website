// Whether a date the vendor is writing a contract for is already taken by
// one of their own bookings — so the editor can say so when the date is
// picked, not as a 409 after Send (web #166). The backend has the last word;
// this mirrors its rule (booking_service.commits_vendor_date and
// booking_blocks) so the two don't disagree:
//
// - a booking takes the date when it's approved or paid, and either isn't a
//   contract, is signed, or is a contract still out with its hold running;
// - dates collide by whole days, except two single-day bookings on the same
//   day, where the hours decide (an end at or before the start runs past
//   midnight). Unknown hours count as a clash.

export interface ClashSource {
  booking_id: string;
  status: string;
  contract_token?: string | null;
  signed_at?: string | null;
  contract_status?: string | null;
  hold_expires_at?: string | null;
  date_iso?: string | null;
  date_end?: string | null;
  time_start?: string | null;
  time_end?: string | null;
}

export interface Wanted {
  dateIso: string;
  dateEnd?: string | null;
  timeStart?: string | null;
  timeEnd?: string | null;
}

function takesDate(b: ClashSource, now: Date): boolean {
  if (b.status !== "approved" && b.status !== "payment_confirmed") return false;
  if (!b.contract_token || b.signed_at) return true;
  return (
    (b.contract_status === "sent" || b.contract_status === "viewed") &&
    Boolean(b.hold_expires_at) &&
    new Date(b.hold_expires_at!) > now
  );
}

function minutes(hhmm?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function span(start?: string | null, end?: string | null): [number, number] | null {
  const s = minutes(start);
  let e = minutes(end);
  if (s === null || e === null) return null;
  if (e <= s) e += 24 * 60;
  return [s, e];
}

const single = (start: string, end?: string | null) => !end || end === start;

/** The first of `bookings` that already takes the wanted dates and hours. */
export function clashWith<T extends ClashSource>(
  bookings: T[],
  wanted: Wanted,
  { exclude, now = new Date() }: { exclude?: string | null; now?: Date } = {},
): T | null {
  if (!wanted.dateIso) return null;
  const wantEnd = wanted.dateEnd || wanted.dateIso;
  for (const b of bookings) {
    if (b.booking_id === exclude || !b.date_iso || b.date_iso === "TBD" || !takesDate(b, now)) continue;
    const start = b.date_iso;
    const end = b.date_end || start;
    if (start > wantEnd || end < wanted.dateIso) continue;
    if (!(single(wanted.dateIso, wanted.dateEnd) && single(start, b.date_end) && start === wanted.dateIso)) {
      return b;
    }
    const mine = span(wanted.timeStart, wanted.timeEnd);
    const theirs = span(b.time_start, b.time_end);
    if (!mine || !theirs || (mine[0] < theirs[1] && theirs[0] < mine[1])) return b;
  }
  return null;
}
