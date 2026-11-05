"use client";

// "Show AI summaries" — the account setting behind the inbox's AI lines
// (backend users.ai_summaries_enabled, DECISIONS #43). It only hides them for
// this person; it doesn't keep their messages out of other members' lines,
// which is what the copy says, because that's what the Privacy Policy says.
//
// The caller saves (each app has its own updateMe and user cache), so this
// stays free of either app's lib.

import { useState } from "react";
import { Card } from "./ui";

export function AiSummarySetting({
  enabled,
  onChange,
  className = "",
}: {
  enabled: boolean;
  onChange: (next: boolean) => Promise<void>;
  className?: string;
}) {
  // The box moves as soon as it's clicked, not when the save comes back; a
  // failed save puts it back to what the server has (`enabled`).
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = pending !== null;

  async function toggle(next: boolean) {
    setPending(next);
    setError(null);
    try {
      await onChange(next);
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className={`p-6 ${className}`}>
      <h2 className="serif text-xl text-ink">Messages</h2>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-gold"
          checked={pending ?? enabled}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-ink">Show AI summaries</span>
          <span className="mt-0.5 block text-sm text-ink-soft">
            When a chat has several new messages, your inbox shows a one-line AI summary
            instead of the last message. Summaries can miss details. Turning this off hides
            them for you only.
          </span>
        </span>
      </label>
      {error ? (
        <p className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
