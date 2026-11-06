"use client";

// Settings, opened from the sidebar footer: the things a vendor sets once and
// rarely revisits, gathered from where they used to be scattered — account
// details (/account), Venmo/Zelle (the profile page's form), notifications
// (/activity), the theme (a toggle in the old sidebar), and the blocked list
// and deleting the account (both from the old /profile hub, now gone).
// Vendor Profile is left with what couples see. The Google Calendar
// connection stays on the calendar page.
//
// Laid out like the rest of the dashboard (2026-11): full width, two columns
// of cards on a wide screen — you on the left, how you work on the right —
// and deleting the account across the foot, on its own.

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { ESCROW_ENABLED, PUSH_ENABLED } from "@jorna/shared/lib/flags";
import { getMyVendor, updateMyVendor } from "@/lib/jorna";
import { PageSkeleton, SkeletonBody, SkeletonCard, type PageHeading } from "@/components/vendor/PageSkeleton";
import type { VendorDetail } from "@/lib/types";
import { Button, Field } from "@jorna/shared/components/ui";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { PushOptIn } from "@jorna/shared/components/PushOptIn";
import { displayName, usePasswordForm, useProfileForm } from "@/components/AccountSettings";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { VendorPaymentFields } from "@/components/VendorProfileFields";
import { FilterTabs, PageHeader } from "@/components/vendor/ui";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "@/lib/theme";

