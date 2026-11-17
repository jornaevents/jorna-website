"use client";

// A date field with Jorna's own calendar, in place of the browser's date input
// (2026-11-17). The native picker looked different in every browser, and with
// its icon hidden some fields opened nothing at all on a click in Chrome.
//
// It stays a text field: a click opens the calendar, but a date can still be
// typed ("5/22/2027", "2027-05-22", "May 22 2027") and is read when it parses.
// The value in and out is an ISO day ("2027-05-22", or "" for none), the same
// string <input type="date"> gave, so callers keep their state as it was.
// Shown as "May 22, 2027".
//
// The calendar is positioned `fixed` against the field rather than inside it,
// so a scrolling drawer or dialog doesn't clip it; on a phone it's a sheet
// from the bottom. Escape closes the calendar without closing a dialog it's in.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

type Placement = { top: number; left: number; up: boolean; sheet: boolean };

/** Where the calendar goes for a field: under it, above it when there's no
 *  room below, or as a bottom sheet on a narrow screen. */
function measure(wrap: HTMLElement | null): Placement | null {
  const r = wrap?.querySelector("input")?.getBoundingClientRect();
  if (!r) return null;
  const sheet = window.innerWidth < 640;
  const height = 380;
  const up = r.bottom + height > window.innerHeight && r.top > height;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - 320 - 8));
  return { top: up ? r.top - 8 : r.bottom + 8, left, up, sheet };
}

// On a touchscreen the calendar is the way in; the on-screen keyboard
// popping up over it would only get in the way.
const COARSE = "(pointer: coarse)";
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia?.(COARSE);
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => Boolean(window.matchMedia?.(COARSE).matches),
    () => false,
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Day = { y: number; m: number; d: number }; // m is 0-based

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = ({ y, m, d }: Day) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** "2027-05-22" → its parts; null for anything else (including "TBD"). */
export function parseIsoDay(iso?: string | null): Day | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2] - 1;
  const d = +m[3];
  if (mo < 0 || mo > 11 || d < 1 || d > daysIn(y, mo)) return null;
  return { y, m: mo, d };
}

/** "May 22, 2027"; "" for no date. */
export function formatDay(iso?: string | null): string {
  const p = parseIsoDay(iso);
  return p ? `${SHORT_MONTHS[p.m]} ${p.d}, ${p.y}` : "";
}

