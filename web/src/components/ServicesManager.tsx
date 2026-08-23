"use client";

// What clients can book, managed where the rest of the listing is.
//
// This was /my-services, a page of its own beside /vendor-profile — so a vendor
// setting up had to find both, and "why am I not getting booked" had half its
// answers on each. Neither was the whole of what a client sees. It's a
// component now, and the listing page is the one place that owns the outward
// face of a business.
//
// Takes the vendor and the taxonomy rather than fetching them: the page above
// already has both, and a second copy of either could disagree with the first.

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createService,
  deleteService,
  deleteServiceImage,
  deleteServiceVideo,
  listServices,
  updateService,
  uploadServiceImages,
  uploadServiceVideos,
  type ServiceInput,
} from "@/lib/jorna";
import {
  priceUnitLabel,
  usableMedia,
  type MediaItem,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
} from "@/lib/types";
import { geocodeUsAddress } from "@/lib/geocode";
import { checkImageFiles, checkVideoFiles, describeRejections } from "@/lib/uploads";
import { Button, Card, Field } from "./ui";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

// experience is stored server-side as free text ("Text", not a number column)
// so old listings can carry whatever a vendor once typed ("9+ years",
// "over a decade"). The form only collects a whole number of years now, so
// these two convert at the edges: parse a leading number back out for
// editing (falls back to blank rather than guessing at prose), and format the
// number into the sentence the backend — and everywhere else that displays
// it — still expects.
function parseExperienceYears(raw?: string | null): string {
  if (!raw) return "";
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? "" : String(n);
}

function formatExperienceYears(raw: string): string {
  const n = Math.max(0, Math.round(Number(raw) || 0));
  return n === 1 ? "1 year" : `${n} years`;
}

// The rate's multiplier. "event" is a flat price — everything else needs a
// quantity from the client at booking time before it can be paid.
const PRICE_UNITS = [
  { value: "event", label: "Flat price per event" },
  { value: "person", label: "Per person" },
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
];

const blank: ServiceInput = {
  name: "",
  price: 0,
  experience: "",
  // Per hour, matching the iOS create screen — the same vendor should not get a
  // different starting point depending on where they list. It is also the safer
  // way round: a rate left hourly by mistake just blocks checkout until the
  // client supplies hours, whereas an hourly rate left flat by mistake books a
  // whole event at one hour's price, and amount_cents freezes at payment.
  price_unit: "hour",
  description: "",
  negotiable: false,
};

