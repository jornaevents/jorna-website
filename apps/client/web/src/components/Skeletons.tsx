// A page's shape while its data loads, in place of a bare "Loading…" (the
// vendor app's components/vendor/PageSkeleton, for the client side). Each
// skeleton follows the layout of the page it stands in for, at the same
// widths and spacing, so nothing jumps when the real thing lands. One status
// is announced with words saying what's loading; the placeholders themselves
// are hidden from assistive tech.

import type { ReactNode } from "react";

const PAGE = "mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-10";
const CARD = "rounded-2xl border border-line bg-card";

/** Placeholders announced once, as one status, and hidden from the tree. */
export function SkeletonBody({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" className={`motion-safe:animate-pulse ${className ?? ""}`}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function Bar({ className }: { className: string }) {
  return <div className={`rounded-full bg-line-soft ${className}`} />;
}

function Block({ className }: { className: string }) {
  return <div className={`rounded-xl bg-line-soft ${className}`} />;
}

/** An eyebrow, a big heading and a line under it — most pages open this way. */
function Heading({ wide = false }: { wide?: boolean }) {
  return (
    <div className="grid gap-3">
      <Bar className="h-2.5 w-24" />
      <div className={`h-9 rounded-lg bg-line desk:h-12 ${wide ? "w-[min(34rem,90%)]" : "w-[min(22rem,80%)]"}`} />
      <Bar className="h-3.5 w-[min(26rem,70%)]" />
    </div>
  );
}

/** Rows of a list card: an avatar or tile, two lines, and a pill. */
export function SkeletonRows({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-line-soft px-4 py-4 first:border-t-0">
          {avatar ? <div className="size-10 shrink-0 rounded-full bg-line" /> : null}
          <div className="grid min-w-0 flex-1 gap-2">
            <Bar className="h-3.5 w-1/3" />
            <Bar className="h-3 w-2/3" />
          </div>
          <div className="hidden h-6 w-20 rounded-full bg-line-soft sm:block" />
        </div>
      ))}
    </div>
  );
}

/** My Events: the greeting, three count tiles, and event cards two to a row. */
export function MyEventsSkeleton() {
  return (
    <div className={PAGE}>
      <SkeletonBody label="Loading your events…">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading />
          <div className="h-11 w-44 rounded-full bg-line" />
        </div>
        <div className={`mt-6 grid grid-cols-3 overflow-hidden ${CARD}`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-r border-line px-[18px] py-[15px] last:border-r-0">
              <div className="grid gap-2">
                <Bar className="h-3 w-24" />
                <Bar className="h-2.5 w-32 max-sm:w-12" />
              </div>
              <div className="h-7 w-7 rounded-md bg-line" />
            </div>
          ))}
        </div>
        <EventCardsSkeleton />
      </SkeletonBody>
    </div>
  );
}

/** The "Your Events" panel alone, for when the page around it is already up. */
export function EventCardsSkeleton({ label }: { label?: string }) {
  const body = (
    <div className={`mt-6 p-[18px] ${CARD}`}>
      <div className="mb-3.5 grid gap-2">
        <div className="h-5 w-32 rounded-md bg-line" />
        <Bar className="h-2.5 w-20" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3 rounded-[13px] border border-line p-2.5">
            <div className="h-[92px] w-[76px] rounded-[9px] bg-line" />
            <div className="grid gap-2">
              <Bar className="h-3.5 w-2/3" />
              <Bar className="h-2.5 w-1/2" />
              <Bar className="mt-2 h-2.5 w-2/5" />
              <Bar className="h-[5px] w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return label ? <SkeletonBody label={label}>{body}</SkeletonBody> : body;
}

/** An event's page: its title, the section sidebar, and the overview's rows. */
export function EventSkeleton() {
  return (
    <div className={PAGE}>
      <SkeletonBody label="Loading your event…">
        <Bar className="h-3 w-24" />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-3">
            <div className="h-10 w-[min(28rem,85vw)] rounded-lg bg-line desk:h-12" />
            <Bar className="h-3.5 w-64" />
          </div>
          <div className="h-11 w-32 rounded-full bg-line-soft" />
        </div>
        <div className="mt-7 grid gap-6 desk:grid-cols-[200px_minmax(0,1fr)]">
          <div className="flex gap-2 desk:grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-10 rounded-xl ${i === 0 ? "bg-line" : "bg-line-soft"} w-24 desk:w-full`} />
            ))}
          </div>
          <div className="grid gap-4">
            <div className={`p-5 ${CARD}`}>
              <div className="h-5 w-40 rounded-md bg-line" />
              <Bar className="mt-4 h-2 w-full" />
            </div>
            <div className={CARD}>
              <SkeletonRows rows={4} />
            </div>
          </div>
        </div>
      </SkeletonBody>
    </div>
  );
}

