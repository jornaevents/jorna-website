"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openBookingThread } from "@/lib/jorna";
import { Button } from "./ui";

/**
 * Open a booking's private thread and go to it. Either party may open it —
 * a button rather than a link because the thread may not exist yet: the
 * server makes it on first ask and returns the same one after, so there is
 * no "start a chat" and "open the chat" to tell apart, here or in the
 * caller's head. Shared between the client's plan page and the vendor's
 * bookings list — same call, same failure handling either side.
 */
export function MessageVendorButton({
  bookingId,
  fallbackHref = "/messages",
}: {
  bookingId: string;
  /** Where to send the user if opening the thread fails. Each caller isn't
   *  a good place to explain a chat failure, so this just goes to the
   *  inbox by default — override for a caller with a different fallback. */
  fallbackHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="quiet"
      size="md"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const conv = await openBookingThread(bookingId);
          router.push(`/conversation?id=${conv.conversation_id}`);
        } catch {
          router.push(fallbackHref);
        }
      }}
    >
      {busy ? "Opening…" : "Message"}
    </Button>
  );
}
