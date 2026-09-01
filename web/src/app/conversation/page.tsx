"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  getConversation,
  getConversationMessages,
  sendConversationMessage,
} from "@/lib/jorna";
import { openConversationSocket } from "@/lib/chat";
import type { ConversationSummary, GroupMessage } from "@/lib/types";
import { ModerationMenu } from "@/components/ModerationMenu";

function clockTime(iso: string): string {
  const t = Date.parse(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function money(cents?: number | null): string | null {
  return cents == null ? null : `$${(cents / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

/**
 * A price offer, in the thread it belongs to.
 *
 * The negotiation panel used to render its own history beside the chat, so a
 * haggle was a second conversation with no ordering against the first — "we'd
 * do $2,800 if you drop the second shooter" sat in a different box from the
 * reply that answered it. The card is drawn from the message's own `meta`, and
 * `content` is a full sentence underneath it, so a message whose kind this
 * build doesn't know still reads correctly.
 */
function OfferCard({ message, mine }: { message: GroupMessage; mine: boolean }) {
  const meta = message.meta ?? {};
  const amount = money(meta.amount_cents);
  const settled = meta.action === "accept" || meta.action === "reject";
  const tone =
    meta.action === "accept"
      ? "border-green/50 bg-green/[0.08]"
      : meta.action === "reject"
        ? "border-card-edge bg-panel"
        : "border-gold/50 bg-gold/[0.08]";

  return (
    <div className={`max-w-[80%] rounded-2xl border px-3.5 py-2.5 ${tone}`}>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {meta.action === "accept"
          ? "Agreed"
          : meta.action === "reject"
            ? "Declined"
            : mine
              ? "Your offer"
              : "Their offer"}
      </p>
      {amount && !settled ? (
        <p className="serif mt-0.5 text-2xl text-ink">{amount}</p>
      ) : null}
      {amount && meta.action === "accept" ? (
        <p className="serif mt-0.5 text-2xl text-green">{amount}</p>
      ) : null}
      <p className="mt-1 text-sm text-ink-soft">{message.content}</p>
      {/* The buttons live on the booking, not here. Accepting a price approves
          a booking and changes what is owed, and a chat bubble is the wrong
          place to be holding money — the plan page owns that, and says so. */}
      {!settled ? (
        <Link
          href="/bundles"
          className="mt-2 inline-block text-xs font-medium text-maroon hover:underline dark:text-gold"
        >
          Answer on the booking →
        </Link>
      ) : null}
    </div>
  );
}

function ConversationInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const conversationId = params.get("id");

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [meta, setMeta] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=/conversation${conversationId ? `?id=${conversationId}` : ""}`);
    }
  }, [authLoading, user, router, conversationId]);

  // Merge a message in by id — the socket echo, the POST response, and the poll
  // all converge on the same message_id without duplicating.
  const upsert = useCallback((incoming: GroupMessage | GroupMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.message_id, m]));
      for (const m of Array.isArray(incoming) ? incoming : [incoming]) byId.set(m.message_id, m);
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await getConversationMessages(conversationId, { limit: 100 });
      upsert(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [conversationId, upsert]);

  // Who this is with, and what it's about. Fetched once — it doesn't change
  // while you're reading, and the poll below is for messages.
  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    getConversation(conversationId)
      .then((c) => !cancelled && setMeta(c))
      .catch(() => {
        /* the thread still works unnamed; the messages are the point */
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, user]);

  // Initial load, live socket, and a 5s poll fallback.
  useEffect(() => {
    if (!conversationId || !user) return;
    void loadMessages();

    const socket = openConversationSocket(conversationId, {
      onMessage: upsert,
      onOpen: () => setLive(true),
      onClose: () => setLive(false),
    });
    const poll = setInterval(loadMessages, 5000);

    return () => {
      socket.close();
      clearInterval(poll);
    };
  }, [conversationId, user, loadMessages, upsert]);

  // Autoscroll only if the user is already near the bottom (don't yank them up
  // from reading history).
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const content = draft.trim();
    if (!content || !conversationId) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendConversationMessage(conversationId, content);
      upsert(msg);
      setDraft("");
      atBottomRef.current = true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  // Only offered on a two-person thread: blocking one member of a group chat
  // you're both in is a different question, and one this doesn't answer.
  const otherMember =
    meta?.members && meta.members.length === 2
      ? meta.members.find((m) => m.user_id !== user.user_id)
      : undefined;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-[min(680px,100%-2rem)] flex-col py-4">
      {/* A header. There wasn't one — a back link and a Live dot, and nothing
          saying whose chat you were in. Survivable when every chat was one
          plan's group; not once a client has a thread per vendor and a question
          they asked a fortnight ago. */}
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <Link href="/messages" className="text-sm text-ink-soft hover:text-ink">
            ← Messages
          </Link>
          <h1 className="serif mt-1 truncate text-2xl text-ink">
            {meta?.name || "Conversation"}
          </h1>
          <p className="text-xs text-ink-faint">
            {meta?.subject_type === "enquiry"
              ? "A question — nothing booked yet"
              : meta?.subject_type === "booking"
                ? "About one booking"
                : meta?.type === "vendors_only"
                  ? "Your vendors, without you"
                  : `${meta?.member_count ?? 0} people`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`text-xs ${live ? "text-green" : "text-ink-faint"}`}
            title={live ? "Live" : "Reconnecting…"}
          >
            ● {live ? "Live" : "Offline"}
          </span>
          {/* Block and report, on the surface where a stranger can now reach
              you. It shipped months ago and was never put on a chat. */}
          {otherMember ? (
            <ModerationMenu
              targetType="conversation"
              targetId={conversationId ?? ""}
              blockUserId={otherMember.user_id}
              label="this person"
            />
          ) : null}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-2xl border border-card-edge bg-panel p-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">
            No messages yet — say hello.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {messages.map((m) => {
              const mine = m.sender_id === user.user_id;
              return (
                <div
                  key={m.message_id}
                  className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                >
                  {!mine && m.sender_name ? (
                    <span className="mb-0.5 px-1 text-[0.7rem] text-ink-faint">
                      {m.sender_name}
                    </span>
                  ) : null}
                  {m.kind === "offer" ? (
                    <OfferCard message={m} mine={mine} />
                  ) : (
                    <div
                      className={`max-w-[80%] break-words rounded-2xl px-3.5 py-2 text-sm ${
                        mine
                          ? "bg-maroon text-ground dark:bg-gold dark:text-[#2A0C19]"
                          : "bg-card text-ink"
                      }`}
                    >
                      {/* The listing a question was asked from, when it was
                          asked from one — otherwise a vendor with nine
                          packages gets "are you free on the 14th?" and no way
                          to know which one it's about. */}
                      {m.meta?.service_name ? (
                        <span
                          className={`mb-1 block text-[0.7rem] ${
                            mine ? "opacity-80" : "text-ink-faint"
                          }`}
                        >
                          About {m.meta.service_name}
                        </span>
                      ) : null}
                      {m.content}
                    </div>
                  )}
                  <span className="mt-0.5 px-1 text-[0.65rem] text-ink-faint">
                    {clockTime(m.created_at)}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-2 text-center text-xs text-maroon dark:text-gold">{error}</p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-3 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Message…"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-card-edge bg-ground-2 px-4 py-2.5 text-ink outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-full bg-maroon px-5 py-2.5 font-semibold text-ground transition hover:brightness-110 disabled:opacity-50 dark:bg-gold dark:text-[#2A0C19]"
        >
          Send
        </button>
      </form>
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
