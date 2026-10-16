"use client";

// The contract editor: the agreement as the couple will read it — a title,
// the parties, the event, what's included, how it's paid, the vendor's own
// terms sections and the signatures — edited in place, in an order the
// vendor chooses (plan step 7b; backend 0067 stores the order). The right
// rail keeps the total and the ways out: send it, copy its link, or keep it
// as a draft. The client gets a link with no account behind it
// (/booking-link; backend DECISIONS.md #13), reads it and signs.
//
// The arithmetic lives in lib/contractDraft, where it's unit-tested. Each
// block of the document is its own component in components/contract-editor;
// this page holds the draft, loads and sends it, and lays the blocks out.
//
// ?lead=<id> starts from a lead and converts it on send (or copy — either
// moves it to Negotiation). ?edit=<booking_id> reopens an unsigned contract;
// saving bumps its revision, so a client who had the old one open has to
// review the new one before signing. ?request=<booking_id> accepts a
// signed-in client's marketplace request with this proposal (backend
// DECISIONS #17): when and where are the client's, so those blocks only
// show them. ?template=<id> starts from a saved template.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@jorna/shared/lib/api";
import {
  convertLead,
  createContract,
  getContract,
  getContractProposals,
  getMyVendor,
  listLeads,
  listMyServices,
  listVendorBookings,
  proposeFromRequest,
  updateContract,
} from "@/lib/jorna";
import {
  applyTemplate,
  BLANK,
  cancellationClause,
  CANCELLATION_KEY,
  defaultClauses,
  describeWhen,
  emptyDraft,
  fromContract,
  fromRequest,
  insertClause,
  keepRequestedLine,
  layoutOf,
  money,
  moveBlock,
  newKey,
  presetSchedule,
  problemsByStep,
  scheduledCents,
  toDocument,
  toTemplate,
  totalCents,
  warningsByStep,
  withCancellationSection,
  type ClauseDraft,
  type Draft,
  type InstallmentDraft,
  type SchedulePreset,
  type Step,
} from "@jorna/shared/lib/contractDraft";
import { loadTemplates, saveTemplate, templatesOfKind } from "@/lib/contractTemplates";
import { allChoices, packageChoiceId, templateChoices, type TemplateChoice } from "@/lib/templateChoices";
import { guestBookingLink } from "@/lib/contractLink";
import { clashWith } from "@/lib/dateClash";
import {
  categoryLabel,
  type BlockType,
  type ChangeProposal,
  type Contract,
  type LayoutBlock,
  type SavedContractTemplate,
  type ServiceItem,
  type VendorBooking,
  type VendorDetail,
} from "@/lib/types";
import { Button, Field, LinkButton } from "@jorna/shared/components/ui";
import { CancellationBlock } from "@/components/contract-editor/CancellationBlock";
import { ContractPreview } from "@/components/contract-editor/ContractPreview";
import { DocBlock } from "@/components/contract-editor/DocBlock";
import { EditorMenu } from "@/components/contract-editor/EditorMenu";
import { EventBlock } from "@/components/contract-editor/EventBlock";
import { ItemsBlock } from "@/components/contract-editor/ItemsBlock";
import { PartiesBlock } from "@/components/contract-editor/PartiesBlock";
import { PoliciesBlock } from "@/components/contract-editor/PoliciesBlock";
import { ScheduleBlock } from "@/components/contract-editor/ScheduleBlock";
import { SignatureBlock } from "@/components/contract-editor/SignatureBlock";
import { TermsBlock } from "@/components/contract-editor/TermsBlock";
import { TemplatePicker, type Pick } from "@/components/contract-editor/TemplatePicker";
import { smallButton, todayIso } from "@/components/contract-editor/shared";

// Where each problem is fixed — the issue list scrolls there.
const STEP_BLOCK: Record<Step, BlockType> = {
  client: "parties",
  event: "event",
  items: "items",
  payments: "schedule",
  terms: "terms",
  review: "signature",
};

