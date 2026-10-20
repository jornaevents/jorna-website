"use client";

// The persistent shell for the vendor app (see app/(vendor)/layout.tsx and
// VendorShellIfVendor): the burgundy rail from the Figma Make "Wedding Vendor
// Dashboard" design, and the .vendor-shell root that scopes the design's
// palette and fonts (app/vendor-shell.css) to the vendor pages only.
//
// Below lg the rail becomes a top bar with a hamburger that opens the same
// nav full-screen. The design's own phone layout is a bottom tab bar, but
// eight destinations plus Settings don't fit one row at a readable size.
//
// The light/dark toggle that used to sit in the rail moved to Settings.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { getMyVendor, getNewBookingsCount, getPipeline, getUnreadCount, listMyServices } from "@/lib/jorna";
import { BOOKINGS_SEEN_EVENT } from "@/lib/newBookings";
import { loadAttention } from "@/lib/attention";
import { categoryLabel, type VendorDetail } from "@/lib/types";
import { dmSans, manrope } from "@/lib/vendorFonts";
import { Avatar } from "@jorna/shared/components/ui";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { Icon, type IconName } from "@/components/vendor/Icon";
import "@/app/vendor-shell.css";

interface SidebarItem {
  href: string;
  label: string;
  icon: IconName;
  match: (pathname: string) => boolean;
  badge?: "leads" | "messages" | "bookings";
}

const prefix = (...paths: string[]) => (pathname: string) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// Order agreed 2026-10-20. The vendor's profile isn't in this list: the
// profile card at the bottom of the rail opens it.
const ITEMS: SidebarItem[] = [
  { href: "/overview", label: "Overview", icon: "overview", match: prefix("/overview") },
  { href: "/my-bookings", label: "Bookings", icon: "bookings", match: prefix("/my-bookings"), badge: "bookings" },
  { href: "/leads", label: "Leads", icon: "leads", match: prefix("/leads"), badge: "leads" },
  // A thread lives at /conversation, so it keeps Messages lit too.
  {
    href: "/messages",
    label: "Messages",
    icon: "messages",
    match: prefix("/messages", "/conversation"),
    badge: "messages",
  },
  { href: "/contracts", label: "Contracts", icon: "contract", match: prefix("/contracts") },
  { href: "/my-calendar", label: "Calendar", icon: "calendar", match: prefix("/my-calendar") },
  { href: "/my-earnings", label: "Earnings", icon: "earnings", match: prefix("/my-earnings") },
];

const onProfile = prefix("/vendor-profile");

const SETTINGS: SidebarItem = {
  href: "/settings",
  label: "Settings",
  icon: "settings",
  match: prefix("/settings"),
};

