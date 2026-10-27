"use client";

// The addendum / cancellation agreement editor (plan step 7b; backend
// DECISIONS #21): a short, text-only document attached to a booking that's
// already agreed, which the couple signs on its own link. It never changes
// the booking's price, date, payments or hold — any of that still goes
// through the booking itself — and the document says so, so nobody signs one
// expecting otherwise.
//
// ?kind=addendum|cancellation, ?booking=<id> (from a contract or a booking;
// without it the page asks which), ?id=<document_id> to reopen one that isn't
// signed yet, ?template=<id> to start from a saved one.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  createDocument,
  getMyVendor,
  listDocuments,
  listVendorBookings,
  sendDocument,
  updateDocument,
} from "@/lib/jorna";
import { KIND_LABEL, starterSections, type SectionDraft } from "@/lib/attachedDocuments";
import { describeWhen, newKey } from "@jorna/shared/lib/contractDraft";
import {
  loadTemplates,
  saveDocumentTemplate,
  templatesOfKind,
  type DocumentTemplateBody,
} from "@/lib/contractTemplates";
import { guestDocumentLink } from "@/lib/contractLink";
import { canAttachDocument } from "@/lib/vendorPlan";
import type {
  AttachedDocument,
  AttachedDocumentKind,
  SavedContractTemplate,
  VendorBooking,
  VendorDetail,
} from "@/lib/types";
import { Button, LinkButton } from "@jorna/shared/components/ui";
import { PageHeader } from "@/components/vendor/ui";

const inputClass =
  "w-full rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";

const clientOf = (b: VendorBooking) => b.guest_name || b.client_name || "Client";
const agreementOf = (b: VendorBooking) => b.document_title || b.event_name || `${b.service_name || "Services"} agreement`;
const backTo = (b: VendorBooking) =>
  b.contract_token ? `/contracts/view?id=${b.booking_id}` : `/my-bookings?id=${b.booking_id}`;

function prettyDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function DocumentEditorInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const kindParam = params.get("kind");
  const bookingId = params.get("booking");
  const documentId = params.get("id");
  const templateId = params.get("template");

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [bookings, setBookings] = useState<VendorBooking[] | null>(null);
  const [templates, setTemplates] = useState<SavedContractTemplate[]>([]);
  const [existing, setExisting] = useState<AttachedDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<AttachedDocumentKind>(kindParam === "cancellation" ? "cancellation" : "addendum");
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>([]);
  // An addendum's priced items (decision B, backend DECISIONS #38): once both
  // sign, the booking's total and remaining payments follow.
  const [added, setAdded] = useState<{ key: string; name: string; price: string; quantity: string }[]>([]);
  const [emailClient, setEmailClient] = useState(true);
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [busy, setBusy] = useState<"send" | "copy" | "draft" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ doc: AttachedDocument; copied: boolean } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/contracts&role=vendor");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyVendor()
      .then(async (mine) => {
        if (cancelled) return;
        if (!mine) {
          router.replace("/vendor-onboarding");
          return;
        }
        const [res, tpl, docs] = await Promise.all([
          listVendorBookings(mine.vendor_id, { limit: 100 }),
          loadTemplates().catch(() => [] as SavedContractTemplate[]),
          documentId && bookingId ? listDocuments(bookingId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setVendor(mine);
        setBookings(res.items.filter(canAttachDocument));
        setTemplates(tpl);
        const found = docs?.items.find((d) => d.document_id === documentId) ?? null;
        if (documentId && !found) {
          setLoadError("That document isn't here any more.");
          return;
        }
        if (found) {
          setExisting(found);
          setKind(found.kind);
          setTitle(found.title);
          setSections(found.sections.map((s) => ({ ...s })));
          setAdded((found.line_items ?? []).map((l) => ({ key: newKey(), name: l.name, price: String(l.unit_price_cents / 100), quantity: String(l.quantity) })));
        }
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : "Couldn't load your bookings."));
    return () => {
      cancelled = true;
    };
  }, [user, router, bookingId, documentId]);

  const booking = useMemo(() => bookings?.find((b) => b.booking_id === bookingId) ?? null, [bookings, bookingId]);
  const ofKind = useMemo(() => templatesOfKind(templates, kind), [templates, kind]);

  // A fresh document starts from the picked template, or from wording for
  // its kind — once a booking is chosen, so the date can be in it.
  const [startedFor, setStartedFor] = useState<string | null>(null);
  const startKey = `${booking?.booking_id ?? ""}:${kind}`;
  if (booking && !existing && !documentId && startedFor !== startKey) {
    setStartedFor(startKey);
    const picked = templateId ? ofKind.find((t) => t.template_id === templateId) : undefined;
    const body = picked?.body as unknown as DocumentTemplateBody | undefined;
    if (body?.sections?.length) {
      setTitle(body.title ?? "");
      setSections(body.sections.map((s) => ({ ...s, key: newKey() })));
      setNotice(`Loaded “${picked!.name}”.`);
    } else {
      setTitle("");
      setSections(starterSections(kind, prettyDate(booking.date_iso)).map((s) => ({ ...s, key: newKey() })));
    }
  }

  // Same rule as a contract's sections, and the backend's on send.
  const blank = sections.find((x) => `${x.title} ${x.body}`.includes("___"));
  const problems = [
    ...(blank ? [`Fill in the blank (___) in “${blank.title || "a section"}”.`] : []),
    !sections.length ? "Add at least one section." : null,
    sections.some((s) => !s.title.trim() || !s.body.trim()) ? "Every section needs a title and some text." : null,
    added.some((l) => !l.name.trim() || !(Number(l.price) >= 0) || l.price === "" || !(Number(l.quantity) > 0))
      ? "Every added item needs a name, a price and a quantity."
      : null,
  ].filter((p): p is string => Boolean(p));
  const addedCents = added.reduce((sum, l) => sum + Math.round(Number(l.price || 0) * 100) * (Number(l.quantity) || 0), 0);

  function update(key: string, patch: Partial<SectionDraft>) {
    setSections((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function move(key: string, delta: -1 | 1) {
    setSections((all) => {
      const from = all.findIndex((s) => s.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= all.length) return all;
      const next = [...all];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function pickTemplate(id: string) {
    const t = ofKind.find((x) => x.template_id === id);
    const body = t?.body as unknown as DocumentTemplateBody | undefined;
    if (!t || !body?.sections?.length) return;
    setTitle(body.title ?? "");
    setSections(body.sections.map((s) => ({ ...s, key: newKey() })));
    setNotice(`Loaded “${t.name}”.`);
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return;
    try {
      const t = await saveDocumentTemplate(templateName.trim(), kind, {
        version: 1,
        title: title.trim(),
        sections: sections.map(({ title: t, body }) => ({ title: t, body })),
      });
      setTemplates((prev) => [...prev, t]);
      setTemplateName("");
      setNotice(`Saved “${t.name}” to your templates.`);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't save the template.");
    }
  }

  async function copy(token: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(guestDocumentLink(token));
      return true;
    } catch {
      return false;
    }
  }

  async function submit(mode: "send" | "copy" | "draft" | "save") {
    if (!booking) return;
    if (mode !== "draft" && problems.length) {
      setError(problems[0]);
      return;
    }
    setBusy(mode);
    setError(null);
    const payload = {
      title: title.trim() || null,
      sections: sections.map((s) => ({ key: s.key, title: s.title.trim(), body: s.body.trim() })),
      ...(kind === "addendum"
        ? {
            line_items: added.map((l) => ({
              name: l.name.trim(),
              unit_price_cents: Math.round(Number(l.price) * 100),
              quantity: Number(l.quantity),
            })),
          }
        : {}),
    };
    const email = mode === "send" && emailClient;
    try {
      let doc: AttachedDocument;
      if (existing) {
        doc = await updateDocument(existing.document_id, payload);
        // Saving an already-sent one keeps its link; sending a draft opens it.
        if (mode === "send" || mode === "copy") doc = await sendDocument(doc.document_id, email);
      } else {
        doc = await createDocument(booking.booking_id, {
          kind,
          ...payload,
          send: mode !== "draft",
          email_client: email,
        });
      }
      if (mode === "save") {
        router.push(backTo(booking));
        return;
      }
      setDone({ doc, copied: mode === "copy" && doc.token ? await copy(doc.token) : false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the document.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || !user || (!bookings && !loadError)) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }
  if (loadError || !vendor || !bookings) {
    return <p role="alert" className="py-20 text-center text-ink-soft">{loadError ?? "Couldn't load your bookings."}</p>;
  }

  const vendorName = [vendor.f_name, vendor.l_name].filter(Boolean).join(" ") || "Your business";

  // ── Which booking ──
  if (!booking) {
    const pick = (id: string) => router.replace(`/contracts/document?kind=${kind}&booking=${id}${templateId ? `&template=${templateId}` : ""}`);
    return (
      <div>
        <PageHeader
          eyebrow="Contracts"
          title={`New ${KIND_LABEL[kind].toLowerCase()}`}
          subtitle="It attaches to a booking that's already agreed. Which one is it for?"
        />
        <div className="mb-4 flex gap-2" role="group" aria-label="Kind of document">
          {(["addendum", "cancellation"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                kind === k ? "border-gold bg-gold/15 text-ink" : "border-card-edge text-ink-soft hover:text-ink"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {bookingId ? (
          <p role="alert" className="mb-4 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
            That booking isn&apos;t signed yet, so there&apos;s nothing to attach this to. Edit the contract itself instead.
          </p>
        ) : null}
        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-card-edge bg-card p-8 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-ink-faint">
              No signed bookings yet. Once a client signs a contract, you can add an addendum or a cancellation
              agreement to it.
            </p>
            <Link href="/contracts" className="mt-3 inline-block text-sm font-semibold text-gold">
              Back to Contracts
            </Link>
          </div>
        ) : (
          <ul aria-label="Signed bookings" className="grid gap-2">
            {bookings.map((b) => (
              <li key={b.booking_id}>
                <button
                  type="button"
                  onClick={() => pick(b.booking_id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-card-edge bg-card px-4 py-3 text-left shadow-[var(--shadow-card)] transition hover:border-gold"
                >
                  <span className="grid min-w-0">
                    <strong className="truncate text-sm text-ink">{clientOf(b)}</strong>
                    <small className="truncate text-xs text-ink-faint">
                      {agreementOf(b)} · {describeWhen(b.date_iso, b.date_end, b.time_start, b.time_end)}
                    </small>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-gold">Choose</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── Sent / saved ──
  if (done) {
    const { doc, copied } = done;
    const isDraft = doc.status === "draft";
    return (
      <div className="mx-auto w-[min(640px,100%-2rem)] text-center">
        <p className="eyebrow">{KIND_LABEL[doc.kind]}</p>
        <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">
          {isDraft ? "Saved as a draft" : copied ? "Link copied" : "Sent"}
        </h1>
        <p className="mt-3 text-ink-soft">
          {isDraft
            ? "Nothing has gone to your client. Send it from the contract when it's ready."
            : `${clientOf(booking)} reads it and signs on its own link.${
                kind === "addendum" && added.length
                  ? " Once you both sign, the total and the payments still to come change as it says."
                  : " It doesn't change the booking's price, date or payments."
              }`}
        </p>
        {!isDraft && doc.token ? (
          <div className="mt-8 rounded-2xl border border-card-edge bg-card p-5 text-left shadow-[var(--shadow-card)]">
            <p className="break-all rounded-lg bg-ground-2 px-3 py-2.5 font-mono text-sm text-ink">{guestDocumentLink(doc.token)}</p>
            <Button
              className="mt-3 w-full"
              onClick={async () => setDone({ doc, copied: await copy(doc.token!) })}
            >
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <LinkButton href={backTo(booking)} variant="ghost">
            Back to the booking
          </LinkButton>
          <LinkButton href="/contracts" variant="ghost">
            All contracts
          </LinkButton>
        </div>
      </div>
    );
  }

  const locked = existing && ["signed", "declined", "voided"].includes(existing.status);
  if (locked) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">This document can&apos;t be edited</h1>
        <p className="mt-3 text-ink-soft">It was {existing!.status}.</p>
        <LinkButton href={backTo(booking)} className="mt-6">
          Back to the booking
        </LinkButton>
      </div>
    );
  }

  const canEmail = Boolean(booking.guest_email || booking.user_id);
  const unsent = !existing || existing.status === "draft";

  return (
    <div>
      <header className="mb-6">
        <Link href={backTo(booking)} className="eyebrow hover:text-gold">
          ← Back to the booking
        </Link>
        <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">
          {existing ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : `New ${KIND_LABEL[kind].toLowerCase()}`}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          For {clientOf(booking)}&apos;s booking on {prettyDate(booking.date_iso) ?? "their date"}. {kind === "addendum"
            ? "Its priced items, if you add any, change the total once you both sign; its text changes nothing else."
            : "Text only — it doesn't change the price, date or payments."}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <article
          aria-label="Document"
          className="min-w-0 rounded-2xl border border-card-edge bg-card px-5 py-6 shadow-[var(--shadow-card)] sm:px-10 sm:py-10"
        >
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold">{vendorName}</p>
          <input
            aria-label="Document title"
            value={title}
            maxLength={200}
            placeholder={KIND_LABEL[kind]}
            onChange={(e) => setTitle(e.target.value)}
            className="serif mt-2 w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-2xl sm:text-3xl text-ink outline-none placeholder:text-ink focus:border-gold"
          />
          <p className="mt-2 text-sm text-ink-faint">
            Attached to “{agreementOf(booking)}” between {vendorName} and {clientOf(booking)},{" "}
            {describeWhen(booking.date_iso, booking.date_end, booking.time_start, booking.time_end)}.
          </p>

          <div className="mt-6">
            {sections.map((s, idx) => (
              <section key={s.key} aria-label="Section" className="group border-t border-line-soft py-5 first:border-t-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Section {idx + 1}</p>
                  <span className="flex gap-1 sm:opacity-40 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <button type="button" aria-label="Move section up" disabled={idx === 0} onClick={() => move(s.key, -1)} className="px-1.5 text-xs text-ink-faint hover:text-ink disabled:opacity-30">
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move section down"
                      disabled={idx === sections.length - 1}
                      onClick={() => move(s.key, 1)}
                      className="px-1.5 text-xs text-ink-faint hover:text-ink disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setSections((all) => all.filter((x) => x.key !== s.key))}
                      className="px-1.5 text-xs text-ink-faint hover:text-maroon"
                    >
                      Remove
                    </button>
                  </span>
                </div>
                <input
                  aria-label="Title"
                  value={s.title}
                  placeholder="Section title"
                  onChange={(e) => update(s.key, { title: e.target.value })}
                  className="serif w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-lg text-ink outline-none placeholder:text-ink-faint focus:border-gold"
                />
                <textarea
                  aria-label="Section text"
                  rows={Math.min(12, Math.max(3, Math.ceil(s.body.length / 80) + s.body.split("\n").length))}
                  value={s.body}
                  onChange={(e) => update(s.key, { body: e.target.value })}
                  className="mt-1 w-full resize-y rounded-lg border border-transparent bg-transparent px-0 py-1 text-[0.95rem] leading-relaxed text-ink-soft outline-none transition hover:border-line-soft focus:border-gold focus:bg-ground-2 focus:px-3"
                />
              </section>
            ))}
            <button
              type="button"
              onClick={() => setSections((all) => [...all, { key: newKey(), title: "", body: "" }])}
              className="mt-2 rounded-full border border-dashed border-card-edge px-3 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
            >
              + Add a section
            </button>
          </div>

          {kind === "addendum" ? (
            <section aria-label="Priced changes" className="mt-6 border-t border-line-soft pt-5">
              <p className="text-sm font-semibold text-ink">Add to what&apos;s sold (optional)</p>
              <p className="mt-1 text-xs text-ink-faint">
                Once you both sign, the total goes up by these and the difference goes on the payments still to come.
              </p>
              <div className="mt-3 grid gap-2">
                {added.map((l) => (
                  <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_5rem_7rem_auto] items-center gap-2">
                    <input aria-label="Added item" placeholder="e.g. Two more uplights" value={l.name}
                      onChange={(e) => setAdded((all) => all.map((x) => (x.key === l.key ? { ...x, name: e.target.value } : x)))}
                      className="rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold" />
                    <input aria-label="Added item quantity" type="number" min={1} value={l.quantity}
                      onChange={(e) => setAdded((all) => all.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                      className="rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold" />
                    <input aria-label="Added item price ($ each)" type="number" min={0} step="0.01" value={l.price}
                      onChange={(e) => setAdded((all) => all.map((x) => (x.key === l.key ? { ...x, price: e.target.value } : x)))}
                      className="rounded-lg border border-card-edge bg-ground-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold" />
                    <button type="button" className="text-xs text-ink-faint hover:text-maroon" onClick={() => setAdded((all) => all.filter((x) => x.key !== l.key))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAdded((all) => [...all, { key: newKey(), name: "", price: "", quantity: "1" }])}
                className="mt-2 rounded-full border border-dashed border-card-edge px-3 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
              >
                + Add a priced item
              </button>
              {added.length && booking.amount_cents != null ? (
                <p className="mt-3 text-sm text-ink">
                  Total goes from ${(booking.amount_cents / 100).toLocaleString()} to $
                  {((booking.amount_cents + addedCents) / 100).toLocaleString()}.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-8 grid gap-6 border-t border-line-soft pt-6 sm:grid-cols-2">
            <div>
              <div className="h-10 border-b border-ink/30" />
              <p className="mt-1 text-sm text-ink">{clientOf(booking)}</p>
              <p className="text-xs text-ink-faint">Types their name on the link to sign</p>
            </div>
            <div>
              <div className="serif flex h-10 items-end border-b border-ink/30 text-lg italic text-ink-soft">{vendorName}</div>
              <p className="mt-1 text-sm text-ink">{vendorName}</p>
            </div>
          </div>
        </article>

        <aside aria-label="Send" className="grid gap-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{KIND_LABEL[kind]}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {existing ? (existing.status === "draft" ? "Draft — not sent" : "Sent — awaiting signature") : "Not saved yet"}
            </p>
            {problems.length ? (
              <ul className="mt-3 grid gap-1 rounded-lg bg-panel p-3 text-xs text-ink-soft">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {error ? (
              <p role="alert" className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                {error}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              {unsent ? (
                <>
                  {canEmail ? (
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      <input type="checkbox" checked={emailClient} onChange={(e) => setEmailClient(e.target.checked)} />
                      Email it to {clientOf(booking)}
                    </label>
                  ) : null}
                  <Button disabled={busy !== null || problems.length > 0} onClick={() => submit("send")}>
                    {busy === "send" ? "Sending…" : "Send"}
                  </Button>
                  <Button variant="ghost" disabled={busy !== null || problems.length > 0} onClick={() => submit("copy")}>
                    {busy === "copy" ? "Creating link…" : "Copy link"}
                  </Button>
                  <Button variant="quiet" disabled={busy !== null} onClick={() => submit("draft")}>
                    {busy === "draft" ? "Saving…" : "Save as draft"}
                  </Button>
                </>
              ) : (
                <Button disabled={busy !== null || problems.length > 0} onClick={() => submit("save")}>
                  {busy === "save" ? "Saving…" : "Save changes"}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Templates</p>
            {ofKind.length ? (
              <label className="grid gap-1 text-sm text-ink-soft">
                <span>Start from a template</span>
                <select defaultValue="" onChange={(e) => pickTemplate(e.target.value)} className={inputClass}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {ofKind.map((t) => (
                    <option key={t.template_id} value={t.template_id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex gap-2">
              <input
                aria-label="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Date change"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <Button variant="ghost" size="md" onClick={saveAsTemplate} disabled={!templateName.trim() || problems.length > 0}>
                Save template
              </Button>
            </div>
            {notice ? <p className="text-xs text-ink-soft">{notice}</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function DocumentEditorPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <DocumentEditorInner />
    </Suspense>
  );
}
