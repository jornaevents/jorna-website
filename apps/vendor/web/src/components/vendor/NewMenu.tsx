"use client";

// The one "New" button every vendor page header carries. It replaced four
// buttons — "New contract", "New lead", "New booking" — that all opened the
// same contract editor under different names, which left vendors wondering
// whether a lead and a booking were different starting points. They aren't:
// the backend runs them as one pipeline.
//
// Two ways in: send a contract, or share the inquiry form so a client can
// reach out (what they send lands on Leads as an inquiry, and "Create
// contract" there converts it). The form used to have its own button on
// Leads beside an "Add a client" item here; the form took that item's place
// (2026-11), so it's one click from every page. Leads puts it first;
// everywhere else the contract leads.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { myVendor } from "@/lib/vendorData";
import { InquiryShareDrawer } from "@/components/vendor/InquiryShare";
import { primaryClass } from "@/components/vendor/ui";
import { Icon } from "@/components/vendor/Icon";

type Choice = "contract" | "inquiry";

const itemClass =
  "grid w-full gap-0.5 rounded-[9px] px-3 py-2.5 text-left transition hover:bg-panel focus-visible:bg-panel focus-visible:outline-none";

export function NewMenu({
  first = "contract",
}: {
  /** Which choice leads the menu: the page's most likely next step. */
  first?: Choice;
}) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  // The form's link needs the vendor's id. Every page with this menu has
  // already asked for the vendor, so this is the remembered answer, not
  // another request.
  const [vendorId, setVendorId] = useState<string | null>(null);
  // Opens toward the room it has: right-aligned under a button at the end of
  // the header, left-aligned when a narrow header wraps it to the start.
  const [alignLeft, setAlignLeft] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    myVendor()
      .then((v) => !cancelled && setVendorId(v?.vendor_id ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // A small menu, not a sheet: close on Escape or a click outside, and leave
  // the page scrolling (useOverlay would lock it).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const contract = (
    <Link key="contract" href="/contracts/new" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
      <span className="text-sm font-semibold text-ink">Send a contract</span>
      <span className="text-xs text-ink-faint">Write it from your usual terms and send the link.</span>
    </Link>
  );
  // Left out until the vendor's id is known, rather than offered and dead.
  const inquiry = vendorId ? (
    <button
      key="inquiry"
      type="button"
      role="menuitem"
      className={itemClass}
      onClick={() => {
        setOpen(false);
        setSharing(true);
      }}
    >
      <span className="text-sm font-semibold text-ink">Share inquiry form</span>
      <span className="text-xs text-ink-faint">A link and QR code clients use to ask about their event.</span>
    </button>
  ) : null;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          setAlignLeft(e.currentTarget.getBoundingClientRect().right < 18 * 16);
          setOpen((o) => !o);
        }}
        className={primaryClass}
      >
        <Icon name="plus" size={16} />
        New
        <Icon name="chevron" size={14} className={`transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="New"
          className={`absolute ${alignLeft ? "left-0" : "right-0"} z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-card-edge bg-card p-1.5 shadow-[0_16px_40px_rgba(42,12,25,0.16)]`}
        >
          {first === "inquiry" ? [inquiry, contract] : [contract, inquiry]}
        </div>
      ) : null}
      {vendorId ? <InquiryShareDrawer open={sharing} vendorId={vendorId} onClose={() => setSharing(false)} /> : null}
    </div>
  );
}
