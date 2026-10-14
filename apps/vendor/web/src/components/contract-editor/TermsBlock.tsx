"use client";

import type { ClauseDraft } from "@jorna/shared/lib/contractDraft";

/** One of the vendor's own terms sections, edited as it will read. */
export function TermsBlock({
  clause: c,
  onChange,
  placeholder = "What you're agreeing to, in plain words. Blank lines start a new paragraph.",
}: {
  clause: ClauseDraft;
  onChange: (patch: Partial<ClauseDraft>) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <input
        aria-label="Title"
        value={c.title}
        placeholder="Section title"
        onChange={(e) => onChange({ title: e.target.value })}
        className="serif w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-lg text-ink outline-none placeholder:text-ink-faint focus:border-gold"
      />
      <textarea
        aria-label="Section text"
        rows={Math.min(12, Math.max(3, Math.ceil(c.body.length / 80) + c.body.split("\n").length))}
        value={c.body}
        placeholder={placeholder}
        onChange={(e) => onChange({ body: e.target.value })}
        className="w-full resize-y rounded-lg border border-transparent bg-transparent px-0 py-1 text-[0.95rem] leading-relaxed text-ink-soft outline-none transition placeholder:text-ink-faint hover:border-line-soft focus:border-gold focus:bg-ground-2 focus:px-3"
      />
    </div>
  );
}
