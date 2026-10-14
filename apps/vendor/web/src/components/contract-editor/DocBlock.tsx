"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LayoutBlock } from "@/lib/types";
import { BLOCK_LABEL } from "./shared";

/**
 * One block of the document, with its label and a "⋯" menu that moves it,
 * adds a section below it or removes it.
 *
 * The menu used to be four always-on buttons (↑ ↓ "+ Section below"
 * "Remove") on every block: clutter on a page meant to read like the
 * contract, and small targets on a phone. On wide screens it now shows only
 * on the block you're hovering or working in; a phone has no hover, so there
 * it stays, as one button.
 *
 * Problems show under the block that has them (plan 2.3b), but only once
 * `showIssues` — the vendor has left the block or pressed Send — so a block
 * isn't flagged as wrong while it's being filled in.
 */
export function DocBlock({
  block,
  index,
  count,
  issues,
  notes = [],
  showIssues,
  onLeave,
  onMove,
  onAddBelow,
  onRemove,
  children,
}: {
  block: LayoutBlock;
  index: number;
  count: number;
  /** What's stopping this block from being sent. */
  issues: string[];
  /** Worth a second look, but not stopping anything — always shown. */
  notes?: string[];
  showIssues: boolean;
  /** Focus left the block — its problems may show from now on. */
  onLeave: () => void;
  onMove: (delta: -1 | 1) => void;
  onAddBelow: () => void;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const label = BLOCK_LABEL[block.type];
  const lower = label.toLowerCase();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const flagged = showIssues && issues.length > 0;

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const item = "block w-full rounded-md px-3 py-2 text-left text-sm text-ink-soft hover:bg-panel hover:text-ink disabled:opacity-40";

  return (
    <section
      id={`block-${block.id}`}
      aria-label={label}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
      }}
      className={`group relative scroll-mt-24 border-t border-line-soft py-6 first:border-t-0 ${flagged ? "-mx-3 rounded-lg px-3 ring-1 ring-maroon/30 dark:ring-gold/40" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
        <div
          ref={menuRef}
          className={`relative ${menu ? "" : "sm:invisible sm:group-focus-within:visible sm:group-hover:visible"}`}
        >
          <button
            type="button"
            aria-label={`${label} options`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="grid h-8 w-9 place-items-center rounded-lg text-lg leading-none text-ink-faint hover:bg-panel hover:text-ink"
          >
            ⋯
          </button>
          {menu ? (
            <div
              role="menu"
              aria-label={`${label} options`}
              className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-card-edge bg-card p-1 shadow-[0_12px_32px_rgba(42,12,25,0.14)]"
            >
              <button type="button" role="menuitem" disabled={index === 0} onClick={act(() => onMove(-1))} className={item}>
                Move {lower} up
              </button>
              <button type="button" role="menuitem" disabled={index === count - 1} onClick={act(() => onMove(1))} className={item}>
                Move {lower} down
              </button>
              <button type="button" role="menuitem" onClick={act(onAddBelow)} className={item}>
                Add a section below
              </button>
              {onRemove ? (
                <button type="button" role="menuitem" onClick={act(onRemove)} className={`${item} hover:text-maroon`}>
                  Remove
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {children}
      {notes.length ? (
        <ul className="mt-3 grid gap-1 text-sm text-ink-soft">
          {notes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {flagged ? (
        <ul className="mt-3 grid gap-1 text-sm text-maroon dark:text-gold">
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
