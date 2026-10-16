"use client";

// The first screen of a new contract (backend DECISIONS #31): which
// package's template to start from, one of the vendor's own templates, or
// scratch on their usual terms. Every way into /contracts/new lands here —
// the New menu, the Contracts page, a lead, a request — unless the link
// already says which.

import Link from "next/link";
import { money } from "@jorna/shared/lib/contractDraft";
import type { TemplateChoice } from "@/lib/templateChoices";

export type Pick = { package: string } | { template: string } | { scratch: true };

function Card({
  title,
  note,
  tag,
  highlight,
  onClick,
}: {
  title: string;
  note: string;
  tag?: string | null;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid gap-1 rounded-xl border bg-card px-4 py-3.5 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-gold ${
        highlight ? "border-gold ring-2 ring-gold/30" : "border-card-edge"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <strong className="truncate text-sm text-ink">{title}</strong>
        {tag ? (
          <span className="shrink-0 rounded-[6px] bg-gold/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.06em] text-gold">
            {tag}
          </span>
        ) : null}
      </span>
      <small className="text-xs text-ink-faint">{note}</small>
    </button>
  );
}

export function TemplatePicker({
  packages,
  saved,
  requested,
  heading,
  backHref,
  backLabel,
  onPick,
}: {
  packages: TemplateChoice[];
  saved: TemplateChoice[];
  /** Answering a request: the package the client asked for, which comes first. */
  requested?: { serviceId: string | null; clientName: string | null } | null;
  heading: string;
  backHref: string;
  backLabel: string;
  onPick: (pick: Pick) => void;
}) {
  const ordered = requested?.serviceId
    ? [
        ...packages.filter((p) => p.serviceId === requested.serviceId),
        ...packages.filter((p) => p.serviceId !== requested.serviceId),
      ]
    : packages;

  return (
    <div className="mx-auto w-[min(760px,100%)]">
      <Link href={backHref} className="eyebrow hover:text-gold">
        ← {backLabel}
      </Link>
      <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">{heading}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        {requested
          ? `${requested.clientName || "Your client"} asked for the package marked below. Their date, venue and times come with the request whichever you pick.`
          : "Start from a package and its contract fills in. You can change anything before you send it."}
      </p>

      <section aria-label="Your packages" className="mt-6">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Your packages</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ordered.map((p) => (
            <Card
              key={p.id}
              title={p.name}
              note={
                p.edited
                  ? "Your edited template"
                  : `${p.price != null ? money(Math.round(p.price * 100)) : "Package"} · fills in from the package`
              }
              tag={requested?.serviceId === p.serviceId ? "Requested" : p.edited ? "Edited" : null}
              highlight={requested?.serviceId === p.serviceId}
              onClick={() => onPick({ package: p.serviceId! })}
            />
          ))}
        </div>
      </section>

      {saved.length ? (
        <section aria-label="Your templates" className="mt-6">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Your templates</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {saved.map((t) => (
              <Card key={t.id} title={t.name} note="Saved template" onClick={() => onPick({ template: t.templateId! })} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Start from scratch" className="mt-6">
        <Card
          title="Start from scratch"
          note={requested ? "The request's package and your usual terms" : "No items yet — your usual payments, clauses and policies"}
          onClick={() => onPick({ scratch: true })}
        />
      </section>
    </div>
  );
}
