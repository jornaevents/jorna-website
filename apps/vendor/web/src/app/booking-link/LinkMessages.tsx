"use client";

// "Questions for Arjun?" on the contract link: the client's thread with their
// vendor, for someone with no account (backend DECISIONS #41). The vendor reads
// and answers it in their Messages; their replies email the client a link here
// (#messages opens this panel).
//
// Closed until asked for, unless the link was opened from that email or there's
// already a conversation. Opening it is reading it, so the vendor's own preview
// doesn't load it — that would mark the client's messages read for them.

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, Card } from "@jorna/shared/components/ui";
import { getLinkMessages, sendLinkMessage } from "@/lib/jorna";
import type { LinkThread } from "@/lib/types";

const POLL_MS = 15_000;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function LinkMessages({
  token,
  vendorName,
  preview = false,
  canWrite = true,
}: {
  token: string;
  vendorName: string;
  preview?: boolean;
  /** False once the offer is declined or withdrawn: readable, not writable. */
  canWrite?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<LinkThread | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // From the reply email (…#messages): open straight away.
  useEffect(() => {
    if (window.location.hash === "#messages") {
      const id = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(id);
    }
  }, []);

  useEffect(() => {
    if (!open || preview || !token) return;
    let cancelled = false;
    const load = () =>
      getLinkMessages(token)
        .then((t) => !cancelled && setThread(t))
        .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your messages."));
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, preview, token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread?.items.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || preview) return;
    setBusy(true);
    setError(null);
    try {
      setThread(await sendLinkMessage(token, text));
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div id="messages" className="mt-8 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-semibold text-maroon underline-offset-4 hover:underline dark:text-gold"
        >
          Questions? Message {vendorName}
        </button>
      </div>
    );
  }

  const items = thread?.items ?? [];
  return (
    <section id="messages" aria-label={`Messages with ${vendorName}`} className="mt-8">
    <Card className="p-5 text-left">
      <h2 className="serif text-lg text-ink">Messages with {vendorName}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {vendorName} reads these in Jorna and replies here. We&apos;ll email you when they do.
      </p>

      {preview ? (
        <p className="mt-4 text-sm text-ink-faint">
          Preview — your client can message you from here. Their messages arrive in your Messages.
        </p>
      ) : (
        <div className="mt-4 grid max-h-80 gap-2.5 overflow-y-auto" role="log" aria-live="polite">
          {thread && items.length === 0 ? (
            <p className="text-sm text-ink-faint">No messages yet. Ask anything about your booking.</p>
          ) : null}
          {items.map((m) => (
            <div key={m.message_id} className={`flex ${m.from === "you" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.from === "you" ? "bg-maroon text-ground dark:bg-gold dark:text-ink" : "bg-ground-2 text-ink"
                }`}
              >
                <p className="whitespace-pre-line">{m.content}</p>
                <p className={`mt-1 text-[11px] ${m.from === "you" ? "opacity-75" : "text-ink-faint"}`}>
                  {m.from === "you" ? "You" : m.sender_name} · {when(m.created_at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {canWrite ? (
        <form onSubmit={send} className="mt-4 grid gap-2">
          <label className="sr-only" htmlFor="link-message">
            Message {vendorName}
          </label>
          <textarea
            id="link-message"
            rows={3}
            maxLength={4000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Write to ${vendorName}…`}
            disabled={preview}
            className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold"
          />
          {error ? <p className="text-sm text-maroon dark:text-gold">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || preview || !draft.trim()}>
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      ) : error ? (
        <p className="mt-3 text-sm text-maroon dark:text-gold">{error}</p>
      ) : null}
    </Card>
    </section>
  );
}
