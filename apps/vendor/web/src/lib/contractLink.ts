/** The no-login link a client uses to fill in, sign and pay a contract —
 *  the token is the whole credential (see /booking-link). */
export function guestBookingLink(token: string): string {
  // basePath is "/app" (next.config.ts) and doesn't rewrite a plain string
  // the way it rewrites next/link — same convention as home/page.tsx's own
  // literal "/app" prefix.
  return `${window.location.origin}/app/booking-link?t=${token}`;
}

/** What to tell the vendor after sending: it's in the client's chat
 *  (backend DECISIONS #48), and email_sent says whether the email pointing
 *  them there went. Only a true claims an email. */
export function sendNotice(emailSent: boolean | null | undefined, to: string | null | undefined): string {
  const who = to || "your client";
  if (emailSent === true) return `Sent in your chat — we emailed ${who} to open it there.`;
  if (emailSent === false) {
    return `Sent in your chat. We couldn't email ${who} about it, so they'll see it next time they open Jorna.`;
  }
  return "Sent in your chat.";
}

/** The vendor's own "View as client" — the same page, but opening it
 *  doesn't mark the contract as seen by the client. */
export function guestBookingPreviewLink(token: string): string {
  return `${guestBookingLink(token)}&preview=1`;
}

/** An addendum or cancellation agreement's own link — same page, its own
 *  token (?d=), never the contract's. */
export function guestDocumentLink(token: string): string {
  return `${window.location.origin}/app/booking-link?d=${token}`;
}

export function guestDocumentPreviewLink(token: string): string {
  return `${guestDocumentLink(token)}&preview=1`;
}
