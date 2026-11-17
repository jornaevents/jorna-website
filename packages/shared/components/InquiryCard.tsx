"use client";

import Link from "next/link";

/** What an inquiry message carries (backend DECISIONS #52), on `meta.inquiry`. */
export interface InquiryMeta {
  lead_id: string;
  service_id?: string | null;
  service_name?: string | null;
  event_type?: string | null;
  event_date_iso?: string | null;
  event_location?: string | null;
  guest_count?: number | null;
  note?: string | null;
}

function dateLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/**
 * An inquiry from the form, drawn as a card in the thread: the package asked
 * about, the rest as a list, then the client's note. `leadHref` is the
 * vendor's way into the lead; the client's own copy has none. The message's
 * text still says all of it, for builds that don't know this card.
 */
export function InquiryCard({ inquiry, mine, leadHref }: { inquiry: InquiryMeta; mine: boolean; leadHref?: string }) {
  const rows: [string, string | null][] = [
    ["Package", inquiry.service_name ?? null],
    ["Event", inquiry.event_type ?? null],
    ["Date", dateLabel(inquiry.event_date_iso)],
    ["Where", inquiry.event_location ?? null],
    ["Guests", inquiry.guest_count ? `About ${inquiry.guest_count.toLocaleString()}` : null],
  ];
  return (
    <div className="w-[min(360px,85vw)] rounded-2xl border border-card-edge bg-card p-4">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">
        {mine ? "Your inquiry" : "New inquiry"}
      </p>
      <ul className="mt-2 grid gap-1 text-sm">
        {rows
          .filter((r): r is [string, string] => Boolean(r[1]))
          .map(([label, value]) => (
            <li key={label} className="flex gap-2">
              <span aria-hidden="true" className="text-gold">•</span>
              <span>
                <span className="text-ink-faint">{label}:</span> <span className="text-ink">{value}</span>
              </span>
            </li>
          ))}
      </ul>
      {inquiry.note ? (
        <p className="mt-3 whitespace-pre-wrap border-l-2 border-line pl-3 text-sm text-ink-soft">{inquiry.note}</p>
      ) : null}
      {leadHref ? (
        <Link
          href={leadHref}
          className="mt-3 inline-flex items-center rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-white hover:brightness-110 dark:bg-gold dark:text-[#2A0C19]"
        >
          View lead
        </Link>
      ) : null}
    </div>
  );
}
