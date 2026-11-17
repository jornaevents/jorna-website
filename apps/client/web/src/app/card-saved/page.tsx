"use client";

// Where Stripe returns the client after they save a card.
//
// The card itself is stored by Stripe, not here. This adopts whichever one they
// just entered — read from Stripe rather than from the redirect, which is why
// arriving twice, or with a stale link, settles on the same answer.
//
// Nothing is charged here. The card is charged when a vendor accepts, which is
// the same moment payment happened before; what changed is that nobody has to
// come back for it.

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { CARD_RETURN_KEY, syncSavedCard, type SavedCard } from "@/lib/jorna";
import { Button } from "@jorna/shared/components/ui";
import { FormSkeleton } from "@/components/Skeletons";

type Phase = "working" | "saved" | "cancelled" | "failed";

function CardSavedInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const cancelled = params.get("status") === "cancel";

  const [phase, setPhase] = useState<Phase>(cancelled ? "cancelled" : "working");
  const [card, setCard] = useState<SavedCard | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (loading || cancelled || !user || done.current) return;
    done.current = true;
    // The result lands in a callback rather than after an await, so nothing is
    // written to state while the effect body is still running.
    syncSavedCard()
      .then((saved) => {
        setCard(saved);
        setPhase(saved.has_card ? "saved" : "failed");
      })
      .catch(() => setPhase("failed"));
  }, [loading, cancelled, user]);

  if (loading || phase === "working") {
    return <p className="py-20 text-center text-ink-soft">Saving your card…</p>;
  }

  const heading =
    phase === "saved"
      ? "Card saved"
      : phase === "cancelled"
        ? "No card saved"
        : "That didn't save";

  const body =
    phase === "saved"
      ? `We'll charge ${card?.brand ? `your ${card.brand}` : "your card"}${
          card?.last4 ? ` ending ${card.last4}` : ""
        } as each vendor accepts — not before. Nothing is charged for a vendor who says no.`
      : phase === "cancelled"
        ? "You can add one whenever you're ready. Vendors won't be asked until your plan is sent."
        : "Your card wasn't saved. Try again from your plan, or pay each booking as it's accepted.";

  return (
    <div className="mx-auto w-[min(560px,100%-2rem)] py-20 text-center">
      <h1 className="serif text-3xl text-maroon dark:text-gold">{heading}</h1>
      <p className="mt-3 text-ink-soft">{body}</p>
      {/* Read on the click rather than during render: this page is prerendered
          into static HTML, where sessionStorage doesn't exist, and reading it
          while rendering would make the server's markup and the browser's
          disagree. Left by whichever page sent us to Stripe — Stripe returns to
          a fixed URL and can't tell us where the client was. */}
      <Button
        className="mt-6"
        onClick={() => {
          let destination = "/bundles";
          try {
            destination = sessionStorage.getItem(CARD_RETURN_KEY) || destination;
          } catch {
            // Storage unavailable. The dashboard is a fine second choice.
          }
          router.push(destination);
        }}
      >
        Back to your plan
      </Button>
    </div>
  );
}

export default function CardSavedPage() {
  return (
    <Suspense fallback={<FormSkeleton label="Checking your card…" fields={1} />}>
      <CardSavedInner />
    </Suspense>
  );
}
