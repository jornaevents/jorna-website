"use client";

// A self-contained city autocomplete. Suggests from lib/cities as you type;
// picking one reports its coordinates so the caller can send lat/lng. Free text
// is always allowed — typing something not in the list just reports null coords.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CITIES, type City } from "@/lib/cities";

export interface Coords {
  lat: number;
  lng: number;
}

export function CityCombobox({
  label,
  value,
  onChange,
  icon,
  placeholder,
  required,
}: {
  /** Omit when the caller draws its own header — see Field. */
  label?: string;
  value: string;
  /** coords is set only when a suggestion is picked; null for free text. */
  onChange: (value: string, coords: Coords | null) => void;
  icon?: ReactNode;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo<City[]>(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    const starts: City[] = [];
    const contains: City[] = [];
    for (const c of CITIES) {
      const name = c.name.toLowerCase();
      const full = `${name}, ${c.state.toLowerCase()}`;
      if (name.startsWith(q) || full.startsWith(q)) starts.push(c);
      else if (name.includes(q)) contains.push(c);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [value]);

  // Close when clicking away.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function select(c: City) {
    onChange(`${c.name}, ${c.state}`, { lat: c.lat, lng: c.lng });
    setOpen(false);
  }

  const showList = open && matches.length > 0;

  return (
    <label className="block">
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      ) : null}
      <div className="relative" ref={boxRef}>
        <span className="relative block">
          {icon ? (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
              {icon}
            </span>
          ) : null}
          <input
            className={`w-full rounded-xl border border-card-edge bg-ground-2 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30 ${
              icon ? "pl-10 pr-3.5" : "px-3.5"
            }`}
            placeholder={placeholder}
            value={value}
            required={required}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            onChange={(e) => {
              onChange(e.target.value, null);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                select(matches[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        </span>

        {showList ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-card-edge bg-card py-1 shadow-[var(--shadow-card)]"
          >
            {matches.map((c, i) => (
              <li
                key={`${c.name}-${c.state}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                // mousedown (not click) so selection beats the input's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(c);
                }}
                className={`cursor-pointer px-3.5 py-2 text-sm ${
                  i === active ? "bg-gold/12 text-maroon dark:text-gold" : "text-ink"
                }`}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-ink-faint">, {c.state}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </label>
  );
}
