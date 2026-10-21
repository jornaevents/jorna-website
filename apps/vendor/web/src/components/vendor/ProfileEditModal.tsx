"use client";

// "Edit profile" on /vendor-profile, from the Figma Make design (Vendor
// Profile 2): the details clients see — photo, specialty, where you're based,
// whether you'll take events out of state, years in business, a short intro —
// in one popup with a live preview beside it, saved together.
//
// The photo and city live on the user (PUT /me/avatar, PATCH /me); the rest
// on the vendor (PATCH /vendors/me). Travel radius isn't asked any more: the
// out-of-state box replaced it, and a radius already saved is left alone.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import { checkImageFiles, describeRejections } from "@jorna/shared/lib/uploads";
import { useOverlay } from "@jorna/shared/components/useOverlay";
import { CityCombobox } from "@jorna/shared/components/CityCombobox";
import { Avatar } from "@jorna/shared/components/ui";
import { updateMe, updateMyVendor, uploadAvatar } from "@/lib/jorna";
import {
  categoryLabel,
  vendorSpecializations,
  type TaxonomyCategory,
  type VendorDetail,
  type VendorSpecialization,
} from "@/lib/types";
import { VendorSpecializationFields } from "@/components/VendorProfileFields";
import { Icon } from "@/components/vendor/Icon";
import { primaryClass } from "@/components/vendor/ui";

interface Draft {
  specializations: VendorSpecialization[];
  location: string;
  outOfState: boolean;
  years: string;
  bio: string;
  instagram: string;
}

function draftOf(v: VendorDetail): Draft {
  return {
    specializations: vendorSpecializations(v),
    location: v.location ?? "",
    outOfState: Boolean(v.open_to_long_distance),
    years: v.years_experience?.toString() ?? "",
    bio: v.bio ?? "",
    instagram: v.instagram_username ?? "",
  };
}

/** Whole years, 0–99, or blank for "not saying". */
export const validYears = (s: string) => /^\d{0,2}$/.test(s.trim());

const inputClass =
  "w-full rounded-[10px] border border-card-edge bg-ground-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelClass = "mb-1.5 block text-sm font-medium text-ink-soft";

