// The dashboard's shape while its data loads: the page header and the five
// cards, in the same grid as app/(vendor)/overview. Shown by Overview itself
// and by the sign-in callback (VendorShellSkeleton), so signing in moves from
// one to the other without the layout jumping.

export function OverviewSkeleton() {
  return (
    <div role="status" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading your dashboard…</span>
      <div aria-hidden="true">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="grid gap-2.5">
            <div className="h-3 w-40 rounded-full bg-line" />
            <div className="h-8 w-72 max-w-full rounded-lg bg-line" />
            <div className="h-3.5 w-56 max-w-full rounded-full bg-line-soft" />
          </div>
          <div className="h-10 w-24 rounded-full bg-line" />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.8fr)_minmax(0,1.05fr)]">
          <div className="min-h-[16.5rem] rounded-[17px] bg-[#641f34] opacity-80" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="min-h-[16.5rem] rounded-[17px] border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="h-3 w-24 rounded-full bg-line" />
              <div className="mt-5 grid gap-3">
                <div className="h-3.5 w-3/4 rounded-full bg-line-soft" />
                <div className="h-3.5 w-2/3 rounded-full bg-line-soft" />
                <div className="h-3.5 w-1/2 rounded-full bg-line-soft" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
