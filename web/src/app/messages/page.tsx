"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { listConversations } from "@/lib/jorna";
import { loadIsVendor } from "@/lib/role";
import type { ConversationSummary } from "@/lib/types";
import { Card, Chip, LinkButton } from "@/components/ui";

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = Date.parse(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/**
 * What to call a chat.
 *
 * The server names them now — a plan chat after its plan, a two-person thread
 * after whoever is on the other end of it, which is a different name for each
 * of the two people reading it. The fallback is rarely reached, but when it was,
 * every plan's chat read "Group · 4 people" and you had to open them to tell a
 * wedding from a birthday.
 */
function title(c: ConversationSummary): string {
  if (c.name) return c.name;
  const names = (c.members ?? [])
    .map((m) => m.name?.trim())
    .filter((n): n is string => Boolean(n));
  if (names.length > 0) {
    return names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  }
  const n = c.member_count ?? c.members?.length ?? 0;
  return n ? `Group · ${n} people` : "Conversation";
}

/** The one-word label that says what kind of chat this is. */
function kindLabel(c: ConversationSummary): string | null {
  if (c.subject_type === "enquiry") return "Question";
  if (c.subject_type === "booking") return "One booking";
  if (c.type === "vendors_only") return "Vendors only";
  if (c.subject_type === "bundle") return "Whole plan";
  return null;
}

type Filter = "all" | "plans" | "vendors";

/**
 * Two ideas, not three. "Plans" is the chat with everyone on it; "Vendors" is
 * every thread with one person in it, whether or not a booking exists yet —
 * because from the client's side those are the same act, asking one business
 * something, and splitting a question from the booking it turned into would put
 * one conversation in two places.
 */
function matches(c: ConversationSummary, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "plans") return c.subject_type === "bundle" || !c.subject_type;
  return c.subject_type === "booking" || c.subject_type === "enquiry";
}

/** A preview that says who spoke, since half these rows now have two people. */
function preview(c: ConversationSummary): string {
  const last = c.last_message;
  if (!last?.content) return "No messages yet";
  if (last.kind === "offer") return `💬 ${last.content}`;
  return last.content;
}

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [isVendor, setIsVendor] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/messages");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    loadIsVendor().then(setIsVendor);
  }, [user]);

  // Initial load, then a slow poll so a message that arrived elsewhere moves
  // its row up and bumps its unread count without a manual revisit — the
  // list view doesn't get its own socket the way one open thread does (see
  // lib/chat), so this is the same backstop-poll idea conversation/page.tsx
  // uses, just slower: a row being a beat late to reorder is a much smaller
  // deal than a message being late to arrive.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () =>
      listConversations()
        .then((c) => !cancelled && setConversations(c))
        .catch((err) =>
          !cancelled &&
          setError(err instanceof ApiError ? err.message : "Couldn't load your messages."),
        )
        .finally(() => !cancelled && setLoading(false));
    void load();
    const poll = setInterval(load, 25000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [user]);

  if (authLoading || !user) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  return (
    <div className="mx-auto w-[min(var(--container-page),100%-2rem)] py-10">
      <header>
        <span className="eyebrow">Messages</span>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold sm:text-5xl">
          Your chats
        </h1>
        {/* This used to say chats only exist for plans you've sent, which was
            true and is the thing that changed: you can now ask a vendor
            something before you've booked anything at all. */}
        <p className="mt-2 text-ink-soft">
          Your plans, your vendors, and anyone you&apos;ve asked a question.
        </p>
      </header>

      {conversations.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["plans", "Plans"],
              ["vendors", "Vendors"],
            ] as [Filter, string][]
          ).map(([value, label]) => {
            const n = conversations.filter((c) => matches(c, value)).length;
            return (
              <Chip
                key={value}
                active={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} · {n}
              </Chip>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-10 text-center text-ink-soft">Loading…</p>
      ) : conversations.length === 0 ? (
        <div className="mt-10 text-center">
          {isVendor ? (
            <>
              <p className="mx-auto max-w-[46ch] text-ink-soft">
                No messages yet. This fills in once a client asks about one of
                your packages or books you — a vendor can&apos;t start a chat,
                only a client can.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <LinkButton href="/vendor-profile" variant="ghost">
                  Edit your packages
                </LinkButton>
                <LinkButton href="/my-dashboard" variant="ghost">
                  Dashboard
                </LinkButton>
              </div>
            </>
          ) : (
            <>
              <p className="mx-auto max-w-[46ch] text-ink-soft">
                No chats yet. Ask a vendor a question from their page, or send a
                plan — either one starts a conversation.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <LinkButton href="/marketplace" variant="ghost">
                  Browse vendors
                </LinkButton>
                <LinkButton href="/bundles" variant="ghost">
                  Dashboard
                </LinkButton>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-2">
          {conversations.filter((c) => matches(c, filter)).map((c) => {
            const unread = c.unread_count ?? 0;
            const label = kindLabel(c);
            return (
              <Link key={c.conversation_id} href={`/conversation?id=${c.conversation_id}`}>
                <Card
                  className={`p-4 transition hover:border-gold/50 ${
                    unread > 0 ? "border-gold/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-ink">{title(c)}</p>
                        {label ? (
                          <span className="shrink-0 rounded-full border border-card-edge px-2 py-0.5 text-[0.65rem] text-ink-faint">
                            {label}
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={`mt-0.5 truncate text-sm ${
                          unread > 0 ? "font-medium text-ink" : "text-ink-soft"
                        }`}
                      >
                        {preview(c)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-xs text-ink-faint">
                        {timeAgo(c.last_message?.created_at)}
                      </span>
                      {/* Per row. The tab could say "4 unread" and not which of
                          eleven chats they were in, which on a page whose whole
                          job is deciding what to open is the wrong number. */}
                      {unread > 0 ? (
                        <span className="min-w-[1.25rem] rounded-full bg-maroon px-1.5 text-center text-[0.65rem] font-bold leading-5 text-ground dark:bg-gold dark:text-[#2A0C19]">
                          {unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
