"use client";

// Choosing services from the taxonomy (backend DECISIONS #35), the same way
// everywhere: type to search (synonyms included — "mehendi", "pandit"), or
// pick from the popular chips, or browse every group. Multi for a vendor's
// specialties, single for a package's service.
//
// A combobox: the input owns focus; arrow keys move through the results,
// Enter picks, Escape closes.

import { useId, useMemo, useState } from "react";
import { Chip } from "./ui";
import {
  groupOf,
  popularServices,
  searchServices,
  taxonomyLabel,
  type Taxonomy,
  type TaxonomyService,
} from "../lib/taxonomy";

export function ServicePicker({
  taxonomy,
  value,
  onChange,
  label,
  hint,
  multiple = true,
  max = 20,
  only,
  placeholder = "Search: DJ, mehndi, decorator…",
}: {
  taxonomy: Taxonomy | null;
  value: string[];
  onChange: (next: string[]) => void;
  label: string;
  hint?: string;
  /** Several services (a vendor's specialties) or one (a package's). */
  multiple?: boolean;
  max?: number;
  /** Limit the choices to these service keys (a package picks among its vendor's). */
  only?: string[];
  placeholder?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [browsing, setBrowsing] = useState(false);

  const allowed = useMemo(() => (only ? new Set(only) : null), [only]);
  const usable = (s: TaxonomyService) => !allowed || allowed.has(s.key);
  const results = taxonomy && query.trim() ? searchServices(taxonomy, query, 12).filter((m) => usable(m.service)) : [];
  const popular = taxonomy ? popularServices(taxonomy, 12).filter(usable).slice(0, 8) : [];
  const full = multiple && value.length >= max;

  function pick(key: string) {
    if (multiple) {
      if (value.includes(key)) onChange(value.filter((k) => k !== key));
      else if (!full) onChange([...value, key]);
    } else {
      onChange(value[0] === key ? [] : [key]);
    }
    setQuery("");
    setActive(0);
    if (!multiple) setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      pick(results[active].service.key);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && multiple && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const listId = `${id}-results`;
  const showList = open && query.trim().length > 0;

  return (
    <div className="block">
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>

      {value.length ? (
        <ul aria-label="Chosen services" className="mb-2 flex flex-wrap gap-2">
          {value.map((key) => (
            <li key={key}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/12 py-1 pl-3 pr-1.5 text-xs font-semibold text-maroon dark:text-gold">
                {taxonomyLabel(taxonomy, key)}
                <button
                  type="button"
                  aria-label={`Remove ${taxonomyLabel(taxonomy, key)}`}
                  onClick={() => onChange(value.filter((k) => k !== key))}
                  className="grid size-5 place-items-center rounded-full hover:bg-maroon/10"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          disabled={!taxonomy || full}
          value={query}
          placeholder={!taxonomy ? "Loading services…" : full ? `Up to ${max} — remove one to add another` : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold disabled:opacity-60"
        />
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching services"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-card-edge bg-card p-1 shadow-lg"
          >
            {results.length ? (
              results.map((m, i) => (
                <li
                  key={m.service.key}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={value.includes(m.service.key)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(m.service.key);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                    i === active ? "bg-gold/12" : ""
                  }`}
                >
                  <span className="text-ink">{m.service.label}</span>
                  <span className="text-xs text-ink-faint">
                    {value.includes(m.service.key) ? "✓ Chosen" : m.group.label}
                  </span>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-sm text-ink-faint">
                No service matches “{query.trim()}”. Try another word, or browse all.
              </li>
            )}
          </ul>
        ) : null}
      </div>

      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}

      {taxonomy && popular.length ? (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-ink-faint">Popular</p>
          <div className="flex flex-wrap gap-2">
            {popular.map((s) => (
              <Chip key={s.key} active={value.includes(s.key)} onClick={() => pick(s.key)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {taxonomy ? (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={browsing}
            onClick={() => setBrowsing((b) => !b)}
            className="text-sm font-semibold text-gold hover:underline"
          >
            {browsing ? "Hide the full list" : "Browse all services"}
          </button>
          {browsing ? (
            <div className="mt-2 grid gap-3 rounded-xl border border-card-edge bg-card p-3">
              {taxonomy.groups.map((g) => {
                const services = g.services.filter(usable);
                if (!services.length) return null;
                return (
                  <section key={g.key} aria-label={g.label}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">{g.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {services.map((s) => (
                        <Chip key={s.key} active={value.includes(s.key)} onClick={() => pick(s.key)}>
                          {s.label}
                        </Chip>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Music · Dhol player" — a service with its group, for read-only places. */
export function serviceWithGroup(taxonomy: Taxonomy | null, key: string): string {
  const group = taxonomy ? groupOf(taxonomy, key) : null;
  return group ? `${group.label} · ${taxonomyLabel(taxonomy, key)}` : taxonomyLabel(taxonomy, key);
}
