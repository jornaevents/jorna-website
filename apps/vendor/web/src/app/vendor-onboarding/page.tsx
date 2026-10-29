"use client";

// First-time vendor setup, in the design's four steps — what you offer, where
// you work, how clients pay you, your first package — then "You're set up" and
// on to the dashboard (Figma Make "Jorna-Vendor" entry flow, 2026-10).
//
// One save per step, and resumable: a reload (or coming back after "Save and
// finish later") picks up wherever the vendor's own record says they got to.
// A vendor with at least one service is done, whatever else is unset — an
// unpriced radius doesn't stop a booking and a missing service does — so the
// vendor pages wait on that (#162) and send anyone without one back here.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { ESCROW_ENABLED } from "@jorna/shared/lib/flags";
import { CityCombobox, type Coords } from "@jorna/shared/components/CityCombobox";
import {
  createVendor,
  getMyVendor,
  listBundles,
  listServices,
  listVendorCategories,
  saveHomeBase,
  updateMyVendor,
  uploadAvatar,
} from "@/lib/jorna";
import { hasActiveBookings } from "@/lib/planning";
import { clearRoleCache } from "@/lib/role";
import {
  vendorSpecializations,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
  type VendorSpecialization,
} from "@/lib/types";
import { ServicesManager } from "@/components/ServicesManager";
import { inquiryFormUrl } from "@/components/vendor/InquiryShare";
import { clientAppUrl } from "@/lib/clientApp";
import {
  Chip,
  EntryField,
  EntryShell,
  ErrorNote,
  FlowIcon,
  Prefixed,
  primaryButton,
  secondaryButton,
  textButton,
} from "@/components/entry/ui";

type Step = "blocked" | "offer" | "where" | "pay" | "package" | "done";

const STEP_NUMBER: Partial<Record<Step, number>> = { offer: 1, where: 2, pay: 3, package: 4 };

const HEADINGS: Record<number, { title: string; body: string }> = {
  1: { title: "What do you offer?", body: "So clients know who they're booking." },
  2: { title: "Where you work", body: "Set your home base and the celebrations you're willing to travel for." },
  3: {
    title: "How clients pay you",
    body: "Clients pay you directly. Jorna tracks each payment but never touches the money.",
  },
  4: {
    title: "List your first package",
    body: "What clients can book. A price and a photo are what make a listing worth stopping for.",
  },
};

// The design's "popular" chips, as real taxonomy picks. Shown only when the
// taxonomy has them, so a renamed key drops a chip rather than breaking one.
const POPULAR: { label: string; category: string; subcategory: string | null }[] = [
  { label: "Venue", category: "venue", subcategory: null },
  { label: "Caterer", category: "catering", subcategory: null },
  { label: "Decorator", category: "floral_decor", subcategory: "decor" },
  { label: "Photographer", category: "photography", subcategory: null },
  { label: "DJ", category: "music_entertainment", subcategory: "dj" },
  { label: "Mehndi artist", category: "beauty", subcategory: "mehndi_artist" },
  { label: "Dhol player", category: "music_entertainment", subcategory: "dhol" },
  { label: "Makeup artist", category: "beauty", subcategory: "bridal_makeup" },
];

const RADIUS_MIN = 10;
const RADIUS_MAX = 200;

const same = (a: VendorSpecialization, category: string, subcategory: string | null) =>
  a.category === category && (a.subcategory ?? null) === subcategory;

function specLabel(s: VendorSpecialization, categories: TaxonomyCategory[]): string {
  const cat = categories.find((c) => c.value === s.category);
  const sub = cat?.subcategories.find((o) => o.value === s.subcategory);
  return sub?.label ?? cat?.label ?? s.category;
}

