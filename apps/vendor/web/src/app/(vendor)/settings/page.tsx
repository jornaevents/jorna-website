"use client";

// Settings, opened from the sidebar footer: the things a vendor sets once and
// rarely revisits, gathered from where they used to be scattered — account
// details (/account), Venmo/Zelle (the profile page's form), the Google
// Calendar connection (the calendar page, where it also still shows),
// notifications (/activity) and the theme (a toggle in the old sidebar).
// Vendor Profile is left with what couples see.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { ESCROW_ENABLED, PUSH_ENABLED } from "@jorna/shared/lib/flags";
import { getCalendarStatus, getMyVendor, updateMyVendor } from "@/lib/jorna";
import { PageSkeleton, SkeletonBody, SkeletonCard, type PageHeading } from "@/components/vendor/PageSkeleton";
import type { CalendarStatus, VendorDetail } from "@/lib/types";
import Link from "next/link";
import { Button, Card } from "@jorna/shared/components/ui";
import { PushOptIn } from "@jorna/shared/components/PushOptIn";
import { AccountSettings } from "@/components/AccountSettings";
import { GoogleCalendarCard } from "@/components/GoogleCalendarCard";
import { VendorPaymentFields } from "@/components/VendorProfileFields";
import { FilterTabs, PageHeader } from "@/components/vendor/ui";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-9 first:mt-0">
      <h2 className="serif text-lg text-ink">{title}</h2>
      {hint ? <p className="mt-0.5 text-sm text-ink-faint">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Venmo/Zelle: how clients pay this vendor. How long a sent contract holds
 *  the date used to live here too; it's on Contracts → Defaults now. */
function PaymentsAndHolds({ vendor, onSaved }: { vendor: VendorDetail; onSaved: (v: VendorDetail) => void }) {
  // Escrow disabled → manual regardless of what an older vendor row says
  // (VendorPaymentFields normalizes the same way).
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "manual">(
    ESCROW_ENABLED ? (vendor.payment_method ?? "stripe") : "manual",
  );
  const [venmo, setVenmo] = useState(vendor.venmo_handle ?? "");
  const [zelle, setZelle] = useState(vendor.zelle_contact ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = venmo.trim();
    const z = zelle.trim();
    if (paymentMethod === "manual" && !v && !z) {
      setError("Add a Venmo handle or Zelle contact so clients know how to pay you.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyVendor({
        payment_method: paymentMethod,
        venmo_handle: v || null,
        zelle_contact: z || null,
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save these settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="grid gap-4">
        <VendorPaymentFields
          paymentMethod={paymentMethod}
          venmoHandle={venmo}
          zelleContact={zelle}
          onPaymentMethodChange={setPaymentMethod}
          onVenmoHandleChange={setVenmo}
          onZelleContactChange={setZelle}
        />
        <p className="text-sm text-ink-soft">
          How long a sent contract holds the date is on{" "}
          <Link href="/contracts" className="font-semibold text-gold hover:underline">
            Contracts → Defaults
          </Link>
          , with your other contract defaults.
        </p>
        {error ? (
          <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            {error}
          </p>
        ) : null}
        {saved ? <p className="rounded-lg bg-green/10 px-3 py-2 text-sm text-green">Saved.</p> : null}
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const noSubscribe = () => () => {};

function ThemePicker() {
  // The stored choice lives in localStorage, which the prerendered HTML can't
  // know — null there, read for real once hydrated.
  const stored = useSyncExternalStore(noSubscribe, getThemeChoice, () => null);
  const [picked, setPicked] = useState<ThemeChoice | null>(null);
  const choice = picked ?? stored;
  if (!choice) return null;
  return (
    <FilterTabs<ThemeChoice>
      label="Theme"
      value={choice}
      onChange={(next) => {
        setThemeChoice(next);
        setPicked(next);
      }}
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "system", label: "Match device" },
      ]}
    />
  );
}

const HEADING: PageHeading = {
  eyebrow: "Account",
  title: "Settings",
  subtitle: "Your account, how clients pay you, and how Jorna works for you.",
};

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/settings&role=vendor");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyVendor()
      .then((mine) => {
        if (cancelled) return;
        if (!mine) {
          router.replace("/vendor-onboarding");
          return;
        }
        setVendor(mine);
        // Best-effort: without it the card offers to connect, which is still
        // the right button for a vendor who isn't connected.
        getCalendarStatus(mine.vendor_id)
          .then((s) => !cancelled && setCalendar(s))
          .catch(() => {});
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your settings."));
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (authLoading || !user) {
    return (
      <PageSkeleton heading={HEADING} label="Loading your settings…" className="max-w-3xl">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} className="mt-9" />
        <SkeletonCard lines={2} className="mt-9" />
      </PageSkeleton>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader {...HEADING} />

      {error ? (
        <p role="alert" className="mb-6 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <Section title="Account">
        <AccountSettings loginNext="/settings" />
      </Section>

      {vendor ? (
        <>
          <Section title="How clients pay you" hint="Clients pay you directly; this shows on every contract you send.">
            <PaymentsAndHolds vendor={vendor} onSaved={setVendor} />
          </Section>

          <Section title="Google Calendar">
            <GoogleCalendarCard
              vendorId={vendor.vendor_id}
              connected={Boolean(calendar?.google_calendar_connected)}
              writeEnabled={Boolean(calendar?.google_calendar_write_enabled)}
            />
          </Section>
        </>
      ) : error ? null : (
        // The account section above needs no vendor; these two wait for it,
        // in their own places rather than popping in below the theme.
        <>
          <Section title="How clients pay you" hint="Clients pay you directly; this shows on every contract you send.">
            <SkeletonBody label="Loading how clients pay you…">
              <SkeletonCard lines={3} />
            </SkeletonBody>
          </Section>
          <Section title="Google Calendar">
            <SkeletonBody label="Loading your calendar connection…">
              <SkeletonCard lines={2} />
            </SkeletonBody>
          </Section>
        </>
      )}

      {/* The opt-in renders nothing while push is off; an empty section would
          read as broken (#101). */}
      {PUSH_ENABLED ? (
        <Section title="Notifications">
          <PushOptIn showWhenOn />
        </Section>
      ) : null}

      <Section title="Theme">
        <ThemePicker />
      </Section>
    </div>
  );
}