/** What someone typed, read as a day: ISO, US numeric, or a month name. */
export function parseTyped(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const iso = parseIsoDay(t);
  if (iso) return toIso(iso);
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const day = { y, m: +m[1] - 1, d: +m[2] };
    return day.m >= 0 && day.m < 12 && day.d >= 1 && day.d <= daysIn(day.y, day.m) ? toIso(day) : null;
  }
  m = t.match(/^(?:[a-z]+,?\s+)?([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m) {
    const mo = SHORT_MONTHS.findIndex((s) => m![1].toLowerCase().startsWith(s.toLowerCase()));
    const day = { y: +m[3], m: mo, d: +m[2] };
    return mo >= 0 && day.d >= 1 && day.d <= daysIn(day.y, mo) ? toIso(day) : null;
  }
  return null;
}

function todayIso(): string {
  const n = new Date();
  return toIso({ y: n.getFullYear(), m: n.getMonth(), d: n.getDate() });
}

function addDays(iso: string, n: number): string {
  const p = parseIsoDay(iso)!;
  const d = new Date(p.y, p.m, p.d + n);
  return toIso({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
}

function addMonths(iso: string, n: number): string {
  const p = parseIsoDay(iso)!;
  const first = new Date(p.y, p.m + n, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  return toIso({ y, m, d: Math.min(p.d, daysIn(y, m)) });
}

/** Escape that closes the calendar mustn't also close a dialog it sits in.
 *  React's listeners and a dialog's (useOverlay) are both on `document` in
 *  this app, so stopping propagation isn't enough to stop the other. */
function swallow(e: { stopPropagation: () => void; nativeEvent: Event }) {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

const CalendarIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
    <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
  </svg>
);

const FIELD_CLASS =
  "w-full rounded-xl border border-card-edge bg-ground-2 py-2.5 pl-10 pr-3.5 text-ink outline-none transition placeholder:text-ink-faint focus:border-gold focus:ring-2 focus:ring-gold/30";

export interface DateFieldProps {
  /** Omit when the caller draws its own label; then pass aria-label. */
  label?: string;
  hint?: string;
  /** ISO day, or "" for none. */
  value: string;
  onChange: (iso: string) => void;
  /** ISO days; days outside are greyed out and can't be picked or typed. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  /** The other end of a date range, shaded between the two (e.g. on an end
   *  date's calendar, the start). */
  rangeWith?: string;
  /** Replaces the field's look, for forms with their own input style. The
   *  calendar icon is then left out. */
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

export function DateField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  placeholder = "Pick a date",
  id,
  rangeWith,
  className,
  ...aria
}: DateFieldProps) {
  const autoId = useId();
  const inputId = id ?? `date-${autoId}`;
  const popId = `${inputId}-calendar`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // While typing, the text is the person's own; otherwise it's the value, formatted.
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months">("days");
  // The day keyboard focus sits on in the grid, and the month shown.
  const [cursor, setCursor] = useState(() => value || todayIso());
  const [pos, setPos] = useState<Placement | null>(null);
  const coarse = useCoarsePointer();
  // Set when keyboard focus should land on the cursor day after this render.
  const focusDay = useRef(false);
  useLayoutEffect(() => {
    if (!focusDay.current) return;
    focusDay.current = false;
    popRef.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.focus();
  });

  const allowed = useCallback((iso: string) => (!min || iso >= min) && (!max || iso <= max), [min, max]);

  const openCalendar = useCallback(
    (focusGrid: boolean) => {
      if (disabled) return;
      const start = parseIsoDay(value) ? value : rangeWith && parseIsoDay(rangeWith) ? rangeWith : min && parseIsoDay(min) && min > todayIso() ? min : todayIso();
      setCursor(start);
      setView("days");
      setPos(measure(wrapRef.current));
      setOpen(true);
      focusDay.current = focusGrid;
    },
    [disabled, value, rangeWith, min],
  );

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) inputRef.current?.focus();
  }, []);

  function pick(iso: string) {
    if (!allowed(iso)) return;
    onChange(iso);
    setDraft(null);
    close(true);
  }

  // Kept in place against the field while anything scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const place = () => setPos(measure(wrapRef.current));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // A press anywhere outside the field and its calendar closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || (e.key === "Enter" && !open)) {
      e.preventDefault();
      openCalendar(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      swallow(e);
      close(false);
    }
  }

  function onGridKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
      Home: () => addDays(cursor, -new Date(parseIsoDay(cursor)!.y, parseIsoDay(cursor)!.m, parseIsoDay(cursor)!.d).getDay()),
      End: () => addDays(cursor, 6 - new Date(parseIsoDay(cursor)!.y, parseIsoDay(cursor)!.m, parseIsoDay(cursor)!.d).getDay()),
    };
    if (moves[e.key]) {
      e.preventDefault();
      const next = moves[e.key]();
      focusDay.current = true;
      setCursor(next);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      swallow(e);
      close(true);
    } else if (e.key === "Tab") {
      // Leaving the calendar by Tab puts focus back where it opened from.
      e.preventDefault();
      close(true);
    }
  }

  const shown = draft ?? formatDay(value);
  // Something typed that isn't a day this field can take.
  const typedWrong = draft !== null && draft.trim() !== "" && !(parseTyped(draft) && allowed(parseTyped(draft)!));
  const cur = parseIsoDay(cursor) ?? parseIsoDay(todayIso())!;
  const today = todayIso();
  const [lo, hi] = useMemo(() => {
    if (!rangeWith || !value || !parseIsoDay(rangeWith) || !parseIsoDay(value)) return [null, null];
    return rangeWith < value ? [rangeWith, value] : [value, rangeWith];
  }, [rangeWith, value]);

  const cells = useMemo(() => {
    const first = new Date(cur.y, cur.m, 1).getDay();
    const total = daysIn(cur.y, cur.m);
    const out: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= total; d++) out.push(toIso({ y: cur.y, m: cur.m, d }));
    while (out.length % 7) out.push(null);
    return out;
  }, [cur.y, cur.m]);

  const canPrev = !min || toIso({ y: cur.y, m: cur.m, d: 1 }) > min;
  const canNext = !max || toIso({ y: cur.y, m: cur.m, d: daysIn(cur.y, cur.m) }) < max;
  const navBtn =
    "grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-panel hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <div ref={wrapRef} className="block">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-soft">
          {label}
        </label>
      ) : null}
      <span className="relative block">
        {className ? null : (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">{CalendarIcon}</span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode={coarse ? "none" : "numeric"}
          autoComplete="off"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          value={shown}
          className={className ?? FIELD_CLASS}
          aria-invalid={typedWrong || undefined}
          {...aria}
          onClick={() => (open ? null : openCalendar(false))}
          onKeyDown={onInputKey}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            if (!text.trim()) {
              if (value) onChange("");
              return;
            }
            const iso = parseTyped(text);
            if (iso && allowed(iso) && iso !== value) {
              onChange(iso);
              setCursor(iso);
            }
          }}
          onBlur={() => setDraft(null)}
        />
      </span>
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}

      {open && pos ? (
        <>
          {pos.sheet ? <div className="fixed inset-0 z-[60] bg-black/30" aria-hidden="true" onClick={() => close(true)} /> : null}
          <div
            ref={popRef}
            id={popId}
            role="dialog"
            aria-modal={pos.sheet ? true : undefined}
            aria-label={`Choose ${label ?? aria["aria-label"] ?? "a date"}`}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                swallow(e);
                close(true);
              }
            }}
            style={
              pos.sheet
                ? undefined
                : { top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, left: pos.left }
            }
            className={`fixed z-[61] w-[320px] max-w-[calc(100vw-16px)] rounded-2xl border border-card-edge bg-card p-3 text-ink shadow-[0_18px_50px_-12px_rgba(67,27,24,0.35)] ${
              pos.sheet ? "inset-x-0 bottom-0 w-full max-w-none rounded-b-none pb-[max(16px,env(safe-area-inset-bottom))]" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <button type="button" className={navBtn} aria-label="Previous month" disabled={view === "days" ? !canPrev : false}
                onClick={() => setCursor(addMonths(cursor, view === "days" ? -1 : -12))}>
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                aria-live="polite"
                onClick={() => setView(view === "days" ? "months" : "days")}
                className="rounded-full px-3 py-1 font-serif text-[0.98rem] font-bold tracking-[-0.01em] text-ink transition hover:bg-panel"
              >
                {view === "days" ? `${MONTHS[cur.m]} ${cur.y}` : cur.y}
              </button>
              <button type="button" className={navBtn} aria-label="Next month" disabled={view === "days" ? !canNext : false}
                onClick={() => setCursor(addMonths(cursor, view === "days" ? 1 : 12))}>
                <Chevron dir="right" />
              </button>
            </div>

            {view === "months" ? (
              <div className="grid grid-cols-3 gap-1.5 p-1" role="group" aria-label={`Months of ${cur.y}`}>
                {SHORT_MONTHS.map((name, m) => {
                  const firstDay = toIso({ y: cur.y, m, d: 1 });
                  const lastDay = toIso({ y: cur.y, m, d: daysIn(cur.y, m) });
                  const out = (min && lastDay < min) || (max && firstDay > max);
                  const isCur = m === cur.m;
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={Boolean(out)}
                      onClick={() => {
                        setCursor(toIso({ y: cur.y, m, d: Math.min(cur.d, daysIn(cur.y, m)) }));
                        setView("days");
                      }}
                      className={`rounded-xl py-3 text-sm font-semibold transition disabled:opacity-30 ${
                        isCur ? "bg-maroon text-ground dark:bg-gold dark:text-ground" : "text-ink hover:bg-panel"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div role="grid" aria-label={`${MONTHS[cur.m]} ${cur.y}`} onKeyDown={onGridKey}>
                <div role="row" className="grid grid-cols-7 pb-1">
                  {WEEKDAYS.map((w) => (
                    <span key={w} role="columnheader" className="text-center text-[0.66rem] font-bold uppercase tracking-[0.08em] text-ink-faint">
                      {w}
                    </span>
                  ))}
                </div>
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                  <div key={row} role="row" className="grid grid-cols-7">
                    {cells.slice(row * 7, row * 7 + 7).map((iso, i) => {
                      if (!iso) return <span key={`e${i}`} role="gridcell" />;
                      const ok = allowed(iso);
                      const selected = iso === value;
                      const isToday = iso === today;
                      const inRange = lo && hi && iso > lo && iso < hi;
                      const isEnd = (lo && iso === lo) || (hi && iso === hi);
                      const d = parseIsoDay(iso)!;
                      return (
                        <span key={iso} role="gridcell" aria-selected={selected} className={`grid place-items-center py-0.5 ${inRange ? "bg-gold/15" : ""}`}>
                          <button
                            type="button"
                            tabIndex={iso === cursor ? 0 : -1}
                            data-cursor={iso === cursor}
                            disabled={!ok}
                            aria-label={`${WEEKDAYS_LONG[new Date(d.y, d.m, d.d).getDay()]}, ${MONTHS[d.m]} ${d.d}, ${d.y}${isToday ? " (today)" : ""}`}
                            aria-current={isToday ? "date" : undefined}
                            onClick={() => pick(iso)}
                            className={`grid size-10 place-items-center rounded-full text-sm tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-40 ${
                              selected || isEnd
                                ? "bg-maroon font-bold text-ground dark:bg-gold dark:text-ground"
                                : isToday
                                  ? "font-bold text-maroon ring-1 ring-gold dark:text-gold"
                                  : "text-ink hover:bg-panel"
                            }`}
                          >
                            {d.d}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line-soft px-1 pt-2">
              <button
                type="button"
                disabled={!allowed(today)}
                onClick={() => pick(today)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-gold transition hover:bg-panel disabled:opacity-30"
              >
                Today
              </button>
              {value && !required ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close(true);
                  }}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-soft transition hover:bg-panel"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
