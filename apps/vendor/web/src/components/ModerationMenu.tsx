"use client";

import { useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { blockUser, reportContent } from "@/lib/jorna";
import { REPORT_REASONS, type ReportTargetType } from "@/lib/types";
import { Button } from "@jorna/shared/components/ui";

/**
 * Report or block, for App Store guideline 1.2 (a way to flag content and users).
 * The backend hides a blocked user from search and hides their reviews/messages,
 * so blocking here is enough — no client-side filtering needed.
 */
export function ModerationMenu({
  targetType,
  targetId,
  blockUserId,
  label = "this vendor",
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** The user to block (e.g. a vendor's owner user_id). Omit to hide Block. */
  blockUserId?: string;
  label?: string;
}) {
  const [mode, setMode] = useState<"idle" | "report">("idle");
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"reported" | "blocked" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitReport() {
    setBusy(true);
    setError(null);
    try {
      await reportContent({ target_type: targetType, target_id: targetId, reason, details });
      setDone("reported");
      setMode("idle");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit the report.");
    } finally {
      setBusy(false);
    }
  }

  async function doBlock() {
    if (!blockUserId) return;
    setBusy(true);
    setError(null);
    try {
      await blockUser(blockUserId);
      setDone("blocked");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't block.");
    } finally {
      setBusy(false);
    }
  }

  if (done === "blocked") {
    return (
      <p className="text-xs text-ink-faint">
        Blocked. You won&apos;t see {label} anymore. Manage this under Settings → Blocked people.
      </p>
    );
  }

  return (
    <div>
      {done === "reported" ? (
        <p className="mb-2 text-xs text-green">Thanks — our team will review this.</p>
      ) : null}

      {mode === "report" ? (
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-ink-soft">Why are you reporting {label}?</p>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-2 w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          >
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Any details (optional)"
            className="mt-2 w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          />
          {error ? <p className="mt-1 text-xs text-maroon dark:text-gold">{error}</p> : null}
          <div className="mt-2 flex gap-2">
            <Button size="md" disabled={busy} onClick={submitReport}>
              {busy ? "Submitting…" : "Submit report"}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("report")}
            className="text-xs text-ink-faint hover:text-ink"
          >
            Report {label}
          </button>
          {blockUserId ? (
            <button
              type="button"
              disabled={busy}
              onClick={doBlock}
              className="text-xs text-ink-faint hover:text-maroon dark:hover:text-gold"
            >
              Block
            </button>
          ) : null}
          {error ? <span className="text-xs text-maroon dark:text-gold">{error}</span> : null}
        </div>
      )}
    </div>
  );
}
