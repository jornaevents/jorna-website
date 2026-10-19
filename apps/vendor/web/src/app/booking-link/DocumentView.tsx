"use client";

// An addendum or cancellation agreement, opened from its own link
// (/booking-link?d=…; backend DECISIONS #21). Same no-account trust model
// as the contract itself: the token is the credential, the couple types
// their name to sign. It's text only — signing it doesn't move money or
// dates on its own, and the page says so. Two steps, read then sign; there's
// no email or details step, because these only exist on a booking the
// client already gave both for when they signed the contract.

import { useEffect, useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { declineGuestDocument, getGuestDocument, requestDocumentSigningCode, signGuestDocument } from "@/lib/jorna";
import { KIND_LABEL } from "@/lib/attachedDocuments";
import { guestDocumentPdfUrl } from "@/lib/download";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import type { AttachedDocument, SigningProof } from "@/lib/types";
import { SignatureStep } from "./SignatureStep";
import { Stepper } from "./Stepper";
import { DOCUMENT_STEPS, type LinkStep } from "@/lib/linkSteps";

function prettyDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">{children}</div>;
}

/** Paragraphs as the vendor wrote them — a blank line starts a new one. */
function Body({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="mt-2 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink-soft">
          {p}
        </p>
      ))}
    </>
  );
}

function Sections({ doc }: { doc: AttachedDocument }) {
  return (
    <div className="grid gap-5">
      {doc.sections.map((s) => (
        <section key={s.key}>
          <h2 className="serif text-lg text-ink">{s.title}</h2>
          <Body text={s.body} />
        </section>
      ))}
    </div>
  );
}

