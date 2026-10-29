#!/usr/bin/env bash
# For staging and PR-preview builds, run from apps/<app> after `npm run build`:
#   1. Points public/_redirects at the staging apps instead of production. The
#      client app's project (book.jornaevents.com) is all redirects to
#      jornaevents.com since 2026-10-29; on staging those must reach staging.
#      The rewritten rules use 302, so a browser doesn't cache a staging
#      redirect the way it caches a 301.
#   2. Fails if a production web or API address is still anywhere in the
#      built site, except canonical/og:url tags (metadata for search engines,
#      never followed by the browser) and _headers (the committed CSP; staging
#      builds only add to it). The cross-app links come from
#      NEXT_PUBLIC_VENDOR_APP_URL / NEXT_PUBLIC_CLIENT_APP_URL, which the
#      build must have set.
set -euo pipefail

CLIENT_STAGING=https://staging.jorna-events.pages.dev
VENDOR_STAGING=https://staging.jorna-vendor.pages.dev

redirects=public/_redirects
if [ -f "$redirects" ]; then
  # book. first: the apex pattern would otherwise match inside it.
  sed -E -i.bak \
    -e "s#https://book\.jornaevents\.com#$CLIENT_STAGING#g" \
    -e "s#https://(www\.)?jornaevents\.com#$VENDOR_STAGING#g" \
    -e "/pages\.dev/ s#[[:space:]]301\$# 302#" \
    "$redirects"
  rm -f "$redirects.bak"
fi

prod='https?://((www|book)\.)?jornaevents\.com|desiconnect-production\.up\.railway\.app'
leaks=$(grep -rnoE ".{0,40}($prod)" public --exclude=_headers |
  grep -vE 'canonical|og:url' || true)
if [ -n "$leaks" ]; then
  echo "::error::This staging/preview build still points at production:"
  echo "$leaks" | head -20
  exit 1
fi
echo "No production addresses in the build; redirects point at staging."
