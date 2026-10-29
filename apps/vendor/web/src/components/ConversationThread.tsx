"use client";

// One conversation's messages and composer: the live socket, a 5s poll as a
// backstop, sending, and the thread itself. Shared by the client's
// /conversation page and the vendor's Messages hub, so live delivery works
// the same in both. Who's on the other end and what they can do about it is
// the caller's header and side panel.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError } from "@jorna/shared/lib/api";
import { offerTarget, type OfferTarget } from "@jorna/shared/lib/offerTarget";
import { getConversationMessages, sendConversationMessage } from "@/lib/jorna";
import { openConversationSocket } from "@/lib/chat";
import type { ConversationSummary, GroupMessage } from "@/lib/types";

function clockTime(iso: string): string {
  const t = Date.parse(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function money(cents?: number | null): string | null {
  return cents == null ? null : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Where "answer this offer" goes: the client's booking on their app, or the
 *  vendor's Leads drawer — never a button in the chat, because accepting a
 *  price changes what's owed and the chat is the wrong place to hold money. */
export type OfferLink = (target: OfferTarget) => { href: string; label: string };

/**
 * A price offer, in the thread it belongs to. The card is drawn from the
 * message's own `meta`, and `content` is a full sentence underneath it, so a
 * message whose kind this build doesn't know still reads correctly.
 */
function OfferCard({
  message,
  mine,
  conversation,
  offerLink,
}: {
  message: GroupMessage;
  mine: boolean;
  conversation: ConversationSummary | null;
  offerLink: OfferLink;
}) {
  const meta = message.meta ?? {};
  const amount = money(meta.amount_cents);
  const settled = meta.action === "accept" || meta.action === "reject";
  const tone =
    meta.action === "accept"
      ? "border-green/50 bg-green/[0.08]"
      : meta.action === "reject"
        ? "border-card-edge bg-panel"
        : "border-gold/50 bg-gold/[0.08]";
  const link = offerLink(offerTarget(meta, conversation));

  return (
    <div className={`max-w-[80%] rounded-2xl border px-3.5 py-2.5 ${tone}`}>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {meta.action === "accept" ? "Agreed" : meta.action === "reject" ? "Declined" : mine ? "Your offer" : "Their offer"}
      </p>
      {amount && !settled ? <p className="serif mt-0.5 text-2xl text-ink">{amount}</p> : null}
      {amount && meta.action === "accept" ? <p className="serif mt-0.5 text-2xl text-green">{amount}</p> : null}
      <p className="mt-1 text-sm text-ink-soft">{message.content}</p>
      {!settled ? (
        <Link href={link.href} className="mt-2 inline-block text-xs font-medium text-maroon hover:underline dark:text-gold">
          {link.label} →
        </Link>
      ) : null}
    </div>
  );
}

export function ConversationThread({
  conversationId,
  currentUserId,
  conversation,
  offerLink,
  onLive,
  placeholder = "Message…",
  className = "",
}: {
  conversationId: string;
  currentUserId: string;
  conversation: ConversationSummary | null;
  offerLink: OfferLink;
  onLive?: (live: boolean) => void;
  placeholder?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const onLiveRef = useRef(onLive);
  useEffect(() => {
    onLiveRef.current = onLive;
  });

  // Merge a message in by id — the socket echo, the POST response, and the poll
  // all converge on the same message_id without duplicating.
  const upsert = useCallback((incoming: GroupMessage | GroupMessage[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.message_id, m]));
      for (const m of Array.isArray(incoming) ? incoming : [incoming]) byId.set(m.message_id, m);
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  // A promise chain, not async/await: state is only set once the request
  // settles, so the effect below never updates state synchronously.
  const loadMessages = useCallback(
    () =>
      getConversationMessages(conversationId, { limit: 100 })
        .then(
          (res) => upsert(res.items),
          (err) => setError(err instanceof ApiError ? err.message : "Couldn't load this conversation."),
        )
        .finally(() => setLoaded(true)),
    [conversationId, upsert],
  );

  // Initial load, live socket, and a 5s poll fallback.
  useEffect(() => {
    void loadMessages();
    const socket = openConversationSocket(conversationId, {
      onMessage: upsert,
      onOpen: () => onLiveRef.current?.(true),
      onClose: () => onLiveRef.current?.(false),
    });
    const poll = setInterval(loadMessages, 5000);
    return () => {
      socket.close();
      clearInterval(poll);
    };
  }, [conversationId, loadMessages, upsert]);

  // Autoscroll only if already near the bottom — don't yank someone up from
  // reading history.
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function send() {
    const content = draft.trim();
    if (!content) return;
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

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-card-edge bg-panel p-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!loaded ? (
          <p className="py-10 text-center text-sm text-ink-faint">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">No messages yet — say hello.</p>
        ) : (
          <div className="grid gap-2.5">
            {messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              // An event log line ("date change accepted"), not a message from
              // either party — centered, unattributed.
              if (m.kind === "system") {
                return (
                  <div key={m.message_id} className="flex justify-center py-1">
                    <span className="mx-auto max-w-[85%] rounded-full bg-card px-3 py-1 text-center text-xs text-ink-faint">
                      {m.content}
                    </span>
                  </div>
                );
              }
              return (
                <div key={m.message_id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && m.sender_name ? (
                    <span className="mb-0.5 px-1 text-[0.7rem] text-ink-faint">{m.sender_name}</span>
                  ) : null}
                  {m.kind === "offer" ? (
                    <OfferCard message={m} mine={mine} conversation={conversation} offerLink={offerLink} />
                  ) : (
                    <div
                      className={`max-w-[80%] break-words rounded-2xl px-3.5 py-2 text-sm ${
                        mine ? "bg-maroon text-white dark:bg-gold dark:text-[#2A0C19]" : "bg-card text-ink"
                      }`}
                    >
                      {/* The listing a question was asked from, when it was. */}
                      {m.meta?.service_name ? (
                        <span className={`mb-1 block text-[0.7rem] ${mine ? "opacity-80" : "text-ink-faint"}`}>
                          About {m.meta.service_name}
                        </span>
                      ) : null}
                      {m.content}
                    </div>
                  )}
                  <span className="mt-0.5 px-1 text-[0.65rem] text-ink-faint">{clockTime(m.created_at)}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error ? <p className="mt-2 text-center text-xs text-maroon dark:text-gold">{error}</p> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-3 flex items-end gap-2"
      >
        <textarea
          aria-label="Write a message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className="max-h-32 flex-1 resize-none rounded-2xl border border-card-edge bg-ground-2 px-4 py-2.5 text-ink outline-none focus:border-gold"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={sending || !draft.trim()}
          className="rounded-full bg-maroon px-5 py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50 dark:bg-gold dark:text-[#2A0C19]"
        >
          Send
        </button>
      </form>
    </div>
  );
}
