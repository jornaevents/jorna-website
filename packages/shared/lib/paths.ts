/**
 * A site path with its trailing slash before any ?query or #hash. Both apps
 * export with `trailingSlash: true`, so the host answers "/client/plan" with a
 * 308 to "/client/plan/" — an extra round trip on every link written without
 * one (2026-10-29: every link between the two apps had it).
 */
export function withTrailingSlash(path: string): string {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? "" : path.slice(cut);
  return pathname.endsWith("/") ? path : `${pathname}/${rest}`;
}