function SettingsCard({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-card-edge bg-card shadow-[var(--shadow-card)]"
    >
      <header className="border-b border-line-soft px-5 py-4 sm:px-6">
        <h2 id={id} className="serif text-lg text-ink">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-faint">{hint}</p> : null}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** One setting on a line: what it is on the left, its control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-sm text-ink-faint">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A form's foot: how the last save went, then its buttons, on the right. */
function FormActions({ error, message, children }: { error?: string | null; message?: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line-soft pt-4">
      {error ? (
        <p role="alert" className="mr-auto text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : message ? (
        <p role="status" className="mr-auto text-sm text-green">
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function ProfileCard() {
  const profile = useProfileForm();
  const { user, fields } = profile;
  if (!user) return null;
  const name = displayName(user);

  return (
    <SettingsCard id="settings-profile" title="Profile" hint="Your name and how Jorna reaches you.">
      <form onSubmit={profile.save} className="grid gap-4">
        <div className="flex items-center gap-4">
          {user.pfp_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.pfp_url} alt="" className="size-14 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-full bg-panel serif text-2xl text-gold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-sm text-ink-faint">{user.email}</p>
          </div>
          <label className="shrink-0 cursor-pointer rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink transition hover:bg-black/[0.04] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-gold dark:hover:bg-white/[0.06]">
            {profile.uploading ? "Uploading…" : "Change photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => profile.uploadPhoto(e.currentTarget)}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" value={fields.fName} onChange={(e) => profile.setFName(e.target.value)} />
          <Field label="Last name" value={fields.lName} onChange={(e) => profile.setLName(e.target.value)} />
        </div>
        <Field label="Email" type="email" value={fields.email} onChange={(e) => profile.setEmail(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone" value={fields.phone} onChange={(e) => profile.setPhone(e.target.value)} />
          <CityCombobox
            label="City & state"
            placeholder="Start typing a city…"
            value={fields.location}
            onChange={(v) => profile.setLocation(v)}
          />
        </div>

        <FormActions error={profile.error} message={profile.message}>
          <Button type="submit" disabled={!profile.dirty || profile.saving}>
            {profile.saving ? "Saving…" : "Save changes"}
          </Button>
        </FormActions>
      </form>
    </SettingsCard>
  );
}

function SecurityCard() {
  const password = usePasswordForm("/settings");
  const [open, setOpen] = useState(false);

  return (
    <SettingsCard id="settings-security" title="Sign-in & security">
      {open ? (
        <form onSubmit={password.submit} className="grid gap-4">
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password.current}
            onChange={(e) => password.setCurrent(e.target.value)}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters. You'll sign in again afterward."
            required
            value={password.next}
            onChange={(e) => password.setNext(e.target.value)}
          />
          <FormActions error={password.error}>
            <Button
              type="button"
              variant="ghost"
              disabled={password.busy}
              onClick={() => {
                password.reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={password.busy}>
              {password.busy ? "Updating…" : "Update password"}
            </Button>
          </FormActions>
        </form>
      ) : (
        <Row label="Password" hint="Changing it signs you out everywhere, this browser included.">
          <Button variant="ghost" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </Row>
      )}
    </SettingsCard>
  );
}

/** Venmo/Zelle: how clients pay this vendor. */
function PaymentsCard({ vendor, onSaved }: { vendor: VendorDetail; onSaved: (v: VendorDetail) => void }) {
  // Escrow disabled → manual regardless of what an older vendor row says
  // (VendorPaymentFields normalizes the same way).
  const savedMethod: "stripe" | "manual" = ESCROW_ENABLED ? (vendor.payment_method ?? "stripe") : "manual";
  const [paymentMethod, setPaymentMethod] = useState(savedMethod);
  const [venmo, setVenmo] = useState(vendor.venmo_handle ?? "");
  const [zelle, setZelle] = useState(vendor.zelle_contact ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    paymentMethod !== savedMethod ||
    venmo.trim() !== (vendor.venmo_handle ?? "") ||
    zelle.trim() !== (vendor.zelle_contact ?? "");

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

  // Editing again clears "Saved." — it no longer describes what's on screen.
  function edit<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setSaved(false);
    };
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <VendorPaymentFields
        paymentMethod={paymentMethod}
        venmoHandle={venmo}
        zelleContact={zelle}
        onPaymentMethodChange={edit(setPaymentMethod)}
        onVenmoHandleChange={edit(setVenmo)}
        onZelleContactChange={edit(setZelle)}
      />
      <FormActions error={error} message={saved ? "Saved." : null}>
        <Button type="submit" disabled={!dirty || busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </FormActions>
    </form>
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

const PAYMENTS_HINT = "Clients pay you directly; this shows on every contract you send.";

const HEADING: PageHeading = {
  eyebrow: "Account",
  title: "Settings",
  subtitle: "Your account, how clients pay you, and how Jorna works for you.",
};

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
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
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your settings."));
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (authLoading || !user) {
    return (
      <PageSkeleton heading={HEADING} label="Loading your settings…">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="grid gap-5">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={1} />
          </div>
          <div className="grid gap-5">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </div>
        </div>
      </PageSkeleton>
    );
  }

  return (
    <div>
      <PageHeader {...HEADING} />

      {error ? (
        <p role="alert" className="mb-5 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <ProfileCard />
          <SecurityCard />
        </div>

        <div className="grid gap-5">
          {/* The profile needs no vendor; payments wait for it, in their own
              place rather than popping in above Preferences. */}
          {vendor ? (
            <SettingsCard id="settings-payments" title="How clients pay you" hint={PAYMENTS_HINT}>
              <PaymentsCard vendor={vendor} onSaved={setVendor} />
            </SettingsCard>
          ) : error ? null : (
            <SkeletonBody label="Loading how clients pay you…">
              <SkeletonCard lines={3} />
            </SkeletonBody>
          )}

          {/* The opt-in draws its own card, and nothing at all while push is
              off — an empty section would read as broken (#101). */}
          {PUSH_ENABLED ? (
            <div className="[&>*]:mb-0">
              <PushOptIn showWhenOn />
            </div>
          ) : null}

          <SettingsCard id="settings-preferences" title="Preferences">
            <div className="divide-y divide-line-soft">
              <Row label="Theme" hint="How Jorna looks on this device.">
                <ThemePicker />
              </Row>
              <Row label="Blocked people" hint="You won't see their messages or reviews.">
                <Link href="/blocked" className="text-sm font-semibold text-gold hover:underline">
                  Manage ›
                </Link>
              </Row>
            </div>
          </SettingsCard>
        </div>
      </div>

      {/* Waits for the vendor so the confirmation can say the vendor profile
          goes too. */}
      {vendor ? <DeleteAccountSection vendor={vendor} className="mt-5" /> : null}
    </div>
  );
}