// Suggested sections a vendor can drop in with one tap. Only a start — the
// text is theirs to edit, and the backend stores whatever they send. A number
// we don't know is left as a blank to fill in (BLANK), never made up: Travel
// used to promise 30 miles and $0.75 a mile whatever the vendor's profile said.
// Cancellation isn't here: it carries the window (addCancellation).
function clauseIdeas(vendor: VendorDetail | null): Omit<ClauseDraft, "key">[] {
  const miles = vendor?.travel_radius_miles ?? BLANK;
  return [
    { title: "Equipment & power", body: "We bring all our own equipment. The venue provides standard power within 50 feet." },
    { title: "Travel", body: `Travel within ${miles} miles is included. Beyond that, travel is billed at $${BLANK} per mile.` },
    { title: "Meals", body: "A hot meal and a place to eat for each member of our team on site for more than five hours." },
    { title: "Changes", body: "Date or scope changes are subject to availability and may change the price." },
  ];
}

/**
 * The payment plan the vendor hasn't touched yet: their usual deposit (the
 * first package's own, else their default, else half) and the balance, on
 * the current total. It follows the total until they edit the plan — the old
 * step builder got the same effect by drafting it on arrival at Payments.
 */
function usualSchedule(draft: Draft, services: ServiceItem[], vendor: VendorDetail | null): InstallmentDraft[] {
  const total = totalCents(draft);
  if (total <= 0) return [];
  const first = services.find((s) => s.service_id === draft.lines.find((l) => l.kind === "package")?.serviceId);
  const pct = first?.deposit_percent ?? vendor?.default_deposit_percent ?? 50;
  // The schedule they set as usual on Contracts → Defaults, if they have;
  // otherwise deposit + balance when they take a deposit.
  const plan = vendor?.default_payment_plan;
  const preset = plan?.preset ?? (pct > 0 && pct < 100 ? "deposit_balance" : "full");
  return presetSchedule(preset, total, pct > 0 && pct < 100 ? pct : 50, plan?.balance_days_before);
}

