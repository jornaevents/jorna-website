"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { listBlockedUsers, unblockUser } from "@/lib/jorna";
import type { BlockedUser } from "@/lib/types";
import { Button, Card } from "@jorna/shared/components/ui";

export default function BlockedPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/blocked");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listBlockedUsers()
      .then((b) => !cancelled && setBlocks(b))
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : "Couldn't load your blocked list."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function unblock(b: BlockedUser) {
    setBusyId(b.blocked_user_id);
    try {
      await unblockUser(b.blocked_user_id);
      setBlocks((prev) => prev.filter((x) => x.blocked_user_id !== b.blocked_user_id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't unblock.");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  return (
    <div className="mx-auto w-[min(560px,100%-2rem)] py-10">
      <Link href="/settings" className="text-sm text-ink-soft hover:text-ink">
        ← Settings
      </Link>
      <h1 className="serif mt-4 text-3xl text-maroon dark:text-gold">Blocked</h1>
      <p className="mt-2 text-ink-soft">
        People you&apos;ve blocked don&apos;t appear in search, and you won&apos;t
        see their messages or reviews.
      </p>

      {error ? (
        <p className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-8 text-center text-ink-soft">Loading…</p>
      ) : blocks.length === 0 ? (
        <p className="mt-10 text-center text-ink-soft">You haven&apos;t blocked anyone.</p>
      ) : (
        <div className="mt-8 grid gap-2">
          {blocks.map((b) => (
            <Card
              key={b.blocked_user_id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{b.blocked_name}</p>
                {b.blocked_vendor_id ? (
                  <Link
                    href={`/vendor?id=${b.blocked_vendor_id}`}
                    className="text-xs text-ink-faint hover:text-ink"
                  >
                    View profile
                  </Link>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="md"
                disabled={busyId === b.blocked_user_id}
                onClick={() => unblock(b)}
              >
                {busyId === b.blocked_user_id ? "…" : "Unblock"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
