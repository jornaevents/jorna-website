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
//
// Phase 1 of the package overhaul (backend 0063) added what a real listing
// needs beyond one price: a status (listed / private / archived), hours
// included, a "what's included" list, priced add-ons, and optional contract
// terms that override the vendor's defaults. Years in business moved to the
// vendor's own profile — it was asked again on every package.

import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import {
  createService,
  deleteService,
  deleteServiceImage,
  deleteServiceVideo,
  listMyServices,
  updateService,
  uploadServiceImages,
  uploadServiceVideos,
  type ServiceInput,
} from "@/lib/jorna";
import {
  categoryLabel,
  priceUnitLabel,
  usableMedia,
  type AddOn,
  type MediaItem,
  type PackageStatus,
  type ServiceItem,
  type TaxonomyCategory,
  type VendorDetail,
} from "@/lib/types";
import { geocodeUsAddress } from "@jorna/shared/lib/geocode";
import { checkImageFiles, checkVideoFiles, describeRejections } from "@jorna/shared/lib/uploads";
import { Button, Card, Chip, Field } from "@jorna/shared/components/ui";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

/** "6 hours" — included hours if set, else the listing's duration. */
function coverage(s: ServiceItem): string {
  if (s.included_hours) return `${s.included_hours} hour${s.included_hours === 1 ? "" : "s"}`;
  if (s.duration_minutes) {
    const h = Math.round((s.duration_minutes / 60) * 10) / 10;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return "Flexible";
}

/** The speciality it's listed under, in words. */
function bestFor(s: ServiceItem, categories: TaxonomyCategory[]): string {
  const cat = categories.find((c) => c.value === s.category);
  const sub = cat?.subcategories?.find((x) => x.value === s.subcategory);
  return sub?.label ?? cat?.label ?? (s.category ? categoryLabel(s.subcategory || s.category) : "Any event");
}

/** Lets the page's header button open the new-package form. */
export interface ServicesManagerHandle {
  startNew: () => void;
}

// A locally-generated preview — an object URL for a File the vendor just
// picked or dropped, not yet (or not ever going to be) on the server. Kept
// distinct from MediaItem, which describes server-side media, since the two
// shapes aren't interchangeable.
type LocalPreview = { url: string; type: "image" | "video" };

// The rate's multiplier. "event" is a flat price — everything else needs a
// quantity from the client at booking time before it can be paid.
const PRICE_UNITS = [
  { value: "event", label: "Flat price" },
  { value: "person", label: "Per person" },
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "performer", label: "Per performer" },
];

const ADD_ON_UNITS: { value: AddOn["price_unit"]; label: string }[] = [
  { value: "event", label: "flat" },
  { value: "person", label: "per person" },
  { value: "hour", label: "per hour" },
];

/** An add-on row while it's being typed — price as text, same reason as
 *  FormState.price below. */
type AddOnDraft = { id?: string; name: string; price: string; price_unit: AddOn["price_unit"] };

// Same as ServiceInput, but price is the raw text the vendor is typing, not
// a number — a native number input's own min/step validation fights a vendor
// trying to clear a pre-filled price and type a new one (it can snap back to
// "0" rather than let the field sit empty mid-edit). Plain text sidesteps
// that entirely; save() parses and validates it before this goes anywhere
// near the API.
//
// The other numeric fields are text for the same reason; terms are shown in
// the units a vendor thinks in (days, dollars) and converted in save().
type FormState = Omit<
  ServiceInput,
  | "price"
  | "experience"
  | "included_hours"
  | "inclusions"
  | "add_ons"
  | "deposit_percent"
  | "cancellation_window_hours"
  | "overtime_rate_cents"
> & {
  price: string;
  included_hours: string;
  /** One inclusion per line. */
  inclusionsText: string;
  add_ons: AddOnDraft[];
  deposit_percent: string;
  cancellation_days: string;
  overtime_rate: string;
};

const blank: FormState = {
  name: "",
  price: "",
  // No default: the vendor picks. It used to start on "per hour" (iOS parity,
  // and the safer mistake), but a vendor typing a flat price could miss the
  // dropdown entirely and list an hourly rate by accident. Asking is safer
  // than either default.
  price_unit: "",
  description: "",
  negotiable: false,
  require_guest_count: false,
  require_performer_count: false,
  is_popular: false,
  status: "active",
  included_hours: "",
  inclusionsText: "",
  add_ons: [],
  deposit_percent: "",
  cancellation_days: "",
  overtime_rate: "",
};

