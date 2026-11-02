"use client";

// "Ask a question" — the first thing a client wants and the last thing the app
// offered. Until this, there was no route from a listing to the vendor selling
// it: you could book them, and that was the only way to speak to them.
//
// The thread is one per client and vendor, so a second question about a
// different package continues the first conversation. The listing rides along
// on the message as a reference card — see askVendor.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { askVendor } from "@/lib/jorna";
import { Button } from "@jorna/shared/components/ui";
import { signInUrl } from "@/lib/vendorSite";

export function AskVendor({
  vendorId,
  serviceId,
  serviceName,
  className = "",
}: {
  vendorId: string;
  /** The listing this was opened from, when it was opened from one. */
  serviceId?: string;
  serviceName?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    try {
      const { conversation_id } = await askVendor(vendorId, content, serviceId);
      router.push(`/conversation?id=${conversation_id}`);
    } catch (err) {
      // The server's refusals here are written to be read — "you have 3
      // questions still waiting for an answer" is the whole explanation, and
      // replacing it with "something went wrong" would leave a client
      // wondering what they'd done.
      setError(
        err instanceof ApiError ? err.message : "Couldn't send that. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <Button
        variant="ghost"
        className={className}
        onClick={() => window.location.assign(signInUrl("/marketplace"))}
      >
        Ask a question
      </Button>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" className={className} onClick={() => setOpen(true)}>
        Ask a question
      </Button>
    );
  }

  return (
    <div className={`rounded-2xl border border-card-edge bg-panel p-4 ${className}`}>
      <p className="text-sm font-medium text-ink">
        Ask a question
        {serviceName ? (
          <span className="font-normal text-ink-soft"> about {serviceName}</span>
        ) : null}
      </p>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        rows={3}
        placeholder="Are you free on the 14th? Do you travel to Sacramento?"
        className="mt-2 w-full resize-none rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold"
      />
      <p className="mt-1 text-xs text-ink-faint">
        This doesn&apos;t book anything — it opens a chat with them.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-maroon dark:text-gold">{error}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button size="md" disabled={busy || !draft.trim()} onClick={() => void send()}>
          {busy ? "Sending…" : "Send"}
        </Button>
        <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
