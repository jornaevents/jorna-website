"use client";

// /guests?event=… is where the guest list used to live on its own. It's a
// section of the event's page now (2026-11-17), so the host keeps the event and
// its sidebar; this stays as a redirect for links already out there (the plan
// page, bookmarks).

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EventSkeleton } from "@/components/Skeletons";

function GuestsRedirect() {
  const router = useRouter();
  const eventId = useSearchParams().get("event") ?? "";
  useEffect(() => {
    router.replace(eventId ? `/event?id=${encodeURIComponent(eventId)}&tab=guests` : "/bundles");
  }, [router, eventId]);
  return <EventSkeleton />;
}

export default function GuestsPage() {
  return (
    <Suspense fallback={<EventSkeleton />}>
      <GuestsRedirect />
    </Suspense>
  );
}
