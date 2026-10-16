"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@jorna/shared/components/ui";
import { inputClass } from "./shared";

/**
 * The editor header's "⋯" menu: start from a saved template, write this one
 * back to the template it started from, or save it as a new template. Templates used to sit in the side rail under the policies,
 * taking room from Send on every contract for something used now and then.
 */
export function EditorMenu({
  templates,
  canPick,
  onPick,
  onSave,
  updating,
  onUpdate,
}: {
  /** Packages' templates and the vendor's own (lib/templateChoices). */
  templates: { id: string; name: string }[];
  /** Only a new contract starts from a template. */
  canPick: boolean;
  onPick: (templateId: string) => void;
  /** Resolves true once saved, so the menu can close. */
  onSave: (name: string) => Promise<boolean>;
  /** The template this contract started from, which Update writes back to
   *  (its items, payments and terms — never the client or event). */
  updating?: string | null;
  onUpdate?: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save() {
    if (!templateName.trim()) return;
    if (await onSave(templateName.trim())) {
      setTemplateName("");
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-[11px] border border-line text-lg text-ink-soft transition hover:text-ink"
      >
        ⋯
      </button>
      {open ? (
        <div
          role="group"
          aria-label="Templates"
          className="absolute right-0 z-30 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-3 rounded-xl border border-card-edge bg-card p-4 shadow-[0_16px_40px_rgba(42,12,25,0.16)]"
        >
          {canPick && templates.length > 0 ? (
            <label className="grid gap-1 text-sm text-ink-soft">
              <span>Start from a template</span>
              <select
                defaultValue=""
                onChange={(e) => {
                  onPick(e.target.value);
                  setOpen(false);
                }}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {updating && onUpdate ? (
            <div className="grid gap-1 text-sm text-ink-soft">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={async () => {
                  if (await onUpdate()) setOpen(false);
                }}
              >
                Update “{updating}”
              </Button>
              <span className="text-xs text-ink-faint">
                Contracts you start from it will begin like this one, without the client and event.
              </span>
            </div>
          ) : null}
          <div className="grid gap-1 text-sm text-ink-soft">
            <span>Save as a template</span>
            <div className="flex gap-2">
              <input
                aria-label="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
                placeholder="e.g. Standard DJ package"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <Button type="button" variant="ghost" size="md" onClick={save} disabled={!templateName.trim()}>
                Save template
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
