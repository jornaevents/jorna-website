"use client";

// One conversation, for a client. A vendor reads theirs in the Messages hub
// (/messages?id=…), so they're forwarded there — every existing link to
// /conversation keeps working for both.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getConversation } from "@/lib/jorna";
import type { ConversationSummary } from "@/lib/types";
import { ModerationMenu } from "@/components/ModerationMenu";
import { useVendorShell } from "@/components/ChromeGate";
import { ConversationThread, type OfferLink } from "@/components/ConversationThread";
import { clientAppUrl } from "@/lib/clientApp";

/** A client answers an offer on their booking, in the client app. */
const clientOfferLink: OfferLink = ({ bookingId, bundleId }) => ({
  href: bundleId && bookingId ? clientAppUrl(`/bundle?id=${bundleId}#booking-${bookingId}`) : clientAppUrl("/bundles"),
  label: "Answer on the booking",
});

function ConversationInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const conversationId = params.get("id");
  const shell = useVendorShell();

  const [meta, setMeta] = useState<ConversationSummary | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/conversation${conversationId ? `?id=${conversationId}` : ""}`);
    }
  }, [authLoading, user, router, conversationId]);

  useEffect(() => {
    if (shell === true) router.replace(conversationId ? `/messages?id=${conversationId}` : "/messages");
  }, [shell, conversationId, router]);

  // Who this is with, and what it's about. Fetched once — it doesn't change
  // while you're reading, and the thread polls for messages itself.
  useEffect(() => {
    if (!conversationId || !user || shell !== false) return;
    let cancelled = false;
    getConversation(conversationId)
      .then((c) => !cancelled && setMeta(c))
      .catch(() => {
        /* the thread still works unnamed; the messages are the point */
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, user, shell]);

  if (authLoading || !user || shell !== false || !conversationId) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  // Only offered on a two-person thread: blocking one member of a group chat
  // you're both in is a different question, and one this doesn't answer.
  const otherMember =
    meta?.members && meta.members.length === 2 ? meta.members.find((m) => m.user_id !== user.user_id) : undefined;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-[min(680px,100%-2rem)] flex-col py-4">
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <Link href="/messages" className="text-sm text-ink-soft hover:text-ink">
            ← Messages
          </Link>
          <h1 className="serif mt-1 truncate text-2xl text-ink">{meta?.name || "Conversation"}</h1>
          <p className="text-xs text-ink-faint">
            {meta?.subject_type === "enquiry"
              ? "Just the two of you"
              : meta?.subject_type === "booking"
                ? "About one booking"
                : meta?.type === "vendors_only"
                  ? "Your vendors, without you"
                  : `${meta?.member_count ?? 0} people`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs ${live ? "text-green" : "text-ink-faint"}`} title={live ? "Live" : "Reconnecting…"}>
            ● {live ? "Live" : "Offline"}
          </span>
          {/* Block and report, on the surface where a stranger can reach you. */}
          {otherMember ? (
            <ModerationMenu
              targetType="conversation"
              targetId={conversationId}
              blockUserId={otherMember.user_id}
              label="this person"
            />
          ) : null}
        </div>
      </div>

      <ConversationThread
        className="flex-1"
        conversationId={conversationId}
        currentUserId={user.user_id}
        conversation={meta}
        offerLink={clientOfferLink}
        onLive={setLive}
      />
    </div>
  );
}

export default function ConversationPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <ConversationInner />
    </Suspense>
  );
}
