// The sign-up form's "I agree to the Terms and the Privacy Policy" box, and
// the line that stands in for it under "Continue with Google" on the sign-in
// page (where Google can make a brand-new account in one tap). Both sign-ups
// use these — the vendor's on /app/login and the client's on /client/login —
// and send accept_terms, which the backend records (0082).
//
// The links are site paths, so they work on production, staging and previews
// alike. /terms/ and /privacy/ are published from drafts/ once the legal
// pages' blanks are filled in (2026-11-03: shown before then, by decision).

const linkClass = "font-bold text-(--e-burgundy) underline underline-offset-2";

function Links() {
  return (
    <>
      the{" "}
      <a href="/terms/" target="_blank" rel="noopener" className={linkClass}>
        Terms of Service
      </a>{" "}
      and the{" "}
      <a href="/privacy/" target="_blank" rel="noopener" className={linkClass}>
        Privacy Policy
      </a>
    </>
  );
}

export function TermsAgreement({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-left text-[13px] leading-normal text-(--e-muted)">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-(--e-burgundy)"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
      />
      <span>
        I agree to <Links />.
      </span>
    </label>
  );
}

export function TermsNotice() {
  return (
    <p className="text-[12px] leading-normal text-(--e-muted)">
      New to Jorna? Continuing with Google creates an account, and means you agree to <Links />.
    </p>
  );
}