export function ProfileEditModal({
  vendor,
  categories,
  onClose,
  onSaved,
}: {
  vendor: VendorDetail;
  categories: TaxonomyCategory[];
  onClose: () => void;
  onSaved: (vendor: VendorDetail) => void;
}) {
  const { user, setUser } = useAuth();
  const ref = useOverlay<HTMLDivElement>(true, onClose);
  const [draft, setDraft] = useState(() => draftOf(vendor));
  // A new photo is held here and uploaded with Save, so Cancel really cancels.
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const yearsError = !validYears(draft.years);
  const name = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ") || "Your business";
  const photoSrc = photo?.url ?? vendor.pfp_url;
  const primary = draft.specializations[0];
  const specialty = primary
    ? (categories.find((c) => c.value === primary.category)?.subcategories?.find((s) => s.value === primary.subcategory)
        ?.label ?? categoryLabel(primary.subcategory || primary.category))
    : null;

  function pickPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const { ok, rejected } = checkImageFiles([file]);
    if (rejected.length) {
      setError(`Skipped: ${describeRejections(rejected)}.`);
      return;
    }
    setError(null);
    setPhoto({ file: ok[0], url: URL.createObjectURL(ok[0]) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (yearsError) return;
    if (draft.specializations.length === 0) {
      setError("Pick at least one specialty first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // The user's side first, so the vendor that comes back already shows
      // the new photo and city.
      if (photo) {
        const { pfp_url } = await uploadAvatar(photo.file);
        if (user) setUser({ ...user, pfp_url });
      }
      if (draft.location.trim() !== (vendor.location ?? "")) {
        setUser(await updateMe({ location: draft.location.trim() }));
      }
      const [first] = draft.specializations;
      const years = draft.years.trim();
      const updated = await updateMyVendor({
        bio: draft.bio,
        category: first.category,
        subcategory: first.subcategory ?? null,
        specializations: draft.specializations,
        open_to_long_distance: draft.outOfState,
        years_experience: years ? Number(years) : null,
        instagram_username: draft.instagram.trim().replace(/^@/, "") || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center sm:p-7">
      <div className="absolute inset-0 bg-[#2a181d]/50 backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden bg-ground outline-none sm:h-auto sm:max-h-[calc(100vh-3.5rem)] sm:w-[min(52rem,100%)] sm:rounded-2xl sm:shadow-[0_24px_70px_rgba(42,24,29,0.28)]"
      >
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line-soft bg-card px-5 py-4">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gold">Public profile</p>
              <h2 id="profile-edit-title" className="serif mt-0.5 text-xl text-ink">
                Edit profile
              </h2>
              <p className="mt-1 text-sm text-ink-faint">
                Update the business details clients see when they visit your profile.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line text-ink-soft transition hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3.5 rounded-xl border border-card-edge bg-ground-2 p-3 sm:col-span-2">
                <Avatar src={photoSrc} name={name} size={58} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Business icon</p>
                  <p className="mt-0.5 text-xs text-ink-faint">Use a square JPG, PNG, or WEBP image.</p>
                  <div className="mt-2 flex items-center gap-3">
                    <label className="inline-flex cursor-pointer rounded-lg border border-card-edge bg-card px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink">
                      {photoSrc ? "Replace image" : "Upload image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          pickPhoto(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {photo ? (
                      <button type="button" onClick={() => setPhoto(null)} className="text-xs font-semibold text-maroon dark:text-gold">
                        Undo
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:col-span-2">
                <VendorSpecializationFields
                  categories={categories}
                  specializations={draft.specializations}
                  onChange={(specializations) => {
                    patch({ specializations });
                    if (specializations.length) setError(null);
                  }}
                />
              </div>

              <CityCombobox
                label="Business location"
                placeholder="Start typing a city…"
                value={draft.location}
                onChange={(location) => patch({ location })}
              />

              <label className="block">
                <span className={labelClass}>Instagram (optional)</span>
                <input
                  className={inputClass}
                  placeholder="yourhandle"
                  value={draft.instagram}
                  onChange={(e) => patch({ instagram: e.target.value })}
                />
              </label>

              <label className="flex cursor-pointer items-start gap-2.5 self-center">
                <input
                  type="checkbox"
                  checked={draft.outOfState}
                  onChange={(e) => patch({ outOfState: e.target.checked })}
                  className="mt-0.5 size-[18px] shrink-0 accent-[var(--color-gold)]"
                />
                <span className="grid gap-1">
                  <span className="text-sm font-medium text-ink-soft">Open to events out of state</span>
                  <span className="text-xs leading-snug text-ink-faint">
                    Clients planning events outside your state can find and contact you.
                  </span>
                </span>
              </label>

              <label className="block">
                <span className={labelClass}>Years in business</span>
                <span className="relative block">
                  <input
                    className={`${inputClass} pr-14 ${yearsError ? "border-maroon bg-maroon/5" : ""}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    placeholder="e.g. 8"
                    value={draft.years}
                    aria-invalid={yearsError || undefined}
                    aria-describedby={yearsError ? "years-error" : undefined}
                    onChange={(e) => patch({ years: e.target.value })}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-faint">
                    years
                  </span>
                </span>
                {yearsError ? (
                  <span id="years-error" className="mt-1.5 block text-xs font-medium text-maroon dark:text-gold">
                    Enter a whole number of years (0–99).
                  </span>
                ) : null}
              </label>

              <label className="block sm:col-span-2">
                <span className={labelClass}>Short introduction</span>
                <textarea
                  rows={4}
                  className={`${inputClass} resize-y`}
                  placeholder="What you offer, your style, and what makes your work yours."
                  value={draft.bio}
                  onChange={(e) => patch({ bio: e.target.value })}
                />
              </label>
            </div>

            <aside aria-label="Profile preview" className="border-t border-line-soft pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-gold">Profile preview</p>
              <div className="relative mt-3 overflow-hidden rounded-[13px] border border-card-edge bg-ground-2 px-4 pb-4 pt-14">
                <div className="absolute inset-x-0 top-0 h-[3.25rem] bg-[#531728]" />
                <div className="relative -mt-6 inline-block rounded-full border-4 border-ground-2">
                  <Avatar src={photoSrc} name={name} size={46} />
                </div>
                <p className="serif mt-2 text-base text-ink">{name}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {[specialty ?? "Your specialty", draft.location.trim() || null].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-3 line-clamp-5 min-h-[3rem] whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {draft.bio.trim() || "Add a short introduction to your business."}
                </p>
                <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-faint">
                  {draft.outOfState ? (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 font-semibold text-maroon dark:text-gold">
                      Open to out-of-state events
                    </span>
                  ) : null}
                  {validYears(draft.years) && draft.years.trim() ? <span>{yearsLabel(Number(draft.years))}</span> : null}
                </p>
              </div>
            </aside>
          </div>

          {error ? (
            <p role="alert" className="mx-5 mb-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2.5 border-t border-line-soft bg-card px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-ink-faint">Changes appear on your public profile after saving.</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[11px] border border-card-edge px-4 text-sm font-semibold text-ink-soft transition hover:text-ink sm:flex-none"
              >
                Cancel
              </button>
              <button type="submit" disabled={busy || yearsError} className={`${primaryClass} flex-1 justify-center sm:flex-none`}>
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/** "1 year in business", "8 years in business". */
export function yearsLabel(n: number): string {
  return `${n} ${n === 1 ? "year" : "years"} in business`;
}
