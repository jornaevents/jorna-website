// The contract pages' shapes while they load, in place of a bare "Loading…"
// (see PageSkeleton for the list pages). Each follows its page's own layout:
// the view's centred column and paper, the builder's paper beside its side
// panel, the negotiation workspace inside its frame.

import Link from "next/link";
import { Bar, SkeletonBody, SkeletonCard } from "@/components/vendor/PageSkeleton";

/** The contract itself: a heading line, then clauses. */
function Paper({ lines = 9, className = "" }: { lines?: number; className?: string }) {
  return (
    <div
      className={`min-w-0 rounded-2xl border border-card-edge bg-card px-5 py-6 shadow-[var(--shadow-card)] sm:px-10 sm:py-10 ${className}`}
    >
      <Bar className="h-2.5 w-28" />
      <div className="mt-4 h-7 w-2/3 rounded-md bg-line" />
      <div className="mt-8 grid gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} className={`h-3.5 ${["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"][i % 5]}`} />
        ))}
      </div>
    </div>
  );
}

/** /contracts/view: back link, the client's name and status, the paper. */
export function ContractViewSkeleton() {
  return (
    <div className="mx-auto w-[min(760px,100%-2rem)]">
      <Link href="/contracts" className="eyebrow hover:text-gold">
        ← All contracts
      </Link>
      <SkeletonBody label="Loading the contract…">
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2.5">
            <div className="h-8 w-64 max-w-full rounded-lg bg-line" />
            <Bar className="h-3.5 w-48" />
          </div>
          <div className="h-10 w-28 rounded-[11px] bg-line" />
        </div>
        <Paper className="mt-6" />
      </SkeletonBody>
    </div>
  );
}

/** The contract builder (/contracts/new, /contracts/template). */
export function ContractEditorSkeleton() {
  return (
    <SkeletonBody label="Loading the contract builder…">
      <div className="mb-6 grid gap-2.5">
        <Bar className="h-2.5 w-24" />
        <div className="h-8 w-72 max-w-full rounded-lg bg-line" />
        <Bar className="h-3.5 w-56" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Paper lines={12} />
        <SkeletonCard lines={4} className="hidden lg:block" />
      </div>
    </SkeletonBody>
  );
}

/** Inside the negotiation workspace's frame: its bar, then the contract. */
export function NegotiationSkeleton() {
  return (
    <SkeletonBody label="Loading the negotiation…">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="h-5 w-40 rounded-md bg-line" />
          <div className="h-9 w-32 rounded-full bg-line-soft" />
        </div>
        <div className="p-5">
          <Paper lines={10} className="mx-auto max-w-3xl" />
        </div>
      </div>
    </SkeletonBody>
  );
}

/** /contracts/document: the heading, then the document's fields. */
export function DocumentSkeleton() {
  return (
    <SkeletonBody label="Loading the document…">
      <div className="mb-7 grid gap-2.5">
        <Bar className="h-2.5 w-20" />
        <div className="h-8 w-64 max-w-full rounded-lg bg-line" />
        <Bar className="h-3.5 w-80 max-w-full" />
      </div>
      <SkeletonCard lines={3} />
      <Paper lines={6} className="mt-4" />
    </SkeletonBody>
  );
}
