"use client";

// Plan a new event, step by step (Jorna-Client design; client redesign PR 3):
// what it is, when and where, how big, and which vendors it needs. It replaces
// the one-screen form My Events had. Nothing is saved until the last step, so
// closing it leaves nothing behind.
//
// "Create and suggest vendors" goes on to the bundle builder for the new
// event — the suggestions step of the redesign (PR 5) takes that over.

import { useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Button } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { createEvent } from "@/lib/jorna";
import { CATEGORY_LABELS, categoryLabel, type EventItem } from "@/lib/types";

const TYPES = ["Wedding", "Birthday", "Sangeet", "Mehndi", "Baby shower", "Pooja", "Anniversary", "Other"];
const STEPS = ["Event", "Date & place", "Guests & budget", "Vendors"];
const INTRO = [
  { eyebrow: "The basics", title: "What are you celebrating?", lede: "Give your event a type and a name." },
  { eyebrow: "Date & place", title: "When and where?", lede: "Most events are one day. Add an end date only if you need one." },
  { eyebrow: "Size & spend", title: "How big should it feel?", lede: "Estimates are perfect. These help keep vendor suggestions realistic." },
  { eyebrow: "Vendor team", title: "Who should be part of it?", lede: "Choose the vendor categories you'll need. Jorna can help fill them next." },
];

const control = "grid gap-1.5 rounded-xl border border-line bg-card px-4 py-3 text-sm focus-within:border-gold";
const controlLabel = "text-[0.72rem] font-semibold text-ink-soft";
const input = "w-full bg-transparent text-ink outline-none placeholder:text-ink-faint";

