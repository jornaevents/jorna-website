"use client";

// "Needs you" — the one screen that answers what's waiting on you.
//
// The rules live in lib/attention so the tab bar badge counts exactly what this
// page lists. Derived, not pushed: the backend keeps no notification history, so
// nothing can reach you with the tab closed — the page says so rather than
// implying otherwise.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { loadAttention, type AttentionItem } from "@/lib/attention";
import { loadIsVendor } from "@/lib/role";
import { PushOptIn } from "@/components/PushOptIn";
import { Button, Card, LinkButton } from "@/components/ui";

export default function ActivityPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [isVendor, setIsVendor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/activity");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadIsVendor().then((v) => !cancelled && setIsVendor(v));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      // Force: this is the page you open *to* check, so it shouldn't show a
      // minute-old cache. It refreshes the badge's cache on the way through.
      setItems(await loadAttention({ force: true }));
    } catch {
      setError("Couldn't load what's waiting on you.");
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading || !user || (items === null && !error)) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  return (
    <div className="mx-auto w-[min(var(--container-page),100%-2rem)] py-10">
      <h1 className="serif text-4xl text-maroon dark:text-gold">Needs you</h1>
      <p className="mt-2 mb-6 text-ink-soft">Everything waiting on you, in one place.</p>

      <PushOptIn />

      {error ? (
        <Card className="mt-8 p-6 text-center">
          <p className="text-ink-soft">{error}</p>
          <Button size="md" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : items && items.length === 0 ? (
        <Card className="mt-8 p-6 text-center">
          <p className="text-ink-soft">You&apos;re all caught up.</p>
          {/* Where to go next depends on which app you're in. A vendor with
              nothing waiting was being offered "Plan an event" — an invitation
              to become their own customer, into a builder that now turns them
              away. */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {isVendor ? (
              <>
                <LinkButton href="/my-dashboard" size="md">
                  Your dashboard
                </LinkButton>
                <LinkButton href="/my-calendar" variant="ghost" size="md">
                  Your calendar
                </LinkButton>
              </>
            ) : (
              <>
                <LinkButton href="/plan" size="md">
                  Plan an event
                </LinkButton>
                <LinkButton href="/marketplace" variant="ghost" size="md">
                  Browse vendors
                </LinkButton>
              </>
            )}
          </div>
        </Card>
      ) : (
        <div className="mt-8 grid gap-2">
          {(items ?? []).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-card-edge bg-card px-4 py-3 transition hover:border-gold/50"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  {item.tone === "urgent" ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                  ) : null}
                  <span className="text-sm font-semibold text-ink">{item.title}</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-faint">{item.detail}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-gold">{item.cta} ›</span>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-ink-faint">
        This list is worked out live from your bookings and messages — Jorna
        can&apos;t alert your browser while this tab is closed.
      </p>
    </div>
  );
}