/** The guest list section: four count boxes, Add guest, and the table. */
export function GuestListSkeleton() {
  return (
    <SkeletonBody label="Loading your guest list…">
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid min-w-[110px] gap-2 rounded-xl border border-line bg-card p-4 max-sm:min-w-0 max-sm:flex-1">
            <div className="h-6 w-10 rounded-md bg-line" />
            <Bar className="h-2.5 w-14" />
          </div>
        ))}
        <div className="ml-auto h-11 w-32 rounded-full bg-line max-sm:ml-0 max-sm:w-full" />
      </div>
      <div className={`mt-6 overflow-hidden ${CARD}`}>
        <div className="h-11 bg-panel" />
        <SkeletonRows rows={4} avatar={false} />
      </div>
    </SkeletonBody>
  );
}

/** Messages: the heading, filter chips, and conversation rows. */
export function MessagesSkeleton({ withHeading = true }: { withHeading?: boolean }) {
  const list = (
    <div className={`mt-6 ${CARD}`}>
      <SkeletonRows rows={5} />
    </div>
  );
  if (!withHeading) return <SkeletonBody label="Loading your messages…">{list}</SkeletonBody>;
  return (
    <div className="mx-auto w-[min(1000px,100%-2rem)] py-6 desk:py-10">
      <SkeletonBody label="Loading your messages…">
        <Heading />
        <div className="mt-6 flex gap-2">
          {[16, 20, 20].map((w, i) => (
            <div key={i} className="h-9 rounded-full bg-line-soft" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        {list}
      </SkeletonBody>
    </div>
  );
}

/** Chat bubbles, alternating sides, as a thread loads. */
export function ThreadSkeleton({ label = "Loading the conversation…" }: { label?: string }) {
  return (
    <SkeletonBody label={label} className="grid gap-4 p-4">
      {[
        ["start", "w-[60%]", "h-16"],
        ["end", "w-[45%]", "h-10"],
        ["start", "w-[52%]", "h-24"],
        ["end", "w-[38%]", "h-10"],
      ].map(([side, w, h], i) => (
        <div key={i} className={`flex ${side === "end" ? "justify-end" : "justify-start"}`}>
          <div className={`${w} ${h} rounded-2xl ${side === "end" ? "bg-line" : "bg-line-soft"}`} />
        </div>
      ))}
    </SkeletonBody>
  );
}

/** A conversation page: its header, the thread, the composer, and the sidebar. */
export function ChatSkeleton() {
  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6">
      <SkeletonBody label="Loading the conversation…">
        <Bar className="h-3 w-24" />
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-full bg-line" />
              <div className="grid gap-2">
                <div className="h-5 w-44 rounded-md bg-line" />
                <Bar className="h-2.5 w-24" />
              </div>
            </div>
            <div className={`mt-4 grid gap-4 p-4 ${CARD}`}>
              {[
                ["start", "w-[60%] h-16"],
                ["end", "w-[45%] h-10"],
                ["start", "w-[52%] h-24"],
                ["end", "w-[38%] h-10"],
              ].map(([side, size], i) => (
                <div key={i} className={`flex ${side === "end" ? "justify-end" : ""}`}>
                  <div className={`${size} rounded-2xl ${side === "end" ? "bg-line" : "bg-line-soft"}`} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <div className="h-12 flex-1 rounded-xl bg-line-soft" />
              <div className="h-12 w-20 rounded-full bg-line" />
            </div>
          </div>
          <div className="hidden gap-3 lg:grid lg:content-start">
            {[3, 2].map((lines, i) => (
              <div key={i} className={`p-4 ${CARD}`}>
                <Bar className="h-2.5 w-16" />
                <div className="mt-3 grid gap-2.5">
                  {Array.from({ length: lines }, (_, j) => (
                    <Bar key={j} className={`h-3 ${["w-3/4", "w-1/2", "w-2/3"][j]}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SkeletonBody>
    </div>
  );
}

/** A vendor's or a package's page: the photo, the name, and the packages. */
export function VendorPageSkeleton({ label = "Loading the vendor…" }: { label?: string }) {
  return (
    <div className={PAGE}>
      <SkeletonBody label={label}>
        <Bar className="h-3 w-28" />
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <Block className="aspect-[16/7] w-full rounded-2xl" />
            <div className="mt-5 flex items-center gap-4">
              <div className="size-16 shrink-0 rounded-full bg-line" />
              <div className="grid gap-2.5">
                <div className="h-7 w-[min(18rem,60vw)] rounded-lg bg-line" />
                <Bar className="h-3 w-40" />
              </div>
            </div>
            <div className="mt-5 grid gap-2.5">
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-11/12" />
              <Bar className="h-3 w-3/5" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className={`grid gap-3 p-5 ${CARD}`}>
                  <div className="h-5 w-2/3 rounded-md bg-line" />
                  <Bar className="h-3 w-1/3" />
                  <Bar className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          </div>
          <div className={`grid h-max gap-3 p-5 ${CARD}`}>
            <div className="h-7 w-28 rounded-md bg-line" />
            <Bar className="h-3 w-3/4" />
            <div className="mt-2 h-11 w-full rounded-full bg-line" />
            <div className="h-11 w-full rounded-full bg-line-soft" />
          </div>
        </div>
      </SkeletonBody>
    </div>
  );
}

/** A contract or another one-column document: title, steps, and the paper. */
export function DocumentSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto w-[min(720px,100%-2rem)] py-8 desk:py-12">
      <SkeletonBody label={label}>
        <div className="grid justify-items-center gap-3 text-center">
          <div className="h-8 w-[min(26rem,80vw)] rounded-lg bg-line" />
          <Bar className="h-3.5 w-[min(22rem,70vw)]" />
          <div className="mt-2 flex gap-6">
            {[0, 1, 2].map((i) => (
              <Bar key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        <div className={`mt-7 grid gap-3 p-6 ${CARD}`}>
          <Bar className="h-2.5 w-24" />
          <div className="h-6 w-2/3 rounded-md bg-line" />
          {["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3", "w-3/4"].map((w, i) => (
            <Bar key={i} className={`h-3 ${w} ${i === 3 ? "mt-3" : ""}`} />
          ))}
          <div className="mt-4 flex justify-between gap-6">
            <Bar className="h-3 w-32" />
            <Bar className="h-3 w-32" />
          </div>
        </div>
        <div className="mt-4 h-12 w-full rounded-full bg-line" />
      </SkeletonBody>
    </div>
  );
}

/** A short form on its own: heading, a few fields, and the button. */
export function FormSkeleton({ label, fields = 4 }: { label: string; fields?: number }) {
  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-8 desk:py-12">
      <SkeletonBody label={label}>
        <Heading />
        <div className={`mt-7 grid gap-5 p-6 ${CARD}`}>
          {Array.from({ length: fields }, (_, i) => (
            <div key={i} className="grid gap-2">
              <Bar className="h-3 w-28" />
              <div className="h-11 w-full rounded-xl bg-line-soft" />
            </div>
          ))}
          <div className="mt-1 h-11 w-40 rounded-full bg-line" />
        </div>
      </SkeletonBody>
    </div>
  );
}

/** A heading over a list card: Activity, the people you've blocked. */
export function ListPageSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div className="mx-auto w-[min(1000px,100%-2rem)] py-6 desk:py-10">
      <SkeletonBody label={label}>
        <Heading />
        <div className={`mt-7 ${CARD}`}>
          <SkeletonRows rows={rows} />
        </div>
      </SkeletonBody>
    </div>
  );
}

/** Explore before it's mounted: the heading, the search, the event card, tiles and results. */
export function ExploreSkeleton() {
  return (
    <div className="mx-auto w-[min(1280px,100%-2rem)] py-6 desk:py-11">
      <SkeletonBody label="Loading vendors…">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading wide />
          <div className="h-11 w-44 rounded-full bg-line" />
        </div>
        <div className="mt-8 flex gap-2">
          <div className="h-12 flex-1 rounded-xl bg-card shadow-card" />
          <div className="h-12 w-24 rounded-full bg-line-soft" />
        </div>
        <div className="mt-4 h-36 rounded-2xl bg-card shadow-card" />
        <div className="mt-8 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-[92px] rounded-[14px] border border-line bg-card sm:h-[104px]" />
          ))}
        </div>
        <ResultsGrid />
      </SkeletonBody>
    </div>
  );
}

/** Vendor cards, as Explore's results lay them out. */
export function ResultsGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`overflow-hidden ${CARD}`}>
          <div className="aspect-[4/3] bg-line-soft" />
          <div className="grid gap-2 p-4">
            <Bar className="h-4 w-3/4" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compare: packages side by side. */
export function CompareSkeleton() {
  return (
    <div className={PAGE}>
      <SkeletonBody label="Loading your saved packages…">
        <Heading />
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`overflow-hidden ${CARD}`}>
              <div className="aspect-[16/9] bg-line-soft" />
              <div className="grid gap-3 p-5">
                <div className="h-5 w-2/3 rounded-md bg-line" />
                {["w-1/2", "w-3/4", "w-2/3", "w-1/2"].map((w, j) => (
                  <Bar key={j} className={`h-3 ${w}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkeletonBody>
    </div>
  );
}

/** A plan (bundle): its header, the vendors in it, and the summary beside them. */
export function PlanSkeleton({ label = "Loading your plan…" }: { label?: string }) {
  return (
    <div className={PAGE}>
      <SkeletonBody label={label}>
        <Bar className="h-3 w-24" />
        <div className="mt-5">
          <Heading />
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className={CARD}>
            <SkeletonRows rows={4} />
          </div>
          <div className={`grid h-max gap-3 p-5 ${CARD}`}>
            <div className="h-5 w-32 rounded-md bg-line" />
            <Bar className="h-3 w-3/4" />
            <Bar className="h-3 w-1/2" />
            <div className="mt-2 h-11 w-full rounded-full bg-line" />
          </div>
        </div>
      </SkeletonBody>
    </div>
  );
}