export function EventBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** `suggest` when the client asked to go on to vendor suggestions. */
  onCreated: (event: EventItem, suggest: boolean) => void;
}) {
  const ref = useOverlay<HTMLElement>(true, onClose);
  const [step, setStep] = useState(0);
  const [type, setType] = useState("");
  const [otherType, setOtherType] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [city, setCity] = useState("");
  const [guests, setGuests] = useState(150);
  const [budget, setBudget] = useState(20000);
  const [needed, setNeeded] = useState<string[]>([]);
  const [busy, setBusy] = useState<"create" | "suggest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eventType = type === "Other" ? otherType.trim() : type;
  const basics = Boolean(eventType && name.trim());
  const endOk = !multiDay || !end || end >= start;
  const where = Boolean(start && city.trim() && endOk);
  const valid = step === 0 ? basics : step === 1 ? where : true;

  async function create(suggest: boolean) {
    setBusy(suggest ? "suggest" : "create");
    setError(null);
    try {
      const event = await createEvent({
        name: name.trim(),
        event_type: eventType,
        date_iso: start,
        date_end: multiDay && end && end !== start ? end : null,
        location: city.trim(),
        guest_count: guests,
        budget,
        services_needed: needed.length > 0 ? needed : null,
      });
      onCreated(event, suggest);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that event.");
      setBusy(null);
    }
  }

  const intro = INTRO[step];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 desk:p-6">
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-builder-title"
        tabIndex={-1}
        className="grid h-full w-full overflow-hidden bg-ground outline-none desk:h-[min(680px,100%)] desk:max-w-[980px] desk:grid-cols-[280px_minmax(0,1fr)] desk:rounded-[20px] desk:shadow-[0_24px_80px_rgba(67,27,24,0.25)]"
      >
        <aside className="hidden flex-col gap-8 bg-panel p-8 desk:flex">
          <div>
            <p className="eyebrow">Plan an event</p>
            <h2 className="mt-3 font-serif text-xl font-bold tracking-[-0.02em] text-ink">Your celebration, step by step</h2>
            <p className="mt-2 text-sm text-ink-soft">Keep it simple now. Everything can change later.</p>
          </div>
          <ol className="grid gap-1">
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                    i === step ? "bg-card text-ink" : i < step ? "text-ink-soft" : "text-ink-faint"
                  }`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-[0.7rem] ${
                      i < step ? "bg-green text-white" : i === step ? "bg-maroon text-white" : "border border-line"
                    }`}
                  >
                    {i < step ? "✓" : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="flex min-h-0 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <button
              type="button"
              onClick={() => (step ? setStep(step - 1) : onClose())}
              aria-label={step ? "Previous step" : "Close event planner"}
              className="grid size-9 place-items-center rounded-full border border-line text-ink-soft"
            >
              ←
            </button>
            <div className="text-center text-sm">
              <span className="block text-[0.72rem] text-ink-soft">
                {step + 1} of {STEPS.length}
              </span>
              <strong className="font-serif text-ink">{STEPS[step]}</strong>
            </div>
            <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-soft hover:text-ink">
              Close
            </button>
          </header>
          <div className="h-[3px] bg-panel">
            <div className="h-full bg-gold transition-[width]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 desk:px-10">
            <p className="eyebrow">{intro.eyebrow}</p>
            <h1 id="event-builder-title" className="mt-3 font-serif text-[1.9rem] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
              {intro.title}
            </h1>
            <p className="mt-2 text-ink-soft">{intro.lede}</p>

            <div className="mt-6 grid max-w-[520px] gap-3">
              {step === 0 ? (
                <>
                  <label className={control}>
                    <span className={controlLabel}>Event type</span>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
                      <option value="" disabled>
                        Choose an event
                      </option>
                      {TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  {type === "Other" ? (
                    <label className={control}>
                      <span className={controlLabel}>What kind of event?</span>
                      <input value={otherType} onChange={(e) => setOtherType(e.target.value)} placeholder="Type your event" className={input} />
                    </label>
                  ) : null}
                  <label className={control}>
                    <span className={controlLabel}>Event name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya & Arjun's Wedding" className={input} />
                  </label>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <div className={`grid gap-3 ${multiDay ? "sm:grid-cols-2" : ""}`}>
                    <label className={control}>
                      <span className={controlLabel}>{multiDay ? "Starts" : "Event date"}</span>
                      <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={input} />
                    </label>
                    {multiDay ? (
                      <label className={control}>
                        <span className={controlLabel}>Ends</span>
                        <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={input} />
                      </label>
                    ) : null}
                  </div>
                  {!endOk ? <p className="text-sm text-maroon">The end date is before the start date.</p> : null}
                  <button
                    type="button"
                    onClick={() => setMultiDay(!multiDay)}
                    className="justify-self-start text-sm font-semibold text-gold hover:underline"
                  >
                    {multiDay ? "Make this a one-day event" : "+ Add end date, for multi-day events"}
                  </button>
                  <CityCombobox label="City" placeholder="Edison, NJ" value={city} onChange={(v) => setCity(v)} />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <label className={control}>
                    <span className="flex items-baseline justify-between">
                      <span className={controlLabel}>Guest estimate</span>
                      <strong className="font-serif text-ink">{guests.toLocaleString()} guests</strong>
                    </span>
                    <input type="range" min={10} max={1000} step={10} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="accent-maroon" />
                  </label>
                  <label className={control}>
                    <span className="flex items-baseline justify-between">
                      <span className={controlLabel}>Budget</span>
                      <strong className="font-serif text-ink">${budget.toLocaleString()}</strong>
                    </span>
                    <input type="range" min={1000} max={100000} step={1000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="accent-maroon" />
                  </label>
                </>
              ) : null}

              {step === 3 ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {Object.keys(CATEGORY_LABELS).map((c) => {
                    const on = needed.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setNeeded(on ? needed.filter((v) => v !== c) : [...needed, c])}
                        className={`flex min-h-[52px] items-center justify-between gap-2 rounded-xl border px-3.5 text-left text-sm font-semibold ${
                          on ? "border-gold bg-gold/10 text-ink" : "border-line bg-card text-ink-soft"
                        }`}
                      >
                        {categoryLabel(c)}
                        {on ? <span aria-hidden="true">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="mt-4 max-w-[520px] rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 desk:px-10">
            <span className="text-[0.8rem] text-ink-soft">
              {step < STEPS.length - 1
                ? "You can come back and change this."
                : `${needed.length} vendor ${needed.length === 1 ? "category" : "categories"} selected`}
            </span>
            <div className="flex flex-wrap gap-2">
              {step > 0 ? (
                <Button variant="ghost" type="button" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <Button type="button" disabled={!valid} onClick={() => setStep(step + 1)}>
                  Continue
                </Button>
              ) : (
                <>
                  <Button variant="ghost" type="button" disabled={busy !== null} onClick={() => create(false)}>
                    {busy === "create" ? "Creating…" : "Create event"}
                  </Button>
                  <Button type="button" disabled={busy !== null || needed.length === 0} onClick={() => create(true)}>
                    {busy === "suggest" ? "Creating…" : "Create and suggest vendors"}
                  </Button>
                </>
              )}
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
