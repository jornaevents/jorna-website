import { listBundles, listEvents } from "./jorna";

/**
 * Where a client goes after signing in when nothing asked for a particular
 * page: their dashboard once they've started planning (any plan or event),
 * the Plan wizard before that. It used to be the wizard for everyone, which
 * put a returning client back at step one of a celebration they'd already
 * planned.
 *
 * If the lookup fails, the wizard — the safe answer for someone new, and one
 * tab away from the dashboard for anyone else.
 */
export async function clientLanding(): Promise<string> {
  try {
    const [bundles, events] = await Promise.all([listBundles(), listEvents()]);
    return bundles.length > 0 || events.length > 0 ? "/bundles" : "/plan";
  } catch {
    return "/plan";
  }
}

/**
 * Where a successful login is allowed to send someone.
 *
 * `next` comes straight off the URL, so a crafted link — mailed, messaged, or
 * just shared — can put anything there. Without this, a login that succeeds
 * for real would hand the browser off to whatever the link named, right after
 * the one moment a phishing page most wants to borrow credibility from.
 * Anything but a single leading slash (a bare path, no scheme, no host) is
 * rejected in favour of the same default an absent `next` already gets.
 *
 * Null means nothing asked for a page: the sign-in then picks one by whether
 * the client has started planning (clientLanding).
 */
export function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return null;
  }
  return raw;
}