function scrollToBlock(id: string) {
  document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function NewContractInner() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const leadId = params.get("lead");
  const editId = params.get("edit");
  // Revise (backend DECISIONS #23): the client's proposed changes, already
  // in, as the start of the vendor's next version.
  const proposalId = params.get("proposal");
  const requestId = params.get("request");
  // What a new contract starts from (backend DECISIONS #31): a saved
  // template, a package's (built from it, or the vendor's edit of it), or
  // scratch on their usual terms. With none of the three, the first screen
  // asks — whichever way the vendor came in.
  const templateId = params.get("template");
  const packageId = params.get("package");
  const scratch = params.get("scratch") === "1";
  const choosing = !editId && !templateId && !packageId && !scratch;

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [templates, setTemplates] = useState<SavedContractTemplate[]>([]);
  const choices = useMemo(() => templateChoices(services, templates), [services, templates]);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [revising, setRevising] = useState<ChangeProposal | null>(null);
  /** ?proposal= named one that's no longer open. */
  const [staleProposal, setStaleProposal] = useState(false);
  const [request, setRequest] = useState<VendorBooking | null>(null);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [emailClient, setEmailClient] = useState(true);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const [busy, setBusy] = useState<"send" | "copy" | "draft" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Contract | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Whether the payment plan is still the one drafted for the vendor — see
  // usualSchedule. Any edit to the plan itself makes it theirs.
  const [autoPlan, setAutoPlan] = useState(true);

  // Problems show under the block that has them once the vendor has left it
  // (touched) or pressed Send (showAll) — not while a block is being filled.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const set = (patch: Partial<Draft>) =>
    setDraft((d) => {
      let next = { ...d, ...patch };
      if (!("schedule" in patch) && autoPlan && ("lines" in patch || "discount" in patch)) {
        next.schedule = usualSchedule(next, services, vendor);
      }
      // A window (typed, or a package's own) needs its section to show in.
      if ("cancellationDays" in patch) next = withCancellationSection(next);
      return next;
    });

  /** An edit to the plan itself. */
  const setPlan = (schedule: InstallmentDraft[]) => {
    setAutoPlan(false);
    set({ schedule });
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?next=/contracts/new&role=vendor");
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
        setVendor(mine);
        const [svc, leads, tpl, existing, requests, proposals] = await Promise.all([
          listMyServices(mine.vendor_id).catch(() => null),
          leadId ? listLeads().catch(() => null) : Promise.resolve(null),
          loadTemplates().catch(() => [] as SavedContractTemplate[]),
          editId ? getContract(editId) : Promise.resolve(null),
          // The vendor's own bookings: the request being accepted, and what
          // a picked date would clash with.
          listVendorBookings(mine.vendor_id, { limit: 100 }).catch(() => null),
          editId && proposalId ? getContractProposals(editId).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        // Private (hidden) packages are exactly what contracts are for;
        // archived ones are retired and the backend refuses them.
        const usable = (svc?.items ?? []).filter((x) => x.status !== "archived");
        setServices(usable);
        setBookings(requests?.items ?? []);
        const agreements = templatesOfKind(tpl, "agreement");
        setTemplates(agreements);
        const offered = allChoices(templateChoices(usable, agreements));

        if (existing) {
          setEditing(existing);
          const open = proposals?.open_proposal?.proposal_id === proposalId ? proposals?.open_proposal : null;
          if (open) {
            setRevising(open);
            setDraft(withCancellationSection(fromContract({ ...existing, ...open.proposed })));
          } else {
            setDraft(withCancellationSection(fromContract(existing)));
            if (proposalId) setStaleProposal(true);
          }
          setAutoPlan(false);
          return;
        }
        const asked = requests?.items.find((b) => b.booking_id === requestId) ?? null;
        if (requestId) {
          if (!asked || !["pending", "negotiation_ongoing"].includes(asked.status) || asked.contract_token) {
            setLoadError("This request can't be accepted from here any more — it may already be answered.");
            return;
          }
          setRequest(asked);
        }
        if (choosing) return;
        const start = asked ? fromRequest(asked) : emptyDraft();
        start.clauses = defaultClauses(mine).map((c) => ({ ...c, key: newKey() }));
        if (mine.default_cancellation_window_hours != null) {
          start.cancellationDays = String(Math.round(mine.default_cancellation_window_hours / 24));
        }
        if (mine.default_overtime_rate_cents != null) {
          start.overtimeRate = String(mine.default_overtime_rate_cents / 100);
        }
        const lead = leads?.items.find((l) => l.lead_id === leadId);
        if (lead) {
          start.clientName = lead.name;
          start.clientEmail = lead.email ?? "";
          start.clientPhone = lead.phone ?? "";
          if (lead.event_date_iso && lead.event_date_iso >= todayIso()) start.dateIso = lead.event_date_iso;
        }
        const picked = packageId
          ? offered.find((c) => c.id === packageChoiceId(packageId))
          : templateId
            ? offered.find((c) => c.templateId === templateId)
            : undefined;
        if (picked) {
          let applied = withCancellationSection(applyTemplate(start, picked.body, usable));
          // The client's own line for the package they asked for, at the
          // quantity they asked.
          if (asked) applied = keepRequestedLine(applied, start, asked.service_id);
          if (applied.schedule.length) setAutoPlan(false);
          else applied.schedule = usualSchedule(applied, usable, mine);
          setDraft(applied);
          setTemplateNotice(`Started from “${picked.name}”. Check the items and payments before sending.`);
        } else {
          // A request arrives with its package already in.
          start.schedule = usualSchedule(start, usable, mine);
          setDraft(withCancellationSection(start));
        }
      })
      .catch((err) =>
        !cancelled &&
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load your listing."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, router, leadId, editId, proposalId, requestId, templateId, packageId, choosing]);

  const issues = useMemo(() => problemsByStep(draft, todayIso()), [draft]);
  const notes = useMemo(() => warningsByStep(draft), [draft]);
  const cancellation = cancellationClause(draft);
  // The hold's own problem shows under its field in the rail.
  const holdIssue = issues.find((i) => i.step === "review")?.message ?? null;
  const clashing = useMemo(
    () =>
      clashWith(
        bookings,
        {
          dateIso: request?.date_iso ?? draft.dateIso,
          dateEnd: request ? request.date_end : draft.multiDay ? draft.dateEnd : null,
          timeStart: request?.time_start ?? draft.timeStart,
          timeEnd: request?.time_end ?? draft.timeEnd,
        },
        { exclude: editing?.booking_id ?? request?.booking_id },
      ),
    [bookings, request, editing, draft.dateIso, draft.dateEnd, draft.multiDay, draft.timeStart, draft.timeEnd],
  );
  const clash = clashing
    ? `You're already booked then: ${clashing.client_name || clashing.guest_name || "another client"}, ${describeWhen(clashing.date_iso, clashing.date_end, clashing.time_start, clashing.time_end)}. Pick another date or time — this one can't be sent.`
    : null;
  const total = totalCents(draft);
  const layout = layoutOf(draft);
  const locked = Boolean(editing && (editing.signed_at || editing.status === "rejected"));
  const firstPackage = draft.lines.find((l) => l.kind === "package")?.name;
  const defaultTitle = `${firstPackage || (vendor?.category ? categoryLabel(vendor.subcategory || vendor.category) : "Services")} agreement`;
  const vendorName = [vendor?.f_name, vendor?.l_name].filter(Boolean).join(" ") || "Your business";

  /** This block's problems. A terms problem belongs only to the section it's
   *  about: the one missing a title or text, or the one it names. */
  const issuesFor = (b: LayoutBlock): string[] => {
    const clause = b.type === "terms" ? draft.clauses.find((c) => c.key === b.id) : undefined;
    return issues
      .filter((i) => {
        if (i.step === "review" || STEP_BLOCK[i.step] !== b.type) return false;
        if (!clause) return true;
        if (i.message.startsWith("Every clause")) {
          const bodyOptional = clause === cancellation && Boolean(draft.cancellationDays.trim());
          return !clause.title.trim() || (!clause.body.trim() && !bodyOptional);
        }
        return i.message.includes(`“${clause.title.trim() || "a section"}”`);
      })
      .map((i) => i.message);
  };
  const notesFor = (b: LayoutBlock): string[] => notes.filter((n) => STEP_BLOCK[n.step] === b.type).map((n) => n.message);

  /** Show every problem and take the vendor to the first. */
  function showProblems() {
    setShowAll(true);
    const first = layout.find((b) => issuesFor(b).length > 0);
    if (first) scrollToBlock(first.id);
  }

  // ── Payments ──

  /** The deposit a preset starts from: the first package's own, else the
   *  vendor's default, else half. */
  function defaultDepositPercent(): number {
    const first = services.find((s) => s.service_id === draft.lines.find((l) => l.kind === "package")?.serviceId);
    return first?.deposit_percent ?? vendor?.default_deposit_percent ?? 50;
  }

  function applyPreset(preset: SchedulePreset) {
    setPlan(presetSchedule(preset, total, defaultDepositPercent(), vendor?.default_payment_plan?.balance_days_before));
  }

  // ── Terms ──

  function updateClause(key: string, patch: Partial<ClauseDraft>) {
    set({ clauses: draft.clauses.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  }

  function addSection(idea: Omit<ClauseDraft, "key"> = { title: "", body: "" }, at?: number) {
    setDraft((d) => ({ ...d, ...insertClause(d, idea, at) }));
  }

  /** The Cancellation section, with a 30-day window to start from. */
  function addCancellation() {
    setDraft((d) =>
      cancellationClause(d)
        ? d
        : { ...d, cancellationDays: d.cancellationDays || "30", ...insertClause(d, { title: "Cancellation", body: "" }, undefined, CANCELLATION_KEY) },
    );
  }

  function removeSection(key: string) {
    setDraft((d) => {
      const gone = d.clauses.find((x) => x.key === key);
      return {
        ...d,
        clauses: d.clauses.filter((x) => x.key !== key),
        // The window goes with its section.
        ...(gone && gone === cancellationClause(d) ? { cancellationDays: "" } : {}),
      };
    });
  }

  // ── Templates ──

  /** The first screen's choice, into the URL: the load reads it from there,
   *  so a reload or Back keeps it. */
  function choose(pick: Pick) {
    const next = new URLSearchParams(params.toString());
    if ("package" in pick) next.set("package", pick.package);
    else if ("template" in pick) next.set("template", pick.template);
    else next.set("scratch", "1");
    setLoading(true);
    router.replace(`/contracts/new?${next.toString()}`);
  }

  /** The ⋯ menu's "Start from a template", over what's already typed. */
  function pickTemplate(id: string) {
    const t: TemplateChoice | undefined = allChoices(choices).find((c) => c.id === id);
    if (!t) return;
    const body = t.body;
    if (body.schedule?.length) setAutoPlan(false);
    setDraft((d) => {
      const applied = applyTemplate(d, body, services);
      return autoPlan && !body.schedule?.length ? { ...applied, schedule: usualSchedule(applied, services, vendor) } : applied;
    });
    setTemplateNotice(`Loaded “${t.name}”. Check the items and payments before sending.`);
  }

  async function saveAsTemplate(name: string): Promise<boolean> {
    try {
      const t = await saveTemplate(name, toTemplate(draft));
      setTemplates((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
      setTemplateNotice(`Saved “${t.name}” to your templates.`);
      return true;
    } catch (err) {
      setTemplateNotice(err instanceof ApiError ? err.message : "Couldn't save the template.");
      return false;
    }
  }

  // ── Send / copy / save ──

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(guestBookingLink(token));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* clipboard can be denied — the link is shown to select by hand */
    }
  }

  async function submit(mode: "send" | "copy" | "draft" | "save") {
    if (mode !== "draft" && issues.length) {
      showProblems();
      return;
    }
    setBusy(mode);
    setError(null);
    // Copying the link sends it too, just without the email — the hold
    // starts and a lead moves to Negotiation either way (DECISIONS #20).
    const email = mode === "send" && emailClient;
    try {
      const doc = toDocument(draft);
      if (mode === "save" && editing) {
        await updateContract(editing.booking_id, revising ? { ...doc, proposal_id: revising.proposal_id } : doc);
        router.push(`/contracts/view?id=${editing.booking_id}`);
        return;
      }
      let result: Contract;
      if (request) {
        result = await proposeFromRequest(request.booking_id, {
          line_items: doc.line_items,
          discount_cents: doc.discount_cents,
          payment_schedule: doc.payment_schedule,
          terms_clauses: doc.terms_clauses,
          document_title: doc.document_title,
          document_layout: doc.document_layout,
          cancellation_window_hours: doc.cancellation_window_hours,
          overtime_rate_cents: doc.overtime_rate_cents,
          hold_days: Number(draft.holdDays) > 0 ? Number(draft.holdDays) : null,
          email_client: email,
        });
      } else {
        const input = {
          ...doc,
          draft: mode === "draft",
          hold_days: Number(draft.holdDays) > 0 ? Number(draft.holdDays) : null,
          email_client: email && Boolean(doc.guest_email),
        };
        result = leadId ? await convertLead(leadId, input) : await createContract(input);
      }
      setCreated(result);
      if (mode === "copy") await copy(result.contract_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the contract.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || !user || loading) {
    return <p className="py-20 text-center text-ink-soft">Loading…</p>;
  }

  if (loadError || !vendor) {
    return (
      <div className="py-20 text-center">
        <p role="alert" className="text-ink-soft">{loadError ?? "Couldn't load your listing."}</p>
      </div>
    );
  }

  if (choosing) {
    return (
      <TemplatePicker
        packages={choices.packages}
        saved={choices.saved}
        requested={request ? { serviceId: request.service_id ?? null, clientName: request.client_name ?? null } : null}
        heading={request ? `Accept ${request.client_name ? `${request.client_name}'s` : "this"} request` : "Send a contract"}
        backHref={request || leadId ? "/leads" : "/contracts"}
        backLabel={request || leadId ? "Back to Leads" : "All contracts"}
        onPick={choose}
      />
    );
  }

  if (locked && editing) {
    return (
      <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
        <h1 className="serif text-3xl text-maroon dark:text-gold">This contract can&apos;t be edited</h1>
        <p className="mt-3 text-ink-soft">
          {editing.signed_at
            ? "It's signed — a signed agreement doesn't change. Add an addendum to it instead."
            : "It was voided or declined."}
        </p>
        <LinkButton href={`/contracts/view?id=${editing.booking_id}`} className="mt-6">
          Back to the contract
        </LinkButton>
      </div>
    );
  }

  if (created) {
    const link = guestBookingLink(created.contract_token);
    const isDraft = created.contract_status === "draft";
    // Only what the backend says actually happened (email_sent), never what
    // the vendor asked for.
    const emailed = !isDraft && !linkCopied && created.email_sent === true;
    const emailFailed = !isDraft && !linkCopied && created.email_sent === false;
    return (
      <div className="mx-auto w-[min(640px,100%-2rem)]">
        <div className="text-center">
          <p className="eyebrow">{isDraft ? "Draft saved" : "Contract sent"}</p>
          <h1 className="serif mt-3 text-4xl text-maroon dark:text-gold">
            {isDraft ? "Saved as a draft" : linkCopied ? "Link copied" : emailed ? "On its way" : "Send this link"}
          </h1>
          <p className="mt-3 text-ink-soft">
            {isDraft
              ? "It isn't holding your date and the link won't open until you send it from Contracts."
              : linkCopied
                ? "Paste it wherever you talk to your client. They fill in their own details and sign — no account needed."
                : emailed
                  ? `We emailed the link to ${created.guest_email}. You can share it yourself too.`
                  : emailFailed
                    ? `We couldn't email ${created.guest_email ?? "your client"}. Copy the link below and send it yourself — your client fills in their details and signs, no account needed.`
                    : "Your client opens it, fills in their own details, and signs — no account needed on their end."}
          </p>
          {!isDraft && created.hold_expires_at ? (
            <p className="mt-2 text-sm text-ink-faint">
              Your date is held for them until{" "}
              {new Date(created.hold_expires_at).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              . If they haven&apos;t signed by then, it opens up again — you can resend from
              Contracts.
            </p>
          ) : null}
        </div>
        {!isDraft ? (
          <div className="mt-8 rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="break-all rounded-lg bg-ground-2 px-3 py-2.5 font-mono text-sm text-ink">{link}</p>
            <Button className="mt-3 w-full" onClick={() => copy(created.contract_token)}>
              {linkCopied ? "Copied!" : "Copy link"}
            </Button>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <LinkButton href={`/contracts/view?id=${created.booking_id}`} variant="ghost">
            View contract
          </LinkButton>
          <LinkButton href="/contracts" variant="ghost">
            All contracts
          </LinkButton>
        </div>
      </div>
    );
  }

  const scheduled = scheduledCents(draft);
  const vendorCategory = vendor.category ? categoryLabel(vendor.subcategory || vendor.category) : null;

  function renderBlock(b: LayoutBlock) {
    switch (b.type) {
      case "parties":
        return <PartiesBlock vendorName={vendorName} vendorCategory={vendorCategory} draft={draft} set={set} request={request} />;
      case "event":
        return <EventBlock draft={draft} set={set} request={request} clash={clash} />;
      case "items":
        return <ItemsBlock draft={draft} set={set} services={services} total={total} />;
      case "schedule":
        return (
          <>
            <ScheduleBlock draft={draft} total={total} setPlan={setPlan} onPreset={applyPreset} />
            <PoliciesBlock draft={draft} set={set} hasCancellation={Boolean(cancellation)} onAddCancellation={addCancellation} />
          </>
        );
      case "terms": {
        const c = draft.clauses.find((x) => x.key === b.id);
        if (c && c === cancellation) {
          return <CancellationBlock clause={c} draft={draft} set={set} onChange={(patch) => updateClause(c.key, patch)} />;
        }
        return c ? <TermsBlock clause={c} onChange={(patch) => updateClause(c.key, patch)} /> : null;
      }
      case "signature":
        return <SignatureBlock clientName={clientName} vendorName={vendorName} />;
    }
  }

  const sendLabel = request ? "Accept & send contract" : "Send & hold date";
  const holdDays = Number(draft.holdDays) > 0 ? Number(draft.holdDays) : vendor.contract_hold_days ?? 7;
  const holdDaysLabel = `${holdDays} day${holdDays === 1 ? "" : "s"}, or until the event if that's sooner`;
  const clientName = request?.client_name || draft.clientName || "Client";
  const primary = editing
    ? { label: busy === "save" ? "Saving…" : revising ? "Send new version" : "Save changes", run: () => submit("save") }
    : { label: busy === "send" ? "Sending…" : sendLabel, run: () => submit("send") };
  const canEmail = request ? true : Boolean(draft.clientEmail.trim());

  return (
    <div className="pb-24 lg:pb-0">
      <header className="mb-6">
        <Link
          href={editing ? `/contracts/view?id=${editing.booking_id}` : request || leadId ? "/leads" : "/contracts"}
          className="eyebrow hover:text-gold"
        >
          ← {editing ? "Back to the contract" : request || leadId ? "Back to Leads" : "All contracts"}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="serif text-3xl text-maroon dark:text-gold">
            {revising ? "Revise the contract" : editing ? "Edit contract" : request ? `Accept ${request.client_name ? `${request.client_name}'s` : "this"} request` : "New contract"}
          </h1>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setPreviewing(true)}>
              Preview as client
            </Button>
            <EditorMenu
              templates={allChoices(choices).map((c) => ({ id: c.id, name: c.name }))}
              canPick={!editing}
              onPick={pickTemplate}
              onSave={saveAsTemplate}
            />
          </div>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {revising
            ? `${editing?.guest_name || "Your client"}'s proposed changes are already in. Keep what you like, change the rest — saving sends this version to them and restarts your hold.`
            : request
            ? `Set what's included, the payment plan and your terms. They sign on a link we email them. Sending holds the date for ${holdDaysLabel}.`
            : editing
              ? editing.contract_status === "draft"
                ? "It's still a draft — nothing has gone to your client."
                : "Your client will see the new version. If they had it open, they'll need to review it again before signing."
              : "Write it the way your client will read it. Each section's ⋯ moves it or adds one below."}
        </p>
        {templateNotice ? (
          <p role="status" className="mt-3 rounded-lg bg-panel px-3 py-2 text-sm text-ink-soft">
            {templateNotice}
          </p>
        ) : null}
        {staleProposal ? (
          <p role="status" className="mt-3 rounded-lg bg-panel px-3 py-2 text-sm text-ink-soft">
            That proposal has already been answered, so this is the contract as it stands.
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <article
          aria-label="Contract document"
          className="min-w-0 rounded-2xl border border-card-edge bg-card px-5 py-6 shadow-[var(--shadow-card)] sm:px-10 sm:py-10"
        >
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold">{vendorName}</p>
          <input
            aria-label="Agreement title"
            value={draft.title}
            placeholder={defaultTitle}
            onChange={(e) => set({ title: e.target.value })}
            maxLength={200}
            className="serif mt-2 w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-2xl sm:text-3xl text-ink outline-none placeholder:text-ink focus:border-gold"
          />
          <p className="mt-1 text-sm text-ink-faint">
            {describeWhen(draft.dateIso, draft.multiDay ? draft.dateEnd : null, draft.timeStart, draft.timeEnd)}
            {draft.location ? ` · ${draft.location}` : ""}
          </p>

          <div className="mt-6">
            {layout.map((b, idx) => (
              <DocBlock
                key={b.id}
                block={b}
                index={idx}
                count={layout.length}
                issues={issuesFor(b)}
                notes={notesFor(b)}
                showIssues={showAll || touched.has(b.id)}
                onLeave={() => setTouched((t) => (t.has(b.id) ? t : new Set(t).add(b.id)))}
                onMove={(delta) => set({ layout: moveBlock(draft, b.id, delta) })}
                onAddBelow={() => addSection(undefined, idx + 1)}
                onRemove={b.type === "terms" ? () => removeSection(b.id) : undefined}
              >
                {renderBlock(b)}
              </DocBlock>
            ))}
          </div>

          <div className="mt-2 border-t border-dashed border-line pt-4">
            <p className="text-xs text-ink-faint">Add a terms section</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cancellation ? null : (
                <button type="button" onClick={addCancellation} className={smallButton}>
                  + Cancellation
                </button>
              )}
              {clauseIdeas(vendor).filter((idea) => !draft.clauses.some((c) => c.title === idea.title)).map((idea) => (
                <button key={idea.title} type="button" onClick={() => addSection(idea)} className={smallButton}>
                  + {idea.title}
                </button>
              ))}
              <button
                type="button"
                onClick={() => addSection()}
                className="rounded-full border border-dashed border-card-edge px-3 py-1 text-xs font-semibold text-ink-soft hover:text-ink"
              >
                + Blank section
              </button>
            </div>
          </div>
        </article>

        <aside aria-label="Send" className="grid gap-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-card-edge bg-card p-5 shadow-[var(--shadow-card)]">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Contract total</p>
            <p className="serif mt-1 text-3xl text-ink" data-testid="rail-total">
              {money(total)}
            </p>
            <p className={`mt-1 text-xs ${scheduled === total ? "text-ink-faint" : "text-maroon dark:text-gold"}`}>
              {draft.schedule.length
                ? `${draft.schedule.length} payment${draft.schedule.length === 1 ? "" : "s"} · ${money(scheduled)} scheduled`
                : "No payments scheduled yet"}
            </p>

            {issues.length ? (
              <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-2 text-xs text-ink-soft">
                <span>
                  {issues.length === 1 ? "1 thing" : `${issues.length} things`} to fix before sending
                </span>
                <button type="button" onClick={showProblems} className="font-semibold text-gold underline-offset-4 hover:underline">
                  Show me
                </button>
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
                {error}
              </p>
            ) : null}

            {editing ? (
              <Button className="mt-4 w-full" disabled={busy !== null} onClick={() => submit("save")}>
                {busy === "save" ? "Saving…" : revising ? "Send new version" : "Save changes"}
              </Button>
            ) : (
              <div className="mt-4 grid gap-2">
                {canEmail ? (
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    <input type="checkbox" checked={emailClient} onChange={(e) => setEmailClient(e.target.checked)} />
                    <span className="min-w-0 truncate">
                      Email it to {request ? request.client_name || "your client" : draft.clientEmail.trim()}
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-ink-faint">No client email — copy the link and send it yourself.</p>
                )}
                <Button disabled={busy !== null} onClick={() => submit("send")}>
                  {busy === "send" ? "Sending…" : sendLabel}
                </Button>
                <Button variant="ghost" disabled={busy !== null} onClick={() => submit("copy")}>
                  {busy === "copy" ? "Creating link…" : "Copy link"}
                </Button>
                {request ? null : (
                  <Button variant="quiet" disabled={busy !== null} onClick={() => submit("draft")}>
                    {busy === "draft" ? "Saving…" : "Save as draft"}
                  </Button>
                )}
                <Field
                  label="Hold the date for (days)"
                  type="number"
                  min={1}
                  max={60}
                  placeholder={String(vendor.contract_hold_days ?? 7)}
                  value={draft.holdDays}
                  onChange={(e) => set({ holdDays: e.target.value })}
                  hint="Sending or copying the link holds your date for them. If they haven't signed by then, it opens up again."
                />
                {holdIssue ? <p className="-mt-1 text-xs text-maroon dark:text-gold">{holdIssue}</p> : null}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* On a phone the rail falls below a long document; keep the total and
          the one action that matters in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-card-edge bg-card/95 px-4 py-3 shadow-[0_-8px_24px_rgba(42,12,25,0.08)] backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">Total</p>
          <p className="serif text-lg text-ink">{money(total)}</p>
        </div>
        <Button disabled={busy !== null} onClick={primary.run}>
          {primary.label}
        </Button>
      </div>

      <ContractPreview
        open={previewing}
        onClose={() => setPreviewing(false)}
        draft={draft}
        title={draft.title || defaultTitle}
        vendorName={vendorName}
        clientName={clientName}
      />
    </div>
  );
}

export default function NewContractPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <NewContractInner />
    </Suspense>
  );
}
