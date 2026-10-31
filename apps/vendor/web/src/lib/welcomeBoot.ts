// Runs in <head>, before anything is drawn (app/layout.tsx), so a signed-in
// vendor opening the site goes straight to their dashboard: without it the
// pre-rendered Welcome page painted first, then "Loading…", then the
// dashboard — a page they'd already left behind flashing on every visit.
//
// Only on Welcome's addresses ("/" by the root rewrite, /app/, /app/home/),
// and only with a session token. What the account is comes from the hint the
// role check leaves (ROLE_HINT_KEY): a vendor is sent on at once; anyone else
// signed in — a client, or an account not checked yet — has the page hidden
// until VendorHomeRedirect decides (it shows it again if the token turns out
// dead; html[data-leaving] in globals.css reveals it after a few seconds
// regardless, should the app never load). A dead token with a vendor hint
// lands on the dashboard, which sends it to sign in, as any page would.

import { ACCESS_KEY, ROLE_HINT_KEY } from "@jorna/shared/lib/sessionKeys";

export const WELCOME_BOOT_SCRIPT = `try{var p=location.pathname.replace(/\\/+$/,"");if((p===""||p==="/app"||p==="/app/home")&&localStorage.getItem("${ACCESS_KEY}")){if(localStorage.getItem("${ROLE_HINT_KEY}")==="vendor")location.replace("/app/overview/");else document.documentElement.dataset.leaving=""}}catch(e){}`;