export function DocumentView({ token, preview }: { token: string; preview: boolean }) {
  const [doc, setDoc] = useState<AttachedDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [proof, setProof] = useState<SigningProof | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<LinkStep>("review");

  function goTo(next: LinkStep) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    let cancelled = false;
    getGuestDocument(token, preview)
      .then((d) => !cancelled && setDoc(d))
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This link isn't valid. Check you copied all of it, or ask your vendor for a new one."
            : "Couldn't open this document. Check your connection and try again.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token, preview]);

  async function act(fn: () => Promise<AttachedDocument>) {
    setBusy(true);
    setError(null);
    try {
      setDoc(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <h1 className="serif text-2xl text-maroon dark:text-gold">We couldn&apos;t open this</h1>
        <p className="mt-3 text-ink-soft">{loadError}</p>
      </Shell>
    );
  }
  if (!doc) return <p className="py-20 text-center text-ink-soft">Opening your document…</p>;

  const vendorName = doc.vendor_display_name ?? "your vendor";
  const kindLabel = KIND_LABEL[doc.kind].toLowerCase();
  const forBooking = `your booking with ${vendorName}${doc.date_iso ? ` on ${prettyDate(doc.date_iso)}` : ""}`;

  if (doc.status === "voided") {
    return (
      <Shell>
        <p className="eyebrow">Withdrawn</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">{vendorName} withdrew this {kindLabel}</h1>
        <p className="mt-3 text-ink-soft">Nothing was signed. Your booking stays as it was agreed.</p>
      </Shell>
    );
  }
  if (doc.status === "declined") {
    return (
      <Shell>
        <p className="eyebrow">Declined</p>
        <h1 className="serif mt-2 text-2xl text-maroon dark:text-gold">You declined this {kindLabel}</h1>
        <p className="mt-3 text-ink-soft">
          We let {vendorName} know. Your booking stays as it was agreed — talk to them if you&apos;d like a new version.
        </p>
      </Shell>
    );
  }

  // Signed by the client; it applies once the vendor signs too (DECISIONS #34).
  if (doc.status === "awaiting_vendor") {
    return (
      <div className="mx-auto w-[min(640px,100%-2rem)] py-14">
        <div className="text-center">
          <p className="eyebrow">You signed</p>
          <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">Waiting for {vendorName} to sign</h1>
          <p className="mt-2 text-ink-soft">
            Signed by {doc.signer_name}
            {doc.client_signed_at ? ` on ${prettyDate(doc.client_signed_at)}` : ""}. Once {vendorName} signs too, it&apos;s
            part of {forBooking}, and we&apos;ll email you the signed copy.
          </p>
        </div>
        <Card className="mt-6 p-6">
          <Sections doc={doc} />
        </Card>
      </div>
    );
  }

  if (doc.status === "signed") {
    return (
      <div className="mx-auto w-[min(640px,100%-2rem)] py-14">
        <div className="text-center">
          <p className="eyebrow">Signed</p>
          <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">{doc.title}</h1>
          <p className="mt-2 text-ink-soft">
            Signed by {doc.signer_name}
            {doc.vendor_signer_name ? ` and ${doc.vendor_signer_name}` : ""} on {prettyDate(doc.signed_at)}. It&apos;s part
            of {forBooking}.
          </p>
        </div>
        <Card className="mt-6 p-6">
          <Sections doc={doc} />
        </Card>
        <div className="mt-6 text-center">
          <a
            href={guestDocumentPdfUrl(token)}
            download
            className="inline-flex items-center rounded-full border border-card-edge px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold"
          >
            Download your signed copy (PDF)
          </a>
        </div>
        {doc.signed_snapshot_sha256 ? (
          <p className="mt-4 break-all text-center text-xs text-ink-faint">
            Your signed copy&apos;s fingerprint (SHA-256): {doc.signed_snapshot_sha256}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-[min(640px,100%-2rem)] py-12">
      {preview ? (
        <p className="mb-6 rounded-lg bg-panel px-3 py-2 text-center text-sm text-ink-soft">
          Preview — this is what your client sees. Opening it here doesn&apos;t count as them opening it.
        </p>
      ) : null}
      <div className="text-center">
        <p className="eyebrow">
          {KIND_LABEL[doc.kind]} from {vendorName}
        </p>
        <h1 className="serif mt-2 text-3xl text-maroon dark:text-gold">{doc.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          For {forBooking}
          {doc.client_name ? `, with ${doc.client_name}` : ""}.
        </p>
      </div>

      <Stepper steps={DOCUMENT_STEPS} current={step} onPick={goTo} openAll={preview} />

      {step === "review" ? (
        <>
          <Card className="mt-8 p-6">
            <Sections doc={doc} />
            <p className="mt-6 rounded-lg bg-gold/10 px-3 py-2.5 text-sm text-ink-soft">
              This {kindLabel} is part of your written agreement with {vendorName}. Signing it doesn&apos;t move any money
              or dates by itself — Jorna doesn&apos;t handle payments.
            </p>
            <a
              href={guestDocumentPdfUrl(token)}
              download
              className="mt-3 inline-block text-sm font-semibold text-gold underline-offset-4 hover:underline"
            >
              Download as PDF
            </a>
          </Card>
          <Button type="button" size="lg" className="mt-6 w-full" onClick={() => goTo("sign")}>
            Looks good — sign it
          </Button>
        </>
      ) : (
        <form
          className="mt-8 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => signGuestDocument(token, signerName.trim(), proof));
          }}
        >
          <div className="flex justify-end text-sm">
            <button
              type="button"
              onClick={() => goTo("review")}
              className="font-semibold text-gold underline-offset-4 hover:underline"
            >
              Back to the {kindLabel}
            </button>
          </div>
          <SignatureStep
            kindLabel={kindLabel}
            signerName={signerName}
            onSignerName={setSignerName}
            nameOnContract={doc.client_name}
            vendorName={vendorName}
            consent={doc.esign_consent}
            onProof={setProof}
            disabled={preview}
            sendCode={() => requestDocumentSigningCode(token)}
          />
          {error ? (
            <p role="alert" className="rounded-lg bg-maroon/10 px-3 py-2 text-sm text-maroon dark:text-gold">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy || preview || !signerName.trim() || (!!doc.esign_consent && !proof)}
          >
            {busy ? "Signing…" : `Sign the ${kindLabel} →`}
          </Button>
        </form>
      )}

      <div className="mt-8 border-t border-line-soft pt-6 text-center">
        {declining ? (
          <div className="grid gap-3 text-left">
            <Field
              label={`Anything you'd like ${vendorName} to know? (optional)`}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-center gap-2">
              <Button
                variant="ghost"
                disabled={busy || preview}
                onClick={() => act(() => declineGuestDocument(token, reason.trim() || null))}
              >
                {busy ? "Sending…" : `Decline this ${kindLabel}`}
              </Button>
              <Button variant="quiet" onClick={() => setDeclining(false)}>
                Never mind
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="text-sm text-ink-faint underline-offset-4 hover:text-ink hover:underline"
          >
            Don&apos;t agree with this? Let {vendorName} know
          </button>
        )}
      </div>
    </div>
  );
}
