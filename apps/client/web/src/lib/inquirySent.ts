// Which "Ready to send" vendors in an event have had an inquiry sent from it,
// and the thread it started. Kept on this device only: an inquiry is its own
// lead and thread, and nothing on the backend ties it to the plan's draft
// booking yet, so without this the row would keep offering "Send inquiry".

const KEY = "jorna_event_inquiries";

type Sent = Record<string, { conversationId: string | null; at: string }>;

function read(): Sent {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Sent) : {};
  } catch {
    return {};
  }
}

/** The thread for a booking's inquiry: undefined if none was sent from here. */
export function inquirySentFor(bookingId: string): { conversationId: string | null } | undefined {
  return read()[bookingId];
}

export function rememberInquiry(bookingId: string, conversationId: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [bookingId]: { conversationId, at: new Date().toISOString() } }));
  } catch {
    // Storage refused (private mode): the row just keeps offering the form.
  }
}
