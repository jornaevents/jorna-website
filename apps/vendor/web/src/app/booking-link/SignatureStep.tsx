"use client";

// The signature on a contract or an attached document (backend DECISIONS
// #27): the typed name, a 6-digit code emailed to the client, and the
// e-records consent box in the backend's own words. The backend records
// all three, with where the signature came from, in the signed copy.
//
// An older backend sends no consent text; then this is the name alone,
// as before.

import { useState } from "react";
import { ApiError } from "@jorna/shared/lib/api";
import { Button, Card, Field } from "@jorna/shared/components/ui";
import { signerMatches } from "@/lib/signerName";
import type { EsignConsent, SigningCodeSent, SigningProof } from "@/lib/types";

export function SignatureStep({
  kindLabel,
  signerName,
  onSignerName,
  nameOnContract,
  vendorName,
  consent,
  sendCode,
  onProof,
  disabled,
}: {
  /** "agreement", "addendum", … */
  kindLabel: string;
  signerName: string;
  onSignerName: (name: string) => void;
  /** Who the contract is for. A signature that doesn't match still signs;
   *  the backend flags it on the signed copy, so say so first. */
  nameOnContract?: string | null;
  vendorName: string;
  consent?: EsignConsent;
  /** Saves anything the code depends on (the email) and asks for one. */
  sendCode: () => Promise<SigningCodeSent>;
  /** The code and consent once both are in; null until then. */
  onProof: (proof: SigningProof | null) => void;
  disabled?: boolean;
}) {
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sent, setSent] = useState<SigningCodeSent | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Reported from the handlers, not an effect (react-hooks/set-state-in-effect).
  function update(nextCode: string, nextAgreed: boolean) {
    setCode(nextCode);
    setAgreed(nextAgreed);
    onProof(
      consent && nextAgreed && nextCode.length === 6
        ? { code: nextCode, consent: true, consent_version: consent.version }
        : null,
    );
  }

  async function send() {
    setSending(true);
    setSendError(null);
    try {
      setSent(await sendCode());
      update("", agreed);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Couldn't send the code. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-ink-soft">Your signature</p>
      <p className="mt-1 text-xs text-ink-soft">Type your full legal name to electronically sign this {kindLabel}</p>
      <div className="mt-3">
        <Field
          placeholder="Type your full name to sign"
          value={signerName}
          onChange={(e) => onSignerName(e.target.value)}
          autoComplete="name"
          required
        />
        {nameOnContract?.trim() && !signerMatches(signerName, nameOnContract) ? (
          <p className="mt-2 text-xs text-maroon dark:text-gold">
            This doesn&apos;t match the name on the contract ({nameOnContract.trim()}). You can still sign —{" "}
            {vendorName} will see the difference.
          </p>
        ) : null}
      </div>

      {consent ? (
        <>
          <div className="mt-5 border-t border-line-soft pt-4">
            <p className="text-sm font-medium text-ink-soft">Confirm your email</p>
            {sent ? (
              <>
                <p className="mt-1 text-xs text-ink-soft">
                  We sent a 6-digit code to {sent.sent_to}. It works for {sent.expires_in_minutes} minutes.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-40">
                    <Field
                      aria-label="6-digit code"
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => update(e.target.value.replace(/\D/g, "").slice(0, 6), agreed)}
                      required
                    />
                  </div>
                  <Button type="button" variant="quiet" disabled={sending || disabled} onClick={send}>
                    {sending ? "Sending…" : "Send a new code"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-ink-soft">
                  We&apos;ll email you a code. Entering it shows the signature is yours.
                </p>
                <Button type="button" variant="ghost" className="mt-3" disabled={sending || disabled} onClick={send}>
                  {sending ? "Sending…" : "Email me a code"}
                </Button>
              </>
            )}
            {sendError ? (
              <p role="alert" className="mt-2 text-xs text-maroon dark:text-gold">
                {sendError}
              </p>
            ) : null}
          </div>

          <label className="mt-5 flex items-start gap-2.5 border-t border-line-soft pt-4 text-xs leading-relaxed text-ink-soft">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreed}
              onChange={(e) => update(code, e.target.checked)}
              required
            />
            <span>{consent.text}</span>
          </label>
        </>
      ) : null}
    </Card>
  );
}
