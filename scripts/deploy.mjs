// Self-verifying deploy.
//
// `wrangler deploy` uploads assets incrementally, and that upload has
// intermittently dropped files while still printing "Deployed" + a Version ID —
// leaving the marketing page (a plain static file) serving while every /app
// route 404s. A success line is therefore NOT proof the app shipped.
//
// So: build once, then deploy and actually fetch every route. If any isn't 200,
// re-deploy (which re-uploads whatever's missing) and check again. Give up loudly
// rather than leave production half-broken.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "public", "app");
const PAGES_PROJECT = "jorna-events";
// The apex is on Pages and is what people hit, so it is what we verify. The old
// Worker (misty-water-0dbb) is deleted; there is no second deploy target.
//
// Don't try to judge freshness by comparing this HTML against a *.pages.dev URL.
// The zone injects a bot-detection script (__CF$cv$params, ~938 bytes) into HTML
// served through the custom domain and not into pages.dev, so the bytes always
// differ and a byte comparison reports a perfectly current deploy as stale.
const DOMAIN = process.env.DEPLOY_DOMAIN ?? "https://jornaevents.com";
const MAX_ATTEMPTS = 4;
// A deploy can pass one check, then 404 for a while as it propagates across edge
// PoPs. Don't trust a single green check — require several consecutive clean
// passes, polling long enough for propagation to settle before failing a deploy.
const CONFIRM_PASSES = 3; // consecutive all-green sweeps required
const POLL_INTERVAL_MS = 8000;
const VERIFY_TIMEOUT_MS = 120000; // per deploy attempt

const log = (m) => console.log(`\x1b[36m[deploy]\x1b[0m ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every route in the built export, as verifiable URLs (dynamic — no drift). */
function routeUrls() {
  // "/" redirects into the app; "/help/" is the marketing page it used to be,
  // still linked from the App Store listing and the app's own footer. Add
  // "/privacy/", "/terms/" and "/support/" here when those move out of drafts/.
  const urls = new Set(["/", "/help/", "/app/"]);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "_next") continue; // hashed assets, not routes
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "index.html") {
        const rel = relative(appDir, dir).split(sep).join("/");
        urls.add(rel ? `/app/${rel}/` : "/app/");
      }
    }
  };
  if (existsSync(appDir)) walk(appDir);
  return [...urls].sort();
}

/** Fetch each route (cache-busted so a stale edge 404 can't fool us). */
async function findFailures(urls) {
  const failures = [];
  for (const u of urls) {
    const bust = `${u}${u.includes("?") ? "&" : "?"}_deploycheck=${Date.now()}`;
    try {
      const res = await fetch(DOMAIN + bust, { redirect: "follow" });
      if (res.status !== 200) failures.push(`${u} -> ${res.status}`);
    } catch (e) {
      failures.push(`${u} -> ${e.code ?? "network error"}`);
    }
  }
  return failures;
}

/** Refuse to publish documents that still have blanks in them.
 *
 *  The legal pages are drafted with the details only the owner can supply —
 *  entity name, support address, jurisdiction — marked "FILL:". They currently
 *  live in drafts/, outside the publish path, so this passes; it earns its keep
 *  the moment they move into public/. A privacy policy is a published promise
 *  that App Store Connect links straight to, so shipping one mid-sentence is
 *  worse than not having it up — better to make that impossible than to
 *  remember it. */
function assertNoPlaceholders() {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "app" && dir === join(root, "public")) continue; // generated
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".html") && readFileSync(p, "utf8").includes("FILL:")) {
        offenders.push(relative(root, p));
      }
    }
  };
  walk(join(root, "public"));
  if (offenders.length) {
    log(`\x1b[31mRefusing to deploy — unfilled placeholders ("FILL:") in:\x1b[0m`);
    for (const f of offenders) log(`    ${f}`);
    log("Fill them in, or move the file out of public/, then deploy again.");
    process.exit(1);
  }
}

assertNoPlaceholders();

// `npm ci` rather than whatever a developer's local `web/node_modules` happens
// to hold — that install could have drifted via a plain `npm install` picking
// up a newer minor version of an unpinned dependency (e.g. the Supabase or
// Firebase SDKs, both caret-ranged and both mediating auth) since it was last
// run. A production deploy should build from exactly what's in the committed
// lockfile, not from whatever's sitting on one machine.
log("installing web/ dependencies from the lockfile…");
execSync("npm ci --prefix web", { cwd: root, stdio: "inherit" });

log("building…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

const urls = routeUrls();
log(`will verify ${urls.length} routes after deploy`);

// A deploy step that exits non-zero `continue`s without ever verifying. Tracking
// that separately keeps the final message honest: "routes aren't serving" and
// "we never got as far as looking" are different problems with different fixes.
let everVerified = false;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  log(`deploy attempt ${attempt}/${MAX_ATTEMPTS}`);
  try {
    execSync(
      `npx --no-install wrangler pages deploy public --project-name ${PAGES_PROJECT} --branch main --commit-dirty=true`,
      { cwd: root, stdio: "inherit" },
    );
  } catch {
    log("the deploy exited non-zero — retrying");
    await sleep(4000);
    continue;
  }

  // Poll until the routes are stably green (CONFIRM_PASSES in a row) or we run
  // out of time for this attempt. A brief 404 is propagation; a persistent one
  // is a bad upload → re-deploy.
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let streak = 0;
  let lastFailures = [];
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    everVerified = true;
    lastFailures = await findFailures(urls);
    if (lastFailures.length === 0) {
      streak += 1;
      log(`clean sweep ${streak}/${CONFIRM_PASSES}`);
      if (streak >= CONFIRM_PASSES) {
        log(`\x1b[32m✓ all ${urls.length} routes stably serving 200 at ${DOMAIN} — verified\x1b[0m`);
        process.exit(0);
      }
    } else {
      if (streak > 0) log("regressed — restarting the stability count");
      streak = 0;
    }
  }

  log(`\x1b[33m✗ not stable after ${VERIFY_TIMEOUT_MS / 1000}s; last sweep had ${lastFailures.length} failure(s):\x1b[0m`);
  for (const f of lastFailures) log(`    ${f}`);
  if (attempt < MAX_ATTEMPTS) {
    log("re-deploying…");
    await sleep(2000);
  }
}

log(
  everVerified
    ? "\x1b[31mFAILED: routes still not serving after every attempt. " +
        "Production may be partially deployed — investigate before walking away.\x1b[0m"
    : "\x1b[31mFAILED: every deploy attempt exited non-zero, so the routes were never " +
        "checked. This is a deploy/config error (see the wrangler output above), not " +
        "evidence that the site is broken — verify the live URL before assuming either.\x1b[0m",
);
process.exit(1);