export default function VendorOnboardingPage() {
  const { user, loading: authLoading, logout, setUser } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Null until the first load decides where to resume, so a vendor who's
  // further along never sees a flash of step 1.
  const [step, setStep] = useState<Step | null>(null);
  const [resumed, setResumed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Step 1
  const [specializations, setSpecializations] = useState<VendorSpecialization[]>([]);
  const [bio, setBio] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  // Step 2
  const [basedIn, setBasedIn] = useState("");
  const [basedCoords, setBasedCoords] = useState<Coords | null>(null);
  const [radius, setRadius] = useState(50);
  const [longDistance, setLongDistance] = useState(true);
  const [instagram, setInstagram] = useState("");
  // Step 3
  const [venmoHandle, setVenmoHandle] = useState("");
  const [zelleContact, setZelleContact] = useState("");
  // Step 4
  const [packageSaved, setPackageSaved] = useState(false);
  // Done
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/vendor-onboarding&role=vendor");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listVendorCategories(), getMyVendor()])
      .then(async ([tax, mine]) => {
        if (cancelled) return;
        setCategories(tax.categories);
        // From the account, unless the vendor has already typed one here.
        setBasedIn((cur) => cur || user.location || "");
        if (!mine) {
          // An account is a client or a vendor. Converting out from under an
          // open request or a booking would strand it, so check first — and
          // fail closed: a network hiccup must not read as "nothing to check".
          try {
            const bundles = await listBundles();
            if (!cancelled) setStep(hasActiveBookings(bundles) ? "blocked" : "offer");
          } catch (err) {
            if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't check your account.");
          }
          return;
        }
        setVendor(mine);
        setSpecializations(vendorSpecializations(mine));
        setBio(mine.bio ?? "");
        setYearsExperience(mine.years_experience?.toString() ?? "");
        if (mine.travel_radius_miles) setRadius(mine.travel_radius_miles);
        setLongDistance(Boolean(mine.open_to_long_distance));
        setInstagram(mine.instagram_username ?? "");
        setVenmoHandle(mine.venmo_handle ?? "");
        setZelleContact(mine.zelle_contact ?? "");

        const svc = await listServices({ vendor_id: mine.vendor_id, limit: 100 }).catch(() => null);
        if (cancelled) return;
        if (svc?.items.length) {
          // Already bookable: nothing left to set up.
          router.replace("/overview");
          return;
        }
        if (svc) setServices(svc.items);
        const paid = ESCROW_ENABLED ? mine.payment_method != null : Boolean(mine.venmo_handle || mine.zelle_contact);
        setStep(paid ? "package" : user.location ? "pay" : "where");
        setResumed(true);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load your profile."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, router, retryTick]);

  function toggle(category: string, subcategory: string | null) {
    setError(null);
    setSpecializations((cur) =>
      cur.some((s) => same(s, category, subcategory))
        ? cur.filter((s) => !same(s, category, subcategory))
        : [...cur, { category, subcategory }],
    );
  }

  async function onLogo(file: File | undefined) {
    if (!file || !user) return;
    setLogoBusy(true);
    try {
      const { pfp_url } = await uploadAvatar(file);
      setUser({ ...user, pfp_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that image.");
    } finally {
      setLogoBusy(false);
    }
  }

  /** Save the step on screen. Returns false (with the reason shown) if it can't. */
  async function saveStep(current: Step): Promise<boolean> {
    if (current === "offer") {
      if (specializations.length === 0) {
        setError("Pick at least one service.");
        return false;
      }
      if (!bio.trim()) {
        setError("Add a line or two about you.");
        return false;
      }
      const [primary] = specializations;
      const payload = {
        bio: bio.trim(),
        category: primary.category,
        subcategory: primary.subcategory ?? undefined,
        specializations,
        years_experience: yearsExperience ? Number(yearsExperience) : null,
      };
      if (vendor) {
        setVendor(await updateMyVendor(payload));
      } else {
        const created = await createVendor(payload);
        // The one moment "is this a vendor" changes; nav reads a cached answer.
        clearRoleCache();
        setVendor(created);
      }
      return true;
    }
    if (current === "where") {
      if (!basedIn.trim()) {
        setError("Add the city you're based in.");
        return false;
      }
      await saveHomeBase({ location: basedIn.trim(), latitude: basedCoords?.lat ?? null, longitude: basedCoords?.lng ?? null });
      if (user) setUser({ ...user, location: basedIn.trim() });
      setVendor(
        await updateMyVendor({
          travel_radius_miles: radius,
          open_to_long_distance: longDistance,
          instagram_username: instagram.trim().replace(/^@/, "") || null,
        }),
      );
      return true;
    }
    if (current === "pay") {
      const venmo = venmoHandle.trim().replace(/^@/, "");
      const zelle = zelleContact.trim();
      if (!ESCROW_ENABLED && !venmo && !zelle) {
        setError("Add a Venmo handle or a Zelle contact.");
        return false;
      }
      if (!ESCROW_ENABLED) {
        setVendor(await updateMyVendor({ payment_method: "manual", venmo_handle: venmo || null, zelle_contact: zelle || null }));
      }
      return true;
    }
    return true;
  }

  async function next(current: Step, to: Step) {
    setBusy(true);
    setError(null);
    try {
      if (await saveStep(current)) {
        setStep(to);
        setResumed(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Keep what's valid on this step, then sign out: the next sign-in comes back
  // here at the step the saved record points to.
  async function finishLater() {
    if (step && step !== "package") {
      setBusy(true);
      await saveStep(step).catch(() => false);
    }
    logout();
  }

  async function copyInquiryLink() {
    if (!vendor) return;
    try {
      await navigator.clipboard.writeText(inquiryFormUrl(vendor.vendor_id));
      setLinkCopied(true);
    } catch {
      setError("Couldn't copy — your link is " + inquiryFormUrl(vendor.vendor_id));
    }
  }

  if (authLoading || !user || loading) {
    return (
      <EntryShell>
        <p className="py-20 text-center text-(--e-muted)">Loading…</p>
      </EntryShell>
    );
  }

  if (!step) {
    return (
      <EntryShell>
        <div className="py-20 text-center">
          <p role="alert" className="text-(--e-muted)">
            {error ?? "Couldn't load your profile."}
          </p>
          <button
            type="button"
            className={`${primaryButton} mt-4`}
            onClick={() => {
              setError(null);
              setLoading(true);
              setRetryTick((t) => t + 1);
            }}
          >
            Try again
          </button>
        </div>
      </EntryShell>
    );
  }

  if (step === "blocked") {
    return (
      <EntryShell>
        <main className="grid flex-1 place-items-center px-3 pb-16 pt-8">
          <section className="w-full max-w-[440px] rounded-[20px] border border-(--e-line) bg-(--e-paper) px-6 py-10 text-center shadow-[0_22px_60px_rgba(74,21,38,.1)]">
            <span className="mx-auto mb-5 grid size-16 -rotate-4 place-items-center rounded-[20px] bg-(--e-sand) text-(--e-burgundy)">
              <FlowIcon name="payments" size={30} />
            </span>
            <p className="e-eyebrow">One account, one role</p>
            <h1 className="e-display mt-2 text-[32px]">Finish up as a client first</h1>
            <p className="mt-3 text-[14px] leading-normal text-(--e-muted)">
              An account can only be a client or a vendor. You have an open request, an upcoming booking or a
              payment still settling — wrap that up first.
            </p>
            <a href={clientAppUrl("/bundles")} className={`${primaryButton} mt-6 w-full`}>
              Go to your celebrations
            </a>
            <button type="button" className={`${textButton} mt-4`} onClick={() => logout("/login?mode=register&role=vendor")}>
              Use a different email
            </button>
          </section>
        </main>
      </EntryShell>
    );
  }

  if (step === "done") {
    return (
      <EntryShell>
        <main className="grid flex-1 place-items-center px-5 pb-20 pt-12">
          <section className="w-full max-w-[500px] text-center">
            <div aria-hidden="true" className="relative mx-auto mb-6 grid h-[130px] w-[150px] place-items-center">
              <span className="relative z-10 grid size-[84px] place-items-center rounded-full border-8 border-[#fffaf0] bg-(--e-burgundy) text-white shadow-[0_15px_35px_rgba(100,31,52,.2)]">
                <FlowIcon name="check" size={34} />
              </span>
              <i className="absolute left-5 top-7 size-2 rotate-[25deg] rounded-[2px] bg-(--e-gold)" />
              <i className="absolute right-4 top-4 size-2 rotate-[25deg] rounded-[2px] bg-(--e-gold)" />
              <i className="absolute bottom-5 right-1.5 size-2 rotate-[25deg] rounded-[2px] bg-(--e-gold)" />
              <i className="absolute bottom-6 left-2 size-2 rotate-[25deg] rounded-[2px] bg-[#a86878]" />
              <i className="absolute left-10 top-0.5 size-2 rotate-[25deg] rounded-[2px] bg-[#78aa8c]" />
            </div>
            <p className="e-eyebrow">Welcome to Jorna</p>
            <h1 className="e-display mt-2 text-[36px]">You&apos;re set up</h1>
            <p className="mb-7 mt-3 text-[15px] leading-relaxed text-(--e-muted)">
              Your listing is live.
              <br />
              Clients can find you and send requests.
            </p>
            <button type="button" className={`${primaryButton} w-full max-w-[320px]`} onClick={() => router.push("/overview")}>
              Go to your dashboard <FlowIcon name="arrow" size={15} />
            </button>
            <button type="button" className={`${secondaryButton} mt-2.5 w-full max-w-[320px]`} onClick={copyInquiryLink}>
              {linkCopied ? "Inquiry link copied" : "Share your inquiry link"}
            </button>
            {error ? (
              <div className="mx-auto mt-4 max-w-[320px]">
                <ErrorNote>{error}</ErrorNote>
              </div>
            ) : null}
          </section>
        </main>
      </EntryShell>
    );
  }

  const n = STEP_NUMBER[step] ?? 1;
  const heading = HEADINGS[n];
  const popular = POPULAR.filter((p) => {
    const cat = categories.find((c) => c.value === p.category);
    return cat && (p.subcategory === null || cat.subcategories.some((s) => s.value === p.subcategory));
  });
  const nextStep: Record<string, Step> = { offer: "where", where: "pay", pay: "package" };
  const prevStep: Record<string, Step> = { where: "offer", pay: "where", package: "pay" };

  return (
    <EntryShell
      topRight={
        <button
          type="button"
          disabled={busy}
          onClick={finishLater}
          className="border-b border-[#b7aaa0] py-0.5 text-[13px] font-bold text-(--e-muted) hover:text-(--e-burgundy)"
        >
          Save and finish later
        </button>
      }
    >
      {resumed ? (
        <div role="status" className="mx-auto mt-4 flex w-[min(420px,calc(100%-30px))] items-center gap-2.5 rounded-xl border border-[#bcd2c4] bg-[#e6f0e9] px-3.5 py-3 text-[13px] text-[#315f4b]">
          <FlowIcon name="check" size={15} />
          <span className="flex-1">
            <strong>Welcome back.</strong> Pick up where you left off.
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => setResumed(false)} className="text-[18px] leading-none text-[#53705f]">
            ×
          </button>
        </div>
      ) : null}

      <main className="mx-auto w-[min(640px,calc(100%-20px))] pb-20 pt-7">
        <div className="mb-3.5 grid gap-2">
          <p className="text-center text-[12px] font-bold uppercase tracking-[0.1em] text-(--e-muted)">Step {n} of 4</p>
          <div className="h-1 overflow-hidden rounded bg-[#e5ddd2]" aria-hidden="true">
            <i className="block h-full rounded bg-(--e-gold) transition-[width] duration-300" style={{ width: `${n * 25}%` }} />
          </div>
        </div>

        <section className="rounded-[20px] border border-(--e-line) bg-(--e-paper) px-5 pb-6 pt-9 shadow-[0_18px_55px_rgba(74,21,38,.07)] sm:px-10">
          <div className="text-center">
            <span className="e-ui mx-auto mb-4 grid size-9 place-items-center rounded-full bg-(--e-sand) text-[12px] font-bold text-(--e-burgundy)">
              0{n}
            </span>
            <h1 className="e-display text-[30px] sm:text-[36px]">{heading.title}</h1>
            <p className="mx-auto mt-2.5 max-w-[460px] text-[14px] leading-normal text-(--e-muted)">{heading.body}</p>
          </div>

          {step === "offer" ? (
            <div className="mt-8 grid gap-5">
              <EntryField label="Services you offer">
                <div className="flex flex-wrap gap-1.5">
                  {popular.map((p) => (
                    <Chip key={p.label} selected={specializations.some((s) => same(s, p.category, p.subcategory))} onClick={() => toggle(p.category, p.subcategory)}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
                <button type="button" onClick={() => setSheetOpen(true)} className="flex items-center gap-1 justify-self-start text-[13px] font-bold text-(--e-gold-dark) hover:underline">
                  Browse all services <FlowIcon name="arrow" size={13} />
                </button>
                {specializations.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5 border-t border-[#eee7de] pt-2.5" aria-label="Picked services">
                    {specializations.map((s) => (
                      <li key={`${s.category}:${s.subcategory ?? ""}`} className="flex items-center gap-1.5 rounded-lg bg-(--e-burgundy) px-2 py-1.5 text-[12px] font-bold text-white">
                        {specLabel(s, categories)}
                        <button
                          type="button"
                          aria-label={`Remove ${specLabel(s, categories)}`}
                          onClick={() => toggle(s.category, s.subcategory ?? null)}
                          className="text-[15px] leading-none text-[#d9c2c8]"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </EntryField>
              <EntryField label="About you" htmlFor="ob-bio">
                <textarea
                  id="ob-bio"
                  className="e-input"
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What you offer, your style, and what makes your work yours."
                />
              </EntryField>
              <div className="grid items-start gap-5 sm:grid-cols-2">
                <EntryField label="Years in business" optional htmlFor="ob-years">
                  <input
                    id="ob-years"
                    className="e-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    value={yearsExperience}
                    onChange={(e) => setYearsExperience(e.target.value)}
                  />
                </EntryField>
                <EntryField label="Profile photo or logo" optional>
                  <label className="grid size-[72px] cursor-pointer place-items-center content-center gap-0.5 overflow-hidden rounded-full border border-dashed border-[#cbbda9] bg-[#fffaf0] text-(--e-gold-dark)">
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
                    {user.pfp_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- an uploaded avatar from storage, not a build asset
                      <img src={user.pfp_url} alt="Your profile photo" className="size-full object-cover" />
                    ) : (
                      <>
                        <FlowIcon name="upload" size={18} />
                        <small className="text-[11px]">{logoBusy ? "Uploading…" : "Upload"}</small>
                      </>
                    )}
                  </label>
                </EntryField>
              </div>
            </div>
          ) : null}

          {step === "where" ? (
            <div className="mt-8 grid gap-5">
              <EntryField label="Based in">
                <CityCombobox
                  value={basedIn}
                  placeholder="Start typing a city…"
                  onChange={(v, c) => {
                    setBasedIn(v);
                    setBasedCoords(c);
                  }}
                  required
                />
              </EntryField>
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="ob-radius" className="text-[13px] font-bold text-[#625b55]">
                    How far you travel
                  </label>
                  <span className="text-[14px] font-bold text-(--e-burgundy)">{radius} miles</span>
                </div>
                <input
                  id="ob-radius"
                  className="e-range mt-2"
                  type="range"
                  min={RADIUS_MIN}
                  max={RADIUS_MAX}
                  step={5}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                />
                <div className="flex justify-between text-[12px] text-[#9b948c]">
                  <span>{RADIUS_MIN} miles</span>
                  <span>{RADIUS_MAX} miles</span>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-(--e-line) bg-[#fbf8f3] p-3.5">
                <span className="grid flex-1">
                  <strong className="text-[14px]">Open to traveling farther for the right event</strong>
                  <small className="mt-0.5 text-[12px] text-(--e-muted)">You can decide case by case when a request comes in.</small>
                </span>
                <input type="checkbox" className="sr-only" checked={longDistance} onChange={(e) => setLongDistance(e.target.checked)} />
                <i className="e-switch" aria-hidden="true" />
              </label>
              <EntryField label="Instagram" optional htmlFor="ob-ig">
                <Prefixed prefix="@">
                  <input
                    id="ob-ig"
                    className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                  />
                </Prefixed>
              </EntryField>
            </div>
          ) : null}

          {step === "pay" ? (
            <div className="mt-8 grid gap-5">
              <div className="flex items-start gap-2.5 rounded-xl border border-[#dfd2aa] bg-[#fdf8e9] p-3.5 text-(--e-gold-dark)">
                <FlowIcon name="payments" />
                <span className="grid text-(--e-text)">
                  <strong className="text-[14px]">Your money stays yours</strong>
                  <small className="mt-0.5 text-[12px] leading-snug text-(--e-muted)">
                    Clients see these payment details after they sign a contract.
                  </small>
                </span>
              </div>
              {ESCROW_ENABLED ? (
                <p className="text-[14px] text-(--e-muted)">You&apos;ll connect payouts from Earnings once you&apos;re set up.</p>
              ) : (
                <>
                  <EntryField label="Venmo handle" htmlFor="ob-venmo">
                    <Prefixed prefix="@">
                      <input
                        id="ob-venmo"
                        className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none"
                        placeholder="your-business"
                        value={venmoHandle.replace(/^@/, "")}
                        onChange={(e) => {
                          setVenmoHandle(e.target.value);
                          if (e.target.value.trim()) setError(null);
                        }}
                      />
                    </Prefixed>
                  </EntryField>
                  <div className="relative grid place-items-center" aria-hidden="true">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-(--e-line)" />
                    <span className="relative bg-(--e-paper) px-2 text-[12px] text-[#9b948c]">or</span>
                  </div>
                  <EntryField label="Zelle contact" htmlFor="ob-zelle">
                    <input
                      id="ob-zelle"
                      className="e-input"
                      placeholder="Email or phone"
                      value={zelleContact}
                      onChange={(e) => {
                        setZelleContact(e.target.value);
                        if (e.target.value.trim()) setError(null);
                      }}
                    />
                  </EntryField>
                </>
              )}
            </div>
          ) : null}

          {step === "package" && vendor ? (
            <div className="mt-8">
              {/* The real package form — taxonomy, price units, inclusions,
                  photos, add-ons — rather than a lookalike that saves less. */}
              <ServicesManager
                vendor={vendor}
                categories={categories}
                initial={services}
                autoStartNew
                onServiceAdded={() => setPackageSaved(true)}
              />
            </div>
          ) : null}

          {error ? (
            <div className="mt-5">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-(--e-line) pt-5">
            {prevStep[step] ? (
              <button type="button" className={secondaryButton} disabled={busy} onClick={() => setStep(prevStep[step])}>
                Back
              </button>
            ) : (
              <span />
            )}
            {step === "package" ? (
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                {!packageSaved ? (
                  <small className="max-w-[200px] text-right text-[12px] leading-snug text-(--e-muted)">
                    Your listing goes live once your first package is saved.
                  </small>
                ) : null}
                <button type="button" className={primaryButton} disabled={!packageSaved} onClick={() => setStep("done")}>
                  Finish setup <FlowIcon name="arrow" size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={primaryButton}
                disabled={busy || (step === "offer" && specializations.length === 0)}
                onClick={() => next(step, nextStep[step])}
              >
                {busy ? "Saving…" : "Continue"} <FlowIcon name="arrow" size={14} />
              </button>
            )}
          </div>
        </section>
      </main>

      {sheetOpen ? (
        <ServiceSheet
          categories={categories}
          selected={specializations}
          onToggle={toggle}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </EntryShell>
  );
}

/** "Browse all services": every category and the services in it, searchable. */
function ServiceSheet({
  categories,
  selected,
  onToggle,
  onClose,
}: {
  categories: TaxonomyCategory[];
  selected: VendorSpecialization[];
  onToggle: (category: string, subcategory: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = categories
    .map((c) => ({
      c,
      // A category with no finer services is itself the one thing to pick.
      options: (c.subcategories.length ? c.subcategories.map((s) => ({ value: s.value as string | null, label: s.label })) : [{ value: null, label: c.label }]).filter(
        (o) => !q || o.label.toLowerCase().includes(q) || c.label.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.options.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close services" className="absolute inset-0 bg-[rgba(49,28,33,.46)] backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="All services" className="e-sheet relative grid h-full w-full max-w-[440px] grid-rows-[auto_auto_1fr_auto] bg-(--e-paper) shadow-[-20px_0_50px_rgba(49,28,33,.2)]">
        <div className="flex items-center justify-between border-b border-(--e-line) p-5">
          <div className="grid">
            <span className="e-eyebrow">Service directory</span>
            <strong className="e-ui mt-1 text-[19px]">What do you offer?</strong>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="size-8 rounded-lg border border-(--e-line) bg-[#faf7f2] text-[18px] text-[#7e766f]">
            ×
          </button>
        </div>
        <label className="e-input mx-4 mb-1 mt-3.5 flex !w-auto items-center gap-2 text-[#9b948c]">
          <FlowIcon name="search" size={16} />
          <input autoFocus className="min-w-0 flex-1 bg-transparent text-(--e-text) outline-none" placeholder="Search all services" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="grid content-start gap-5 overflow-y-auto px-4 pb-5 pt-2.5">
          {groups.map(({ c, options }) => (
            <section key={c.value}>
              <p className="text-[12px] font-bold uppercase tracking-widest text-(--e-muted)">{c.label}</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {options.map((o) => {
                  const on = selected.some((s) => same(s, c.value, o.value));
                  return (
                    <button
                      key={`${c.value}:${o.value ?? ""}`}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggle(c.value, o.value)}
                      className={`flex min-h-10 items-center gap-2 rounded-[9px] border px-2.5 text-left text-[13px] ${
                        on ? "border-[#d0b164] bg-[#fffaf0]" : "border-(--e-line) bg-white text-[#5f5852]"
                      }`}
                    >
                      <span className={`grid size-4 shrink-0 place-items-center rounded-[5px] border text-white ${on ? "border-(--e-gold-dark) bg-(--e-gold-dark)" : "border-[#d8d0c5]"}`}>
                        {on ? <FlowIcon name="check" size={11} /> : null}
                      </span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {groups.length === 0 ? <p className="text-[14px] text-(--e-muted)">Nothing matches “{query}”.</p> : null}
        </div>
        <div className="flex items-center justify-between border-t border-(--e-line) bg-[#faf7f2] px-4 py-3">
          <span className="text-[13px] font-bold text-(--e-muted)">{selected.length} selected</span>
          <button type="button" className={primaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
