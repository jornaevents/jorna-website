// Runs in <head> (app/layout.tsx): marks the page data-vendorish when this
// device's last sign-in was a vendor, or a Google sign-in from the vendor side
// is under way. The sign-in callback reads it, through CSS alone, to show a
// loading dashboard rather than plain "Finishing sign-in…" — decided before
// the first paint, and with no difference between the pre-rendered markup and
// React's, which a check in a component would have to wait for.

import { LAST_ROLE_KEY, OAUTH_ROLE_KEY } from "@jorna/shared/lib/sessionKeys";

export const VENDORISH_BOOT_SCRIPT = `try{if(localStorage.getItem("${LAST_ROLE_KEY}")==="vendor"||localStorage.getItem("${OAUTH_ROLE_KEY}")==="vendor")document.documentElement.dataset.vendorish=""}catch(e){}`;
