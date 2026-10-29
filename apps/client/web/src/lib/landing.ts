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
