// Whether a typed signature is the name the contract is for — the backend's
// signing_evidence.name_check, so the page warns about exactly what the
// signed record will flag. A mismatch still signs (a partner, a nickname);
// this only decides whether to say so first.

function words(name: string): string[] {
  return name
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** True when they match, or when there's nothing to compare against. */
export function signerMatches(signer: string, onContract: string | null | undefined): boolean {
  const want = words(onContract ?? "");
  const got = words(signer);
  if (!want.length || !got.length) return true;
  if (got.join(" ") === want.join(" ")) return true;
  return got.length >= 2 && got[0] === want[0] && got[got.length - 1] === want[want.length - 1];
}