export function ServicesManager({
  vendor,
  categories,
  initial,
  autoStartNew = false,
  onServiceAdded,
}: {
  vendor: VendorDetail;
  categories: TaxonomyCategory[];
  /** Fetched by the page in its own pass, so this doesn't add a request. */
  initial: ServiceItem[];
  /** Open the "new package" form immediately instead of waiting for "Add a
   *  package" — used by the vendor-onboarding wizard, where this component
   *  IS the step rather than an add-on to an existing list. Read once, as the
   *  initial state, so opening the form costs no extra render. */
  autoStartNew?: boolean;
  /** Fires once a new service is successfully saved (a failed photo/video
   *  upload doesn't hold it back — the service itself is already saved by
   *  then). Used by the onboarding wizard to move to the next step. */
  onServiceAdded?: () => void;
}) {
  const [services, setServices] = useState<ServiceItem[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  /** The address as the Census matched it, shown back after a successful pin. */
  const [matched, setMatched] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | "new" | null>(autoStartNew ? "new" : null);
  const [form, setForm] = useState<ServiceInput>(
    autoStartNew
      ? { ...blank, category: vendor.category ?? "", subcategory: vendor.subcategory ?? "" }
      : blank,
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadingVideoFor, setUploadingVideoFor] = useState<string | null>(null);
  // Photos/videos chosen while filling in a new service. They can only be sent
  // once the service exists (the upload endpoint is per-service), so they wait
  // here and go up right after create — iOS collects the image on its create
  // screen the same way rather than making the vendor come back for it.
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newVideos, setNewVideos] = useState<File[]>([]);

  async function refresh() {
    const res = await listServices({ vendor_id: vendor.vendor_id, limit: 100 });
    setServices(res.items);
  }

  const subOptions =
    categories.find((c) => c.value === form.category)?.subcategories ?? [];
  const isVenue = form.category === "venue";
  const isOther = form.category === "other";

  function startNew() {
    // Default to what this vendor does, so most services need no category fiddling.
    setForm({ ...blank, category: vendor.category ?? "", subcategory: vendor.subcategory ?? "" });
    setNewPhotos([]);
    setNewVideos([]);
    setEditing("new");
    setError(null);
  }

  function startEdit(s: ServiceItem) {
    setForm({
      name: s.name,
      price: s.price,
      experience: parseExperienceYears(s.experience),
      price_unit: s.price_unit ?? "event",
      category: s.category ?? "",
      subcategory: s.subcategory ?? "",
      description: s.description ?? "",
      negotiable: Boolean(s.negotiable),
      location: s.location ?? "",
      venue_latitude: s.venue_latitude ?? null,
      venue_longitude: s.venue_longitude ?? null,
    });
    setNewPhotos([]);
    setNewVideos([]);
    setEditing(s.service_id);
    setError(null);
  }

  /**
   * Find the pin from the address that's already typed.
   *
   * The better of the two buttons for the usual case: a vendor listing a hall
   * is at a desk, not at the hall, so "use my current location" would pin the
   * desk. Nobody knows a venue's latitude, and check-in is measured against it.
   */
  async function locateFromAddress() {
    const address = (form.location ?? "").trim();
    if (!address) {
      setError("Type the venue's address first, then look it up.");
      return;
    }
    setLocating(true);
    setError(null);
    setMatched(null);
    try {
      const hit = await geocodeUsAddress(address);
      if (!hit) {
        setError(
          "No match for that address. Check it, or drop the pin with the coordinates below.",
        );
        return;
      }
      setForm((f) => ({
        ...f,
        venue_latitude: Number(hit.lat.toFixed(6)),
        venue_longitude: Number(hit.lng.toFixed(6)),
      }));
      setMatched(hit.matched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The address lookup failed.");
    } finally {
      setLocating(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share a location — enter the coordinates manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          venue_latitude: Number(pos.coords.latitude.toFixed(6)),
          venue_longitude: Number(pos.coords.longitude.toFixed(6)),
        })),
      () => setError("Couldn't read your location. Enter the coordinates manually."),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isVenue && (form.venue_latitude == null || form.venue_longitude == null)) {
      setError(
        "A venue needs its map coordinates — that's what vendor check-in is measured against.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: ServiceInput = {
        ...form,
        price: Number(form.price),
        experience: formatExperienceYears(form.experience),
        subcategory: form.subcategory || null,
        location: form.location || null,
      };
      const creating = editing === "new";
      if (creating) {
        const created = await createService(payload);
        if (newPhotos.length) {
          try {
            await uploadServiceImages(created.service_id, newPhotos);
          } catch {
            // The package itself is saved by this point — say that plainly
            // instead of letting the outer catch claim it wasn't.
            setError("Package saved, but the photos didn't upload. Add them from the list below.");
          }
        }
        if (newVideos.length) {
          try {
            await uploadServiceVideos(created.service_id, newVideos);
          } catch {
            setError((prev) =>
              prev
                ? `${prev} The videos didn't upload either — add them from the list below.`
                : "Package saved, but the videos didn't upload. Add them from the list below.",
            );
          }
        }
      } else if (editing) {
        await updateService(editing, payload);
      }
      await refresh();
      setNewPhotos([]);
      setNewVideos([]);
      setEditing(null);
      // After all of this component's own state has settled — the parent may
      // respond by unmounting it (the onboarding wizard swaps to its next
      // step), and that should happen after, not mid-update.
      if (creating) onServiceAdded?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that package.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(serviceId: string) {
    setBusy(true);
    try {
      await deleteService(serviceId);
      await refresh();
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that package.");
    } finally {
      setBusy(false);
    }
  }

  // Takes the input element itself (not just its FileList) so the value reset
  // below clears the exact input the user picked from. Every service card
  // renders its own file input, so a ref shared across the list would land on
  // whichever card happened to mount last — clearing the wrong one left a
  // just-used input still holding its old value, which silently swallows a
  // retry: selecting the same file again fires no change event.
  async function addPhotos(serviceId: string, input: HTMLInputElement) {
    const files = input.files;
    if (!files?.length) return;
    setUploadingFor(serviceId);
    setError(null);
    try {
      const { ok, rejected } = checkImageFiles(Array.from(files));
      if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
      if (ok.length) {
        await uploadServiceImages(serviceId, ok);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload those photos.");
    } finally {
      setUploadingFor(null);
      input.value = "";
    }
  }

  async function removePhoto(serviceId: string, url: string) {
    try {
      await deleteServiceImage(serviceId, url);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that photo.");
    }
  }

  async function addVideos(serviceId: string, input: HTMLInputElement) {
    const files = input.files;
    if (!files?.length) return;
    setUploadingVideoFor(serviceId);
    setError(null);
    try {
      const { ok, rejected } = await checkVideoFiles(Array.from(files));
      if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
      if (ok.length) {
        await uploadServiceVideos(serviceId, ok);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that video.");
    } finally {
      setUploadingVideoFor(null);
      input.value = "";
    }
  }

  async function removeVideo(serviceId: string, url: string) {
    try {
      await deleteServiceVideo(serviceId, url);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that video.");
    }
  }

  // Checked at picking time, not at save time — a rejected file should never
  // sit unexplained in "3 selected" until the form is submitted.
  function pickNewPhotos(files: FileList | null) {
    const { ok, rejected } = checkImageFiles(Array.from(files ?? []));
    if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
    setNewPhotos(ok);
  }

  async function pickNewVideos(files: FileList | null) {
    const { ok, rejected } = await checkVideoFiles(Array.from(files ?? []));
    if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
    setNewVideos(ok);
  }

  return (
    <section id="services" className="mt-9 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="serif text-2xl text-ink">Packages</h2>
          <p className="mt-1 text-sm text-ink-soft">
            What clients can book. Each one has its own price and terms.
          </p>
        </div>
        {editing === null ? <Button onClick={startNew}>Add a package</Button> : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
          {error}
        </p>
      ) : null}

      {editing !== null ? (
        <Card className="mt-5 p-6">
          <h3 className="serif text-xl text-ink">
            {editing === "new" ? "New package" : "Edit package"}
          </h3>
          <form onSubmit={save} className="mt-4 grid gap-4">
            <Field
              label="Package name"
              placeholder="Full-Day Wedding Coverage"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="Price"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.price || ""}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                  Priced by
                </span>
                <select
                  value={form.price_unit ?? "event"}
                  onChange={(e) => setForm({ ...form, price_unit: e.target.value })}
                  className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
                >
                  {PRICE_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                  Category
                </span>
                <select
                  required
                  value={form.category ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value, subcategory: "" })
                  }
                  className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
                >
                  <option value="" disabled>
                    Choose
                  </option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {isOther ? (
                // "Other" has no subcategories in the taxonomy, so there is
                // nothing to pick from — the vendor types what they do, as they
                // do on iOS. The backend only validates a subcategory against
                // the list when its category has one, so free text is accepted.
                <Field
                  label="Speciality"
                  placeholder="Describe what you offer"
                  required
                  value={form.subcategory ?? ""}
                  onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                />
              ) : subOptions.length > 0 ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                    Speciality
                  </span>
                  <select
                    value={form.subcategory ?? ""}
                    onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                    className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
                  >
                    <option value="">None</option>
                    {subOptions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <Field
              label="Years of experience"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="9"
              required
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
            />

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                Description
              </span>
              <textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What's included."
                className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
              />
            </label>

            {isVenue ? (
              <div className="rounded-xl bg-panel p-4">
                <p className="text-sm font-medium text-ink">Where is it?</p>
                <p className="mt-1 text-xs text-ink-faint">
                  A venue anchors the whole event — its map pin is what vendor
                  check-in is measured against, so it&apos;s required.
                </p>
                <div className="mt-3 grid gap-3">
                  <Field
                    label="Address"
                    required
                    value={form.location ?? ""}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="Latitude"
                      type="number"
                      step="any"
                      required
                      value={form.venue_latitude ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          venue_latitude: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                    <Field
                      label="Longitude"
                      type="number"
                      step="any"
                      required
                      value={form.venue_longitude ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          venue_longitude: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  {matched ? (
                    <p className="rounded-lg bg-green/10 px-3 py-2 text-xs text-ink-soft">
                      Pinned to <strong className="font-semibold text-ink">{matched}</strong>. If
                      that isn&apos;t the right door, adjust the coordinates above.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="md"
                      disabled={locating}
                      onClick={locateFromAddress}
                    >
                      {locating ? "Looking up…" : "Find it from the address"}
                    </Button>
                    <Button type="button" variant="ghost" size="md" onClick={useMyLocation}>
                      I&apos;m standing there now
                    </Button>
                  </div>
                  <p className="text-xs text-ink-faint">
                    Address lookup by the{" "}
                    <a
                      href="https://geocoding.geo.census.gov"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-ink-soft"
                    >
                      US Census Bureau
                    </a>
                    . US addresses only.
                  </p>
                </div>
              </div>
            ) : null}

            {editing === "new" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink-soft">Photos</p>
                  <label className="inline-block cursor-pointer rounded-lg border border-dashed border-card-edge px-3 py-2 text-xs text-ink-soft hover:border-gold">
                    {newPhotos.length
                      ? `${newPhotos.length} selected — choose again to replace`
                      : "+ Choose photos"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => pickNewPhotos(e.target.files)}
                    />
                  </label>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink-soft">Videos</p>
                  <label className="inline-block cursor-pointer rounded-lg border border-dashed border-card-edge px-3 py-2 text-xs text-ink-soft hover:border-gold">
                    {newVideos.length
                      ? `${newVideos.length} selected — choose again to replace`
                      : "+ Choose videos"}
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      multiple
                      className="hidden"
                      onChange={(e) => void pickNewVideos(e.target.files)}
                    />
                  </label>
                  <span className="mt-1 block text-xs text-ink-faint">
                    Up to 50MB and 30 seconds each, up to 3 per package.
                  </span>
                </div>
              </div>
            ) : null}

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={Boolean(form.negotiable)}
                onChange={(e) => setForm({ ...form, negotiable: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-ink-soft">
                Open to offers on this package
                <span className="block text-xs text-ink-faint">
                  Clients can propose a price and you settle it before booking.
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editing === "new" ? "Add package" : "Save changes"}
              </Button>
              <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {services.length === 0 && editing === null ? (
        <p className="mt-8 text-center text-ink-soft">
          No packages yet. Clients can&apos;t book you until you list at least one.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {services.map((s) => {
            const unit = priceUnitLabel(s.price_unit);
            return (
              <Card key={s.service_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="serif text-lg text-ink">{s.name}</h3>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {money(s.price)} {unit}
                      {s.negotiable ? " · open to offers" : ""}
                    </p>
                    {s.description ? (
                      <p className="mt-1 text-sm text-ink-faint">{s.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" size="md" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                    <Button
                      variant="quiet"
                      size="md"
                      onClick={() => setConfirmDelete(s.service_id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Photos & videos */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {usableMedia(s.media).map((item: MediaItem) => {
                    // A video's file can't go in an <img> — its server-generated
                    // poster frame stands in for it here.
                    const thumbSrc = item.type === "video" ? item.thumbnail_url : item.url;
                    return (
                      <div key={item.url} className="relative">
                        {thumbSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbSrc}
                            alt=""
                            className="size-16 rounded-lg object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="size-16 rounded-lg bg-panel" />
                        )}
                        {item.type === "video" ? (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 grid place-items-center"
                          >
                            <span className="grid size-5 place-items-center rounded-full bg-black/55 text-white">
                              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-2.5">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </span>
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            item.type === "video"
                              ? removeVideo(s.service_id, item.url)
                              : removePhoto(s.service_id, item.url)
                          }
                          className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-maroon text-xs text-ground after:absolute after:-inset-2 after:content-['']"
                          aria-label={`Remove ${item.type}`}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <label className="cursor-pointer rounded-lg border border-dashed border-card-edge px-3 py-2 text-xs text-ink-soft hover:border-gold">
                    {uploadingFor === s.service_id ? "Uploading…" : "+ Add photos"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => addPhotos(s.service_id, e.currentTarget)}
                    />
                  </label>
                  <label className="cursor-pointer rounded-lg border border-dashed border-card-edge px-3 py-2 text-xs text-ink-soft hover:border-gold">
                    {uploadingVideoFor === s.service_id ? "Uploading…" : "+ Add video"}
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      multiple
                      className="hidden"
                      onChange={(e) => addVideos(s.service_id, e.currentTarget)}
                    />
                  </label>
                </div>

                {confirmDelete === s.service_id ? (
                  <div className="mt-3 rounded-lg bg-panel p-3">
                    <p className="text-xs text-ink-soft">
                      Delete {s.name}? Clients won&apos;t be able to book it.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="md"
                        disabled={busy}
                        onClick={() => remove(s.service_id)}
                      >
                        {busy ? "Deleting…" : "Delete"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
