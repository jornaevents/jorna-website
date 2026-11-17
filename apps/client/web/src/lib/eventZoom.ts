// Opening an event from My Events zooms the card into the event's page (the
// Jorna-Client design does this with a view transition). React's
// <ViewTransition> can't pair them here: the event page loads its data in an
// effect, so the first thing it renders is "Loading…" and the morph would land
// on that. Instead the transition is started by hand and held open until the
// event page says it has drawn the event — capped, so a slow load shows the
// loading screen rather than a frozen one.
//
// Only one card carries the name, set on click, because a view-transition-name
// has to be unique on the page.

const NAME = "event-zoom";
const WAIT_MS = 900;

let arrived: (() => void) | null = null;

type StartViewTransition = (cb: () => Promise<void>) => unknown;

function supported(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start) return null;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
  return start.bind(document);
}

/** Navigate to an event, zooming `card` into it where the browser can. */
export function zoomIntoEvent(card: HTMLElement, go: () => void): void {
  const start = supported();
  if (!start) {
    go();
    return;
  }
  card.style.viewTransitionName = NAME;
  start(
    () =>
      new Promise<void>((resolve) => {
        const done = () => {
          arrived = null;
          resolve();
        };
        arrived = done;
        window.setTimeout(done, WAIT_MS);
        go();
      }),
  );
}

/** Whether a zoom is waiting on the event page. */
export function zoomPending(): boolean {
  return arrived !== null;
}

/** Called by the event page once the event is on screen. */
export function eventArrived(): void {
  arrived?.();
}

export const EVENT_ZOOM_NAME = NAME;
