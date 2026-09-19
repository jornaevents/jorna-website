// Copy the Next static export into the Worker's asset directory.
//
// `next build` (output: "export", basePath: "/app") writes to web/out with the
// basePath stripped from the folder structure, so the contents belong at
// public/app — which the Worker then serves at book.jornaevents.com/app.

import { copyFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "..", "out");
const publicDir = resolve(here, "..", "..", "public");
const to = resolve(publicDir, "app");

if (!existsSync(from)) {
  console.error(`✗ No export found at ${from} — run \`next build\` first.`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`✓ Exported app → ${to}`);

// Mirror the app's icon to the site root.
//
// Everything the app owns lives under /app, so that's the only place its icon
// was reachable — and https://book.jornaevents.com/favicon.ico was a 404. Google
// looks there as well as at the page's own <link rel="icon">, and a search
// result with a generic globe beside it is what a missing one looks like.
//
// Copied at build time rather than committed separately so it can't drift from
// whatever src/app currently declares: change the icon in one place and the
// root follows. Both filenames are Next conventions (favicon.ico or icon.*),
// so whichever is in use gets mirrored.
const ICONS = ["favicon.ico", "icon.png", "icon.svg"];
const icon = ICONS.find((name) => existsSync(resolve(to, name)));

if (icon) {
  copyFileSync(resolve(to, icon), resolve(publicDir, icon));
  console.log(`✓ Mirrored /${icon} to the site root`);
} else {
  console.warn(`⚠ No app icon found (looked for ${ICONS.join(", ")}) — the site root has none`);
}
