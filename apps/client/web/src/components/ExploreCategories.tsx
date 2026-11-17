"use client";

// Explore's "Browse by category" row (the Jorna-Client design): seven icon
// tiles for what most people look for first, and an eighth, More, that opens a
// picker over the whole taxonomy. Each tile is a group or a service key — the
// same thing the search API's `service` takes — so a tile and a pick from the
// picker filter identically. Picking something with no tile of its own lights
// More and puts its name there.

import { useMemo, useState, type ReactNode } from "react";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { findService, groupOf, searchServices, type Taxonomy } from "@jorna/shared/lib/taxonomy";
import { Bar, SkeletonBody } from "@/components/Skeletons";

const ICONS: Record<string, ReactNode> = {
  camera: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="m8 6 1.5-2h5L16 6" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  catering: <path d="M6 3v7M9 3v7M6 7h3M7.5 10v11M16 3v18M16 3c4 3 4 8 0 10" />,
  music: (
    <>
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  decor: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="m5.6 5.6 12.8 12.8M18.4 5.6 5.6 18.4" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  mehndi: (
    <path d="M7 12V5a2 2 0 0 1 4 0v5-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2a2 2 0 0 1 3-1Z" />
  ),
  makeup: (
    <>
      <path d="m7 3 7 7-7 7-4-4Z" />
      <path d="m14 10 6 6-5 5-6-6" />
    </>
  ),
  venue: <path d="M4 21V9l8-6 8 6v12M2 21h20M9 21v-7h6v7" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

/** The design's tiles, each mapped onto the taxonomy. DJ lives under
 *  Entertainment there, not Music, so "DJ & Music" is the DJ service. */
export const CATEGORY_TILES: { key: string; label: string; icon: string }[] = [
  { key: "photo_video", label: "Photography", icon: "camera" },
  { key: "food_drink", label: "Catering", icon: "catering" },
  { key: "dj", label: "DJ & Music", icon: "music" },
  { key: "decor_florals", label: "Decor", icon: "decor" },
  { key: "mehndi_artist", label: "Mehndi", icon: "mehndi" },
  { key: "bridal_makeup", label: "Makeup", icon: "makeup" },
  { key: "venues", label: "Venues", icon: "venue" },
];

/** The tile a pick belongs to: its own, or its group's (a photographer is
 *  still Photography). Null when only More covers it. */
export function tileFor(tax: Taxonomy | null, pick: string): string | null {
  if (!pick) return null;
  if (CATEGORY_TILES.some((t) => t.key === pick)) return pick;
  const group = tax ? groupOf(tax, pick) : null;
  return group && CATEGORY_TILES.some((t) => t.key === group.key) ? group.key : null;
}

function labelOf(tax: Taxonomy | null, key: string): string {
  if (!tax) return key;
  return tax.groups.find((g) => g.key === key)?.label ?? findService(tax, key)?.label ?? key;
}

const tileClass = (active: boolean) =>
  `flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-2 rounded-[14px] border px-1 py-2.5 text-center text-[0.7rem] font-bold leading-tight transition sm:min-h-[104px] sm:p-2.5 sm:text-[0.78rem] ${
    active
      ? "border-maroon bg-maroon/[0.07] text-maroon shadow-[inset_0_0_0_1px_var(--color-maroon)] dark:border-gold dark:bg-gold/10 dark:text-gold dark:shadow-[inset_0_0_0_1px_var(--color-gold)]"
      : "border-line bg-card text-ink hover:border-gold"
  }`;

export function CategoryTiles({
  taxonomy,
  pick,
  onPick,
}: {
  taxonomy: Taxonomy | null;
  pick: string;
  onPick: (key: string | null) => void;
}) {
  const [picker, setPicker] = useState(false);
  const tile = tileFor(taxonomy, pick);
  const more = pick !== "" && tile === null;

  return (
    <>
      <div role="group" aria-label="Browse by category" className="grid grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-[9px]">
        {CATEGORY_TILES.map((t) => {
          const active = tile === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? null : t.key)}
              className={tileClass(active)}
            >
              <span className={active ? "" : "text-gold"}>
                <Icon name={t.icon} />
              </span>
              <span className="line-clamp-2 w-full">{t.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={more}
          aria-haspopup="dialog"
          onClick={() => setPicker(true)}
          className={tileClass(more)}
        >
          <span className={more ? "" : "text-gold"}>
            <Icon name="plus" />
          </span>
          <span className="line-clamp-2 w-full">{more ? labelOf(taxonomy, pick) : "More"}</span>
        </button>
      </div>
      {picker ? (
        <CategoryPicker
          taxonomy={taxonomy}
          pick={pick}
          onClose={() => setPicker(false)}
          onPick={(key) => {
            onPick(key);
            setPicker(false);
          }}
        />
      ) : null}
    </>
  );
}

function CategoryPicker({
  taxonomy,
  pick,
  onPick,
  onClose,
}: {
  taxonomy: Taxonomy | null;
  pick: string;
  onPick: (key: string | null) => void;
  onClose: () => void;
}) {
  const ref = useOverlay<HTMLDivElement>(true, onClose);
  const [q, setQ] = useState("");
  const matches = useMemo(
    () => (taxonomy && q.trim() ? searchServices(taxonomy, q.trim(), 20) : null),
    [taxonomy, q],
  );
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition ${
      active ? "border-maroon bg-maroon text-ground dark:border-gold dark:bg-gold dark:text-ink" : "border-line bg-card text-ink hover:border-gold"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="All categories"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-ground outline-none shadow-[0_0_60px_rgba(67,27,24,0.25)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">All categories</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-soft hover:text-ink">
            Close
          </button>
        </div>
        <div className="border-b border-line px-5 py-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search services — dhol, florist, pandit…"
            aria-label="Search categories"
            className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
          />
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {!taxonomy ? (
            <SkeletonBody label="Loading categories…" className="grid gap-5">
              {[5, 3, 4].map((n, i) => (
                <div key={i} className="grid gap-2">
                  <Bar className="h-2.5 w-24" />
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: n }, (_, j) => (
                      <div key={j} className="h-8 w-24 rounded-full bg-line-soft" />
                    ))}
                  </div>
                </div>
              ))}
            </SkeletonBody>
          ) : matches ? (
            matches.length ? (
              <div className="flex flex-wrap gap-2">
                {matches.map(({ service, group }) => (
                  <button key={service.key} type="button" onClick={() => onPick(service.key)} className={chip(pick === service.key)}>
                    {service.label}
                    <span className="ml-1.5 text-xs opacity-70">{group.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">Nothing matches “{q.trim()}”.</p>
            )
          ) : (
            <div className="grid gap-5">
              <div>
                <button type="button" onClick={() => onPick(null)} className={chip(pick === "")}>
                  Everything
                </button>
              </div>
              {taxonomy.groups.map((g) => (
                <section key={g.key} aria-label={g.label}>
                  <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{g.label}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {g.services.length > 1 ? (
                      <button type="button" onClick={() => onPick(g.key)} className={chip(pick === g.key)}>
                        All {g.label.toLowerCase()}
                      </button>
                    ) : null}
                    {g.services.map((s) => (
                      <button key={s.key} type="button" onClick={() => onPick(s.key)} className={chip(pick === s.key)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
