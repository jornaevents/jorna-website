"use client";

// Get started — "How will you use Jorna?", from the Figma Make "Jorna-Vendor"
// entry flow (2026-10). Every landing header's "Get started" lands here; pick
// a side, then Continue to that side's sign-up: a client's in the client app,
// a vendor's here (then onboarding). The landing pages' side-specific buttons
// skip this and go straight to their side.
//
// ?as=vendor or ?as=client preselects a card, for links that already know.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clientAppUrl } from "@/lib/clientApp";
import { EntryShell, FlowIcon, primaryButton, textButton } from "@/components/entry/ui";

type Choice = "client" | "vendor";

const OPTIONS: { value: Choice; title: string; body: string }[] = [
  { value: "client", title: "I'm planning an event", body: "Find vendors, compare packages, and manage your bookings." },
  { value: "vendor", title: "I'm a vendor", body: "List your services, send contracts, and get paid." },
];

function GetStartedInner() {
  const router = useRouter();
  const params = useSearchParams();
  const preset = params.get("as");
  const [choice, setChoice] = useState<Choice | null>(preset === "client" || preset === "vendor" ? preset : null);

  function go() {
    if (choice === "client") window.location.assign(clientAppUrl("/login?mode=register"));
    else if (choice === "vendor") router.push("/login?mode=register&role=vendor");
  }

  return (
    <EntryShell>
      <main className="grid flex-1 place-items-center px-4 pb-16 pt-8 sm:pt-12">
        <section className="w-full max-w-[780px] text-center">
          <p className="e-eyebrow">Get started with Jorna</p>
          <h1 className="e-display mt-3 text-[34px] sm:text-[42px]">How will you use Jorna?</h1>
          <p className="mt-2 text-[15px] text-(--e-muted)">Choose the experience that fits what you&apos;re here to do.</p>

          <div role="radiogroup" aria-label="How you'll use Jorna" className="mt-8 grid gap-3.5 sm:grid-cols-2">
            {OPTIONS.map((o) => {
              const selected = choice === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChoice(o.value)}
                  className={`relative flex min-h-[220px] flex-col items-center justify-center rounded-[19px] border-2 px-6 py-7 shadow-[0_12px_36px_rgba(50,44,38,.055)] transition sm:min-h-[245px] ${
                    selected
                      ? "border-(--e-gold) bg-[#fffcf3] shadow-[0_14px_38px_rgba(155,118,44,.12)]"
                      : "border-(--e-line) bg-(--e-paper) hover:border-[#cdb87a]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute right-3.5 top-3.5 grid size-6 place-items-center rounded-full border text-white ${
                      selected ? "border-(--e-gold-dark) bg-(--e-gold-dark)" : "border-[#d9d0c5] bg-white"
                    }`}
                  >
                    {selected ? <FlowIcon name="check" size={13} /> : null}
                  </span>
                  {o.value === "client" ? (
                    <span className="relative grid size-[70px] place-items-center rounded-[21px] bg-(--e-rose) text-(--e-burgundy)">
                      <FlowIcon name="calendar" size={27} />
                      <span className="absolute bottom-2 right-2 grid size-[22px] place-items-center rounded-full border-[3px] border-(--e-rose) bg-(--e-burgundy) text-white">
                        <FlowIcon name="heart" size={11} />
                      </span>
                    </span>
                  ) : (
                    <span className="grid size-[70px] place-items-center rounded-[21px] bg-(--e-wheat) text-[#7a5b1e]">
                      <FlowIcon name="storefront" size={29} />
                    </span>
                  )}
                  <strong className="e-ui mt-5 text-[18px]">{o.title}</strong>
                  <span className="mt-2 max-w-[260px] text-[14px] leading-[1.55] text-(--e-muted)">{o.body}</span>
                </button>
              );
            })}
          </div>

          <button type="button" disabled={!choice} onClick={go} className={`${primaryButton} mt-6 w-full sm:w-[240px]`}>
            Continue <FlowIcon name="arrow" size={15} />
          </button>
          <p className="mt-6 text-[14px] text-(--e-muted)">
            Already have an account?{" "}
            <Link href="/login" className={textButton}>
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </EntryShell>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense fallback={null}>
      <GetStartedInner />
    </Suspense>
  );
}