/** The editable form for an existing package — also what Duplicate starts
 *  from. */
function formFrom(s: ServiceItem): FormState {
  return {
    name: s.name,
    price: String(s.price),
    price_unit: s.price_unit ?? "event",
    category: s.category ?? "",
    subcategory: s.subcategory ?? "",
    description: s.description ?? "",
    negotiable: Boolean(s.negotiable),
    require_guest_count: Boolean(s.require_guest_count),
    require_performer_count: Boolean(s.require_performer_count),
    is_popular: Boolean(s.is_popular),
    location: s.location ?? "",
    venue_latitude: s.venue_latitude ?? null,
    venue_longitude: s.venue_longitude ?? null,
    status: s.status === "hidden" ? "hidden" : "active",
    included_hours: s.included_hours != null ? String(s.included_hours) : "",
    inclusionsText: (s.inclusions ?? []).join("\n"),
    add_ons: (s.add_ons ?? []).map((a) => ({ ...a, price: String(a.price) })),
    deposit_percent: s.deposit_percent != null ? String(s.deposit_percent) : "",
    cancellation_days:
      s.cancellation_window_hours != null ? String(Math.round(s.cancellation_window_hours / 24)) : "",
    overtime_rate: s.overtime_rate_cents != null ? String(s.overtime_rate_cents / 100) : "",
  };
}

function hasCustomTerms(f: FormState): boolean {
  return Boolean(f.deposit_percent || f.cancellation_days || f.overtime_rate);
}