function NavLink({
  item,
  active,
  badge,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  badge: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      style={{
        color: active ? "white" : "var(--rail-ink)",
        background: active ? "var(--rail-active)" : undefined,
        boxShadow: active ? "inset 3px 0 var(--rail-gold)" : undefined,
      }}
      className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition hover:bg-[var(--rail-hover)] hover:text-white"
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {badge > 0 ? (
        <span
          style={{ background: "#d5b768", color: "var(--rail-bg)" }}
          className="ml-auto grid h-[21px] min-w-[21px] place-items-center rounded-[7px] px-1 text-[0.68rem] font-bold"
        >
          <span className="sr-only">, </span>
          {badge > 99 ? "99+" : badge}
          <span className="sr-only">
            {" "}
            {item.badge === "messages" ? "unread" : item.badge === "bookings" ? "new" : badge === 1 ? "needs you" : "need you"}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/overview" className="flex items-center gap-3 text-white">
      <span
        style={{ background: "var(--rail-gold)", color: "var(--rail-bg)" }}
        className="grid size-[35px] place-items-center rounded-[11px]"
      >
        <Icon name="sparkles" size={20} />
      </span>
      <span className="serif text-[1.05rem] font-bold tracking-[-0.02em]">Jorna</span>
    </Link>
  );
}

// The query string, read during render: a contract started from a lead or a
// request (/contracts/new?lead= or ?request=) belongs to Leads in the nav.
// Read this way rather than with useSearchParams, which would need its own
// Suspense boundary in this always-mounted layout; a client navigation
// re-renders the sidebar through usePathname anyway.
const subscribeToHistory = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

export function VendorSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const search = useSyncExternalStore(subscribeToHistory, () => window.location.search, () => "");
  const fromLeads = pathname.startsWith("/contracts/new") && /[?&](lead|request)=/.test(search);
  const isActive = (item: SidebarItem) => {
    if (item.href === "/leads") return item.match(pathname) || fromLeads;
    if (item.href === "/contracts") return item.match(pathname) && !fromLeads;
    return item.match(pathname);
  };
  const { logout } = useAuth();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [leadsBadge, setLeadsBadge] = useState(0);
  const [messagesBadge, setMessagesBadge] = useState(0);
  const [bookingsBadge, setBookingsBadge] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useOverlay<HTMLDivElement>(menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    // Once per mount: this lives in app/(vendor)/layout.tsx, which Next keeps
    // mounted across vendor routes, and the name/category rarely change.
    let cancelled = false;
    getMyVendor()
      .then((v) => {
        if (cancelled) return;
        setVendor(v);
        // The vendor pages wait for a first package (#162, decided
        // 2026-10-14): until then it's the setup wizard only. Any package
        // counts, archived too, so a vendor who retired them all isn't sent
        // back to setup. A failed check leaves them where they are.
        if (v) {
          listMyServices(v.vendor_id)
            .then((svc) => {
              if (!cancelled && svc.items.length === 0) router.replace("/vendor-onboarding");
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    // Re-checked on navigation so the badge follows you as you act on things:
    // the pipeline's "needs your attention", the same count the Leads page
    // shows. lib/attention's count stands in if the pipeline can't be read.
    let cancelled = false;
    getPipeline()
      .then((p) => !cancelled && setLeadsBadge(p.counts.needs_you))
      .catch(() =>
        loadAttention()
          .then((items) => !cancelled && setLeadsBadge(items.length))
          .catch(() => {}),
      );
    getUnreadCount()
      .then((r) => !cancelled && setMessagesBadge(r.unread_count))
      .catch(() => {});
    // Bookings a client signed that the vendor hasn't opened (backend
    // DECISIONS #30). Opening one on the Bookings page doesn't navigate, so
    // that page says so with an event and the count is read again.
    const loadNew = () =>
      getNewBookingsCount()
        .then((r) => !cancelled && setBookingsBadge(typeof r.count === "number" ? r.count : 0))
        .catch(() => {});
    loadNew();
    window.addEventListener(BOOKINGS_SEEN_EVENT, loadNew);
    return () => {
      cancelled = true;
      window.removeEventListener(BOOKINGS_SEEN_EVENT, loadNew);
    };
  }, [pathname]);

  const name = [vendor?.f_name, vendor?.l_name].filter(Boolean).join(" ");
  const category = vendor?.category ? categoryLabel(vendor.subcategory || vendor.category) : null;
  const badgeFor = (item: SidebarItem) =>
    item.badge === "leads"
      ? leadsBadge
      : item.badge === "messages"
        ? messagesBadge
        : item.badge === "bookings"
          ? bookingsBadge
          : 0;
  const close = () => setMenuOpen(false);

  const mainNav = (onNavigate?: () => void) => (
    <div>
      <p style={{ color: "var(--rail-ink-soft)" }} className="px-3 pb-2.5 text-[0.65rem] font-bold uppercase tracking-[0.14em]">
        Workspace
      </p>
      <nav aria-label="Vendor" className="grid gap-1">
        {ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item)}
            badge={badgeFor(item)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </div>
  );

  const footer = (onNavigate?: () => void) => (
    <div className="mt-8 grid gap-2">
      <NavLink item={SETTINGS} active={SETTINGS.match(pathname)} badge={0} onNavigate={onNavigate} />
      <Link
        href="/vendor-profile"
        onClick={onNavigate}
        aria-label={`Your profile: ${name || "Your business"}`}
        aria-current={onProfile(pathname) ? "page" : undefined}
        style={{
          background: "var(--rail-hover)",
          borderColor: onProfile(pathname) ? "var(--rail-gold)" : "var(--rail-edge)",
        }}
        className="flex items-center gap-2.5 rounded-xl border p-2.5 text-white transition hover:brightness-110"
      >
        <Avatar src={vendor?.pfp_url} name={name} size={36} />
        <span className="grid min-w-0">
          <strong className="truncate text-[0.8rem]">{name || "Your business"}</strong>
          {category ? (
            <small style={{ color: "var(--rail-ink-soft)" }} className="mt-0.5 truncate text-[0.7rem]">
              {category}
            </small>
          ) : null}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => logout()}
        style={{ color: "var(--rail-ink-soft)" }}
        className="flex items-center gap-2.5 px-3 py-2 text-xs transition hover:text-white"
      >
        <Icon name="logout" size={16} />
        Sign out
      </button>
    </div>
  );

  return (
    <div className={`vendor-shell ${dmSans.variable} ${manrope.variable} lg:grid lg:grid-cols-[236px_minmax(0,1fr)]`}>
      <aside
        style={{ background: "var(--rail-bg)" }}
        className="sticky top-0 hidden h-screen flex-col justify-between overflow-y-auto px-[18px] pb-5 pt-[31px] lg:flex"
      >
        <div>
          <div className="px-2.5 pb-9">
            <Brand />
          </div>
          {mainNav()}
        </div>
        {footer()}
      </aside>

      {/* Phones and tablets: a top bar, and the same nav as a full-screen sheet. */}
      <div
        style={{ background: "var(--rail-bg)" }}
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden"
      >
        <Brand />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          style={{ color: "var(--rail-ink)" }}
          className="relative grid size-11 place-items-center rounded-[10px]"
        >
          <Icon name="menu" size={22} />
          {leadsBadge + messagesBadge + bookingsBadge > 0 ? (
            <span
              aria-hidden="true"
              style={{ background: "var(--rail-gold)" }}
              className="absolute right-2 top-2 size-2 rounded-full"
            />
          ) : null}
        </button>
      </div>
      {menuOpen ? (
        <div
          ref={menuRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          style={{ background: "var(--rail-bg)" }}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:hidden"
        >
          <div className="flex items-center justify-between pb-6">
            <Brand />
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              style={{ color: "var(--rail-ink)" }}
              className="grid size-11 place-items-center rounded-[10px]"
            >
              <Icon name="close" size={22} />
            </button>
          </div>
          {mainNav(close)}
          {footer(close)}
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="mx-auto w-full max-w-[var(--container-wide)] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">{children}</div>
      </div>
    </div>
  );
}
