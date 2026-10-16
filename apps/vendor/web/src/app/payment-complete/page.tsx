"use client";

// Where Stripe sends the customer back after hosted Checkout (the backend builds
// this URL when the web client passes client=web). The webhook is what really
// marks a booking paid; we additionally call sync-payment here as a safety net
// for a delayed webhook. It's idempotent.

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { syncBookingPayment } from "@/lib/jorna";
import { LinkButton } from "@jorna/shared/components/ui";
import { clientAppUrl } from "@/lib/clientApp";
import { ESCROW_ENABLED } from "@jorna/shared/lib/flags";

type Phase = "working" | "paid" | "cancelled" | "pending";

function PaymentCompleteInner() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const bookingId = params.get("booking_id");
  const status = params.get("status");

  // What confirming the payment found, once it's been asked.
  const [result, setResult] = useState<"paid" | "pending" | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (loading || done.current || status === "cancel" || !bookingId || !user) return;
    done.current = true;
    syncBookingPayment(bookingId)
      .then(() => setResult("paid"))
      // A failure here doesn't mean the payment failed — the webhook may simply
      // not have landed yet. Say so instead of alarming the customer.
      .catch(() => setResult("pending"));
  }, [bookingId, status, user, loading]);

  // A cancelled checkout, or nothing we can confirm (no booking, signed out),
  // is known without asking the server.
  const phase: Phase =
    status === "cancel" ? "cancelled" : (result ?? (!loading && (!bookingId || !user) ? "pending" : "working"));

  const copy: Record<Phase, { title: string; body: string }> = {
    working: { title: "Confirming your payment…", body: "One moment." },
    paid: {
      title: "Payment received",
      // Escrow is off for now (lib/flags), so the money went to the vendor's
      // side as a normal payment — only promise holding it when it's held (#132).
      body: ESCROW_ENABLED
        ? "Your money is held safely in escrow and is only released to the vendor after the event, once you both confirm."
        : "Your vendor will confirm it on your booking.",
    },
    cancelled: {
      title: "Checkout cancelled",
      body: "No charge was made. You can pay whenever you're ready.",
    },
    pending: {
      title: "Payment is processing",
      body: "We haven't been able to confirm it just yet. This usually settles within a minute — your plan will update automatically.",
    },
  };

  const { title, body } = copy[phase];

  return (
    <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
      <h1 className="serif text-4xl text-maroon dark:text-gold">{title}</h1>
      <p className="mx-auto mt-4 max-w-[46ch] text-ink-soft">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <LinkButton href={clientAppUrl("/bundles")}>Back to the dashboard</LinkButton>
        <LinkButton href={clientAppUrl("/marketplace")} variant="ghost">
          Keep browsing
        </LinkButton>
      </div>
    </div>
  );
}

export default function PaymentCompletePage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-ink-soft">Loading…</p>}>
      <PaymentCompleteInner />
    </Suspense>
  );
}