export function ServicesManager({
  vendor,
  categories,
  initial,
  autoStartNew = false,
  onServiceAdded,
  onServicesChange,
  ref,
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
  /** The list after every reload — the profile's checklist and preview follow it. */
  onServicesChange?: (items: ServiceItem[]) => void;
  ref?: Ref<ServicesManagerHandle>;
}) {
  const [services, setServices] = useState<ServiceItem[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  /** The address as the Census matched it, shown back after a successful pin. */
  const [matched, setMatched] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | "new" | null>(autoStartNew ? "new" : null);
  // Which package row is open (the design's expandable list).
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(
    autoStartNew
      ? { ...blank, category: vendor.category ?? "", subcategory: vendor.subcategory ?? "" }
      : blank,
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Custom terms are a minority case — folded away unless the package has them.
  const [showTerms, setShowTerms] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadingVideoFor, setUploadingVideoFor] = useState<string | null>(null);
  // Photos/videos chosen while filling in a new service. They can only be sent
  // once the service exists (the upload endpoint is per-service), so they wait
  // here and go up right after create — iOS collects the image on its create
  // screen the same way rather than making the vendor come back for it.
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [newVideos, setNewVideos] = useState<File[]>([]);
  // Object URLs for the staged files above — memoized (rather than computed
  // inline on every render) so they're only ever created when
  // newPhotos/newVideos actually change, and revoked by the effects below.
  const newPhotoPreviews = useMemo(() => newPhotos.map((f) => URL.createObjectURL(f)), [newPhotos]);
  const newVideoPreviews = useMemo(() => newVideos.map((f) => URL.createObjectURL(f)), [newVideos]);
  // Local previews for an upload already in flight against a saved service,
  // keyed by service_id — cleared (and their object URLs revoked) once that
  // upload settles, success or failure, since refresh() brings the real
  // thumbnail on success and the error banner already covers failure.
  const [pendingPhotosFor, setPendingPhotosFor] = useState<Record<string, LocalPreview[]>>({});
  const [pendingVideosFor, setPendingVideosFor] = useState<Record<string, LocalPreview[]>>({});
  // Which dropzone (by a small string key — "new-photos", "new-videos", or
  // `photos-${serviceId}` / `video-${serviceId}`) is currently being dragged
  // over. A single keyed value rather than per-dropzone state, since the
  // existing-package dropzones live inside services.map() and can't each
  // hold their own hook.
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null);

  // Each set of previews is revoked when it's replaced or the form unmounts.
  useEffect(() => () => newPhotoPreviews.forEach((u) => URL.revokeObjectURL(u)), [newPhotoPreviews]);
  useEffect(() => () => newVideoPreviews.forEach((u) => URL.revokeObjectURL(u)), [newVideoPreviews]);

  // Shared drag-and-drop wiring for all four pickers — spread onto a
  // dropzone's <label>. A plain function rather than a custom hook so it's
  // safe to call inside services.map() too.
  function dropZoneProps(key: string, onFiles: (files: FileList) => void) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragActiveKey(key);
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        setDragActiveKey((k) => (k === key ? null : k));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragActiveKey((k) => (k === key ? null : k));
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      },
    };
  }

  function dropZoneClass(key: string) {
    return dragActiveKey === key
      ? "border-gold bg-gold/5"
      : "border-card-edge hover:border-gold";
  }

  // The owner's list, hidden and archived packages included — the public
  // list only has active ones.
  async function refresh(): Promise<ServiceItem[]> {
    const res = await listMyServices(vendor.vendor_id);
    setServices(res.items);
    onServicesChange?.(res.items);
    return res.items;
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
    setShowTerms(false);
    setError(null);
    setNotice(null);
    // Otherwise a match from whatever venue was last geocoded — possibly a
    // different service entirely — leaks into this blank form.
    setMatched(null);
  }
  useImperativeHandle(ref, () => ({
    startNew: () => {
      startNew();
      setExpanded(null);
    },
  }));


  function startEdit(s: ServiceItem) {
    const f = formFrom(s);
    setForm(f);
    setNewPhotos([]);
    setNewVideos([]);
    setEditing(s.service_id);
    setExpanded(s.service_id);
    setShowTerms(hasCustomTerms(f));
    setError(null);
    setNotice(null);
    setMatched(null);
  }

  /** A new package pre-filled from an existing one — everything but the
   *  media, which belongs to the original. */
  function duplicate(s: ServiceItem) {
    const f = formFrom(s);
    setForm({
      ...f,
      name: `${s.name} (copy)`,
      // New ids: these are new add-ons, not the original's.
      add_ons: f.add_ons.map((a) => ({ name: a.name, price: a.price, price_unit: a.price_unit })),
    });
    setNewPhotos([]);
    setNewVideos([]);
    setEditing("new");
    setShowTerms(hasCustomTerms(f));
    setError(null);
    setNotice(null);
    setMatched(null);
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
    if (!form.price_unit) {
      setError("Choose how this package is priced.");
      return;
    }
    const price = Number(form.price);
    if (!form.price.trim() || !(price > 0)) {
      setError("Enter a price greater than $0.");
      return;
    }
    const addOns = form.add_ons.filter((a) => a.name.trim() || a.price.trim());
    if (addOns.some((a) => !a.name.trim() || !(Number(a.price) > 0))) {
      setError("Each add-on needs a name and a price greater than $0.");
      return;
    }
    const deposit = form.deposit_percent ? Number(form.deposit_percent) : null;
    if (deposit != null && !(deposit >= 0 && deposit <= 100)) {
      setError("A deposit is between 0% and 100%.");
      return;
    }
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
        name: form.name,
        price,
        price_unit: form.price_unit,
        category: form.category,
        subcategory: form.subcategory || null,
        description: form.description,
        negotiable: form.negotiable,
        require_guest_count: form.require_guest_count,
        require_performer_count: form.require_performer_count,
        is_popular: form.is_popular,
        location: form.location || null,
        venue_latitude: form.venue_latitude,
        venue_longitude: form.venue_longitude,
        status: form.status,
        included_hours: form.included_hours ? Number(form.included_hours) : null,
        inclusions: form.inclusionsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        add_ons: addOns.map((a) => ({
          ...(a.id ? { id: a.id } : {}),
          name: a.name.trim(),
          price: Number(a.price),
          price_unit: a.price_unit,
        })),
        deposit_percent: deposit,
        cancellation_window_hours: form.cancellation_days ? Number(form.cancellation_days) * 24 : null,
        overtime_rate_cents: form.overtime_rate ? Math.round(Number(form.overtime_rate) * 100) : null,
      };
      if (editing === "new") {
        // New packages go to the end of the vendor's order.
        const orders = services.map((x) => x.sort_order ?? -1);
        payload.sort_order = (orders.length ? Math.max(...orders) : -1) + 1;
      }
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
      const items = await refresh();
      setConfirmDelete(null);
      // The backend archives instead of deleting a package any booking uses.
      // Say so, or it looks like Delete didn't work.
      if (items.some((x) => x.service_id === serviceId)) {
        setNotice("That package has bookings, so it was archived instead of deleted.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that package.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: ServiceItem, status: PackageStatus) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateService(s.service_id, { status });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that package.");
    } finally {
      setBusy(false);
    }
  }

  /** Swap a package with its neighbour. Renumbers the whole visible list so
   *  packages that never had an order (null) get one the first time. */
  async function move(s: ServiceItem, direction: -1 | 1) {
    const list = [...ordered];
    const from = list.findIndex((x) => x.service_id === s.service_id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        list
          .map((x, i) => ({ x, i }))
          .filter(({ x, i }) => x.sort_order !== i)
          .map(({ x, i }) => updateService(x.service_id, { sort_order: i })),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reorder your packages.");
    } finally {
      setBusy(false);
    }
  }

  // Takes the input element itself (not just its FileList) so the value reset
  // below clears the exact input the user picked from. Every service card
  // renders its own file input, so a ref shared across the list would land on
  // whichever card happened to mount last — clearing the wrong one left a
  // just-used input still holding its old value, which silently swallows a
  // retry: selecting the same file again fires no change event. A drop has no
  // backing input, so it passes the FileList straight through instead.
  async function addPhotos(serviceId: string, source: HTMLInputElement | FileList) {
    const files = source instanceof HTMLInputElement ? source.files : source;
    if (!files?.length) return;
    setUploadingFor(serviceId);
    setError(null);
    let pending: LocalPreview[] = [];
    try {
      const { ok, rejected } = checkImageFiles(Array.from(files));
      if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
      pending = ok.map((f) => ({ url: URL.createObjectURL(f), type: "image" as const }));
      if (pending.length) {
        setPendingPhotosFor((prev) => ({
          ...prev,
          [serviceId]: [...(prev[serviceId] ?? []), ...pending],
        }));
        await uploadServiceImages(serviceId, ok);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload those photos.");
    } finally {
      setUploadingFor(null);
      if (source instanceof HTMLInputElement) source.value = "";
      if (pending.length) {
        pending.forEach((p) => URL.revokeObjectURL(p.url));
        setPendingPhotosFor((prev) => {
          const remaining = (prev[serviceId] ?? []).filter((p) => !pending.includes(p));
          const next = { ...prev };
          if (remaining.length) next[serviceId] = remaining;
          else delete next[serviceId];
          return next;
        });
      }
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

  async function addVideos(serviceId: string, source: HTMLInputElement | FileList) {
    const files = source instanceof HTMLInputElement ? source.files : source;
    if (!files?.length) return;
    setUploadingVideoFor(serviceId);
    setError(null);
    let pending: LocalPreview[] = [];
    try {
      const { ok, rejected } = await checkVideoFiles(Array.from(files));
      if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
      pending = ok.map((f) => ({ url: URL.createObjectURL(f), type: "video" as const }));
      if (pending.length) {
        setPendingVideosFor((prev) => ({
          ...prev,
          [serviceId]: [...(prev[serviceId] ?? []), ...pending],
        }));
        await uploadServiceVideos(serviceId, ok);
        await refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that video.");
    } finally {
      setUploadingVideoFor(null);
      if (source instanceof HTMLInputElement) source.value = "";
      if (pending.length) {
        pending.forEach((p) => URL.revokeObjectURL(p.url));
        setPendingVideosFor((prev) => {
          const remaining = (prev[serviceId] ?? []).filter((p) => !pending.includes(p));
          const next = { ...prev };
          if (remaining.length) next[serviceId] = remaining;
          else delete next[serviceId];
          return next;
        });
      }
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
    // Adds to what's already picked — choosing again used to replace it.
    setNewPhotos((prev) => [...prev, ...ok]);
  }

  async function pickNewVideos(files: FileList | null) {
    const { ok, rejected } = await checkVideoFiles(Array.from(files ?? []));
    if (rejected.length) setError(`Skipped: ${describeRejections(rejected)}.`);
    setNewVideos((prev) => [...prev, ...ok]);
  }

  // Listed and private packages in the vendor's order (the backend already
  // sorts by it); archived ones set apart underneath.
  const ordered = services.filter((x) => x.status !== "archived");
  const archived = services.filter((x) => x.status === "archived");
  const unitNoun = PRICE_UNITS.find((u) => u.value === form.price_unit)?.label.toLowerCase();

  // The full editor: shown at the top for a new package, and inside the
  // package's own row when editing one.
  const editorCard =
    editing !== null ? (
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

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-soft">How is it priced?</p>
              <div role="radiogroup" aria-label="How is it priced?" className="flex flex-wrap gap-2">
                {PRICE_UNITS.map((u) => (
                  <Chip
                    key={u.value}
                    active={form.price_unit === u.value}
                    onClick={() => setForm({ ...form, price_unit: u.value })}
                  >
                    {u.label}
                  </Chip>
                ))}
              </div>
            </div>

            {form.price_unit ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label={form.price_unit === "event" ? "Price" : `Price ${unitNoun}`}
                  type="text"
                  inputMode="decimal"
                  placeholder={form.price_unit === "event" ? "1400" : "45"}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
                <Field
                  label="Hours included (optional)"
                  type="text"
                  inputMode="decimal"
                  placeholder="4"
                  hint="How long the base price covers, if it's time-bound."
                  value={form.included_hours}
                  onChange={(e) => setForm({ ...form, included_hours: e.target.value })}
                />
              </div>
            ) : null}

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

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                Description
              </span>
              <textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Your style, what the day looks like, who it suits."
                className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">
                What&apos;s included (optional)
              </span>
              <textarea
                rows={3}
                value={form.inclusionsText}
                onChange={(e) => setForm({ ...form, inclusionsText: e.target.value })}
                placeholder={"One per line, e.g.\nSound system and lighting\nTwo wireless mics"}
                className="w-full rounded-xl border border-card-edge bg-ground-2 px-3.5 py-2.5 text-ink outline-none focus:border-gold"
              />
            </label>

            {/* Add-ons: priced extras a client can add on top of the package. */}
            <div>
              <p className="text-sm font-medium text-ink-soft">Add-ons (optional)</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                Extras on top of the package price, like an extra hour or a second photographer.
              </p>
              {form.add_ons.length ? (
                <div className="mt-2 grid gap-2">
                  {form.add_ons.map((a, i) => (
                    <div key={a.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Add-on ${i + 1} name`}
                        placeholder="Extra hour"
                        value={a.name}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            add_ons: form.add_ons.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                        className="min-w-0 flex-1 rounded-xl border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                      />
                      <input
                        aria-label={`Add-on ${i + 1} price`}
                        inputMode="decimal"
                        placeholder="$"
                        value={a.price}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            add_ons: form.add_ons.map((x, j) =>
                              j === i ? { ...x, price: e.target.value } : x,
                            ),
                          })
                        }
                        className="w-24 rounded-xl border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                      />
                      <select
                        aria-label={`Add-on ${i + 1} unit`}
                        value={a.price_unit}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            add_ons: form.add_ons.map((x, j) =>
                              j === i ? { ...x, price_unit: e.target.value as AddOn["price_unit"] } : x,
                            ),
                          })
                        }
                        className="rounded-xl border border-card-edge bg-ground-2 px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
                      >
                        {ADD_ON_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setForm({ ...form, add_ons: form.add_ons.filter((_, j) => j !== i) })
                        }
                        className="px-1 text-sm text-ink-faint hover:text-ink"
                        aria-label={`Remove add-on ${i + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="mt-2"
                onClick={() =>
                  setForm({
                    ...form,
                    add_ons: [...form.add_ons, { name: "", price: "", price_unit: "event" }],
                  })
                }
              >
                + Add an add-on
              </Button>
            </div>

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
                  {/* The pin comes from the address lookup below; the raw
                      numbers are only for fixing a pin that landed on the
                      wrong door. */}
                  <details className="rounded-lg border border-line-soft px-3 py-2">
                    <summary className="cursor-pointer text-xs text-ink-soft">
                      {form.venue_latitude != null && form.venue_longitude != null
                        ? `Pin set (${form.venue_latitude.toFixed(4)}, ${form.venue_longitude.toFixed(4)}) — adjust by hand`
                        : "Enter the pin by hand"}
                    </summary>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  </details>
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
                  {newPhotos.length ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {newPhotos.map((_, i) => (
                        <div key={i} className="relative">
                          {newPhotoPreviews[i] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={newPhotoPreviews[i]}
                              alt=""
                              className="size-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="size-16 rounded-lg bg-panel" />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setNewPhotos((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-maroon text-xs text-ground after:absolute after:-inset-2 after:content-['']"
                            aria-label="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <label
                    {...dropZoneProps("new-photos", (files) => pickNewPhotos(files))}
                    className={`flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm text-ink-soft ${dropZoneClass("new-photos")}`}
                  >
                    <span aria-hidden="true" className="text-2xl leading-none text-ink-faint">
                      +
                    </span>
                    <span>{newPhotos.length ? "Add more photos" : "Choose or drop photos"}</span>
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
                  {newVideos.length ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {newVideos.map((_, i) => (
                        <div key={i} className="relative">
                          {newVideoPreviews[i] ? (
                            <video
                              src={newVideoPreviews[i]}
                              muted
                              playsInline
                              className="size-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="size-16 rounded-lg bg-panel" />
                          )}
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
                          <button
                            type="button"
                            onClick={() =>
                              setNewVideos((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-maroon text-xs text-ground after:absolute after:-inset-2 after:content-['']"
                            aria-label="Remove video"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <label
                    {...dropZoneProps("new-videos", (files) => void pickNewVideos(files))}
                    className={`flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm text-ink-soft ${dropZoneClass("new-videos")}`}
                  >
                    <span aria-hidden="true" className="text-2xl leading-none text-ink-faint">
                      +
                    </span>
                    <span>{newVideos.length ? "Add more videos" : "Choose or drop videos"}</span>
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
                checked={Boolean(form.is_popular)}
                onChange={(e) => setForm({ ...form, is_popular: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-ink-soft">
                Mark as most popular
                <span className="block text-xs text-ink-faint">
                  Clients see a &ldquo;Most popular&rdquo; badge on it. Only one package has it at a time.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.price_unit === "person" || Boolean(form.require_guest_count)}
                disabled={form.price_unit === "person"}
                onChange={(e) => setForm({ ...form, require_guest_count: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-ink-soft">
                Always require a guest count
                <span className="block text-xs text-ink-faint">
                  {form.price_unit === "person"
                    ? "Already required — this package is priced per person."
                    : "A client can't send a request without one, even though this package doesn't price by guest."}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={form.price_unit === "performer" || Boolean(form.require_performer_count)}
                disabled={form.price_unit === "performer"}
                onChange={(e) => setForm({ ...form, require_performer_count: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-ink-soft">
                Always require a performer count
                <span className="block text-xs text-ink-faint">
                  {form.price_unit === "performer"
                    ? "Already required — this package is priced per performer."
                    : "A client can't send a request without one, even though this package doesn't price by performer."}
                </span>
              </span>
            </label>

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

            {/* Per-package contract terms. Blank = the vendor's defaults from
                Profile → Contract defaults, shown as placeholders so it's
                clear what "blank" means. */}
            <div className="rounded-xl bg-panel p-4">
              <button
                type="button"
                onClick={() => setShowTerms((v) => !v)}
                aria-expanded={showTerms}
                className="text-sm font-medium text-ink"
              >
                {showTerms ? "▾" : "▸"} Custom contract terms for this package
              </button>
              {showTerms ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field
                    label="Deposit (%)"
                    inputMode="numeric"
                    placeholder={vendor.default_deposit_percent?.toString() ?? "—"}
                    value={form.deposit_percent}
                    onChange={(e) => setForm({ ...form, deposit_percent: e.target.value })}
                  />
                  <Field
                    label="Cancellation window (days)"
                    inputMode="numeric"
                    placeholder={
                      vendor.default_cancellation_window_hours != null
                        ? String(Math.round(vendor.default_cancellation_window_hours / 24))
                        : "—"
                    }
                    value={form.cancellation_days}
                    onChange={(e) => setForm({ ...form, cancellation_days: e.target.value })}
                  />
                  <Field
                    label="Overtime rate ($/hr)"
                    inputMode="decimal"
                    placeholder={
                      vendor.default_overtime_rate_cents != null
                        ? String(vendor.default_overtime_rate_cents / 100)
                        : "—"
                    }
                    value={form.overtime_rate}
                    onChange={(e) => setForm({ ...form, overtime_rate: e.target.value })}
                  />
                  <p className="text-xs text-ink-faint sm:col-span-3">
                    Leave blank to use your defaults. New contracts for this package start
                    from these.
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-soft">Who can see it</p>
              <div role="radiogroup" aria-label="Who can see it" className="flex flex-wrap gap-2">
                <Chip
                  active={form.status !== "hidden"}
                  onClick={() => setForm({ ...form, status: "active" })}
                >
                  Listed publicly
                </Chip>
                <Chip
                  active={form.status === "hidden"}
                  onClick={() => setForm({ ...form, status: "hidden" })}
                >
                  Private
                </Chip>
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                {form.status === "hidden"
                  ? "Not on your listing or in search — you can still send it in a contract."
                  : "On your listing, in search, and bookable by clients."}
              </p>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold"
              >
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editing === "new" ? "Add package" : "Save changes"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setMatched(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
    ) : null;

  return (
    <section id="services" className="mt-9 scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Services &amp; pricing</p>
          <h2 className="serif mt-1 text-xl text-ink">Your packages</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Show clients what they can book with you. Each one has its own price and terms.
          </p>
        </div>
        {editing === null ? (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line bg-card px-3 text-sm font-semibold text-ink-soft hover:text-ink"
          >
            <span className="text-lg leading-none text-gold">+</span> Add package
          </button>
        ) : null}
      </div>

      {error && editing === null ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-lg bg-gold/10 px-3 py-2 text-sm text-ink-soft">{notice}</p>
      ) : null}

      {editing === "new" ? editorCard : null}

      {ordered.length === 0 && editing === null ? (
        <p className="mt-8 text-center text-ink-soft">
          No packages yet. Clients can&apos;t book you until you list at least one.
        </p>
      ) : (
        <div className="mt-5 grid gap-2">
          {ordered.map((s, index) => {
            const unit = priceUnitLabel(s.price_unit);
            const details = [
              `${money(s.price)} ${unit}`.trim(),
              s.included_hours ? `${s.included_hours} hrs included` : null,
              s.add_ons?.length
                ? `${s.add_ons.length} add-on${s.add_ons.length === 1 ? "" : "s"}`
                : null,
              s.negotiable ? "open to offers" : null,
            ].filter(Boolean);
            return (
              <article
                key={s.service_id}
                className={`overflow-hidden rounded-[13px] border bg-card transition ${
                  expanded === s.service_id ? "border-line shadow-[0_8px_24px_rgba(50,44,38,0.06)]" : "border-card-edge"
                }`}
              >
                <button
                  type="button"
                  aria-expanded={expanded === s.service_id}
                  onClick={() => setExpanded(expanded === s.service_id ? null : s.service_id)}
                  className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-3.5 py-3.5 text-left md:grid-cols-[2.25rem_minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_8rem_auto]"
                >
                  <span className="serif text-sm text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                  <span className="grid min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <strong className="truncate text-sm text-ink">{s.name}</strong>
                      {s.is_popular ? (
                        <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[0.68rem] font-semibold text-gold">
                          Most popular
                        </span>
                      ) : null}
                      {s.status === "hidden" ? (
                        <span className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[0.68rem] font-semibold text-ink-soft">
                          Private
                        </span>
                      ) : null}
                    </span>
                    <small className="truncate text-xs text-ink-faint">{s.description || details.slice(1).join(" · ")}</small>
                  </span>
                  <span className="hidden min-w-0 md:grid">
                    <small className="text-[0.68rem] text-ink-faint">Coverage</small>
                    <strong className="truncate text-sm text-ink">{coverage(s)}</strong>
                  </span>
                  <span className="hidden min-w-0 md:grid">
                    <small className="text-[0.68rem] text-ink-faint">Best for</small>
                    <strong className="truncate text-sm text-ink">{bestFor(s, categories)}</strong>
                  </span>
                  <span className="grid text-right">
                    <small className="text-[0.68rem] text-ink-faint">Starting at</small>
                    <strong className="serif text-sm text-ink">
                      {money(s.price)}
                      {unit ? <span className="font-sans text-xs font-normal text-ink-faint"> {unit}</span> : null}
                    </strong>
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    className={`size-4 text-ink-faint transition ${expanded === s.service_id ? "rotate-90" : ""}`}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>

                {expanded === s.service_id ? (
                <div className="border-t border-line-soft bg-ground-2/60 px-4 py-5 sm:px-6">
                {editing === s.service_id ? (
                  editorCard
                ) : (
                <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Package overview</p>
                    <p className="serif mt-0.5 text-lg text-ink">What&apos;s included</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="inline-flex h-9 items-center rounded-[9px] border border-line bg-card px-3 text-sm font-semibold text-ink"
                  >
                    Edit package
                  </button>
                </div>
                <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  {s.inclusions?.length ? (
                    <ul className="grid content-start gap-2 sm:grid-cols-2">
                      {s.inclusions.map((inc) => (
                        <li key={inc} className="flex items-start gap-2 text-sm text-ink-soft">
                          <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-green/15 text-[0.6rem] text-green">✓</span>
                          {inc}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-faint">
                      Nothing listed yet — add what&apos;s included so clients can compare.
                    </p>
                  )}
                  <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-card-edge bg-card text-sm">
                    {[
                      ["Coverage", coverage(s)],
                      ["Event type", bestFor(s, categories)],
                      ["Starting price", `${money(s.price)} ${unit}`.trim()],
                      ["Open to offers", s.negotiable ? "Yes" : "No"],
                      ["Add-ons", s.add_ons?.length ? s.add_ons.map((a) => a.name).join(", ") : "None"],
                      ["Listing", s.status === "hidden" ? "Private" : "Public"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 border-b border-r border-line-soft px-3 py-2.5 [&:nth-child(2n)]:border-r-0">
                        <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
                        <dd className="mt-0.5 truncate text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-1">
                  {/* Order: the list clients see follows this. */}
                  <button
                    type="button"
                    aria-label={`Move ${s.name} up`}
                    disabled={busy || index === 0}
                    onClick={() => move(s, -1)}
                    className="px-2 py-1 text-ink-faint hover:text-ink disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${s.name} down`}
                    disabled={busy || index === ordered.length - 1}
                    onClick={() => move(s, 1)}
                    className="px-2 py-1 text-ink-faint hover:text-ink disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <Button variant="quiet" size="md" onClick={() => duplicate(s)}>
                    Duplicate
                  </Button>
                  <Button
                    variant="quiet"
                    size="md"
                    disabled={busy}
                    onClick={() => setStatus(s, s.status === "hidden" ? "active" : "hidden")}
                  >
                    {s.status === "hidden" ? "List publicly" : "Make private"}
                  </Button>
                  {/* The public page a client lands on — a private package's
                      still opens there by id, which is how the vendor can
                      check it. */}
                  <a
                    href={`/app/service/?id=${s.service_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 text-sm font-semibold text-ink-soft hover:text-ink"
                  >
                    Preview
                  </a>
                  <Button variant="quiet" size="md" className="ml-auto" onClick={() => setConfirmDelete(s.service_id)}>
                    Delete
                  </Button>
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
                  {(pendingPhotosFor[s.service_id] ?? []).map((item, i) => (
                    <div key={`pending-photo-${i}`} className="relative opacity-60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" className="size-16 rounded-lg object-cover" />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 grid place-items-center"
                      >
                        <span className="size-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                      </span>
                    </div>
                  ))}
                  {(pendingVideosFor[s.service_id] ?? []).map((item, i) => (
                    <div key={`pending-video-${i}`} className="relative opacity-60">
                      <video
                        src={item.url}
                        muted
                        playsInline
                        className="size-16 rounded-lg object-cover"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 grid place-items-center"
                      >
                        <span className="size-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
                      </span>
                    </div>
                  ))}
                  <label
                    {...dropZoneProps(`photos-${s.service_id}`, (files) =>
                      void addPhotos(s.service_id, files),
                    )}
                    className={`flex size-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-1.5 text-center text-[11px] leading-tight text-ink-soft ${dropZoneClass(`photos-${s.service_id}`)}`}
                  >
                    <span aria-hidden="true" className="text-lg leading-none text-ink-faint">
                      +
                    </span>
                    <span>{uploadingFor === s.service_id ? "Uploading…" : "Add or drop photos"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => addPhotos(s.service_id, e.currentTarget)}
                    />
                  </label>
                  <label
                    {...dropZoneProps(`video-${s.service_id}`, (files) =>
                      void addVideos(s.service_id, files),
                    )}
                    className={`flex size-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed px-1.5 text-center text-[11px] leading-tight text-ink-soft ${dropZoneClass(`video-${s.service_id}`)}`}
                  >
                    <span aria-hidden="true" className="text-lg leading-none text-ink-faint">
                      +
                    </span>
                    <span>{uploadingVideoFor === s.service_id ? "Uploading…" : "Add or drop video"}</span>
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
                      Delete {s.name}? Clients won&apos;t be able to book it. If it&apos;s
                      already been booked, it&apos;s archived instead so those bookings keep it.
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
                </>
                )}
                </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {/* Retired packages: off every list and out of new contracts, kept
          because a booking still points at them. Restoring makes one private
          first, so bringing it back never lists it publicly by surprise. */}
      {archived.length ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-ink-soft">
            Archived ({archived.length})
          </summary>
          <div className="mt-3 grid gap-2">
            {archived.map((s) => (
              <Card key={s.service_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{s.name}</p>
                  <p className="text-xs text-ink-faint">
                    {money(s.price)} {priceUnitLabel(s.price_unit)} · kept for existing bookings
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="md"
                  disabled={busy}
                  onClick={() => setStatus(s, "hidden")}
                >
                  Restore as private
                </Button>
              </Card>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
