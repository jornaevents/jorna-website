import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This rule flags every "hydrate/reset state on mount or on a guard
      // failing, then continue async work" effect — the pattern used
      // throughout auth.tsx, nav.tsx, and the booking/payment pages — not
      // just genuine bugs. Rewriting all of those to satisfy it is a real
      // behavioral refactor of production auth/booking/payment code, not a
      // lint fix, so it's downgraded to non-blocking rather than silenced;
      // see https://github.com/jornaevents-commits/jorna-website/issues/2 for the
      // tracked proper pass. Mirrors the day-one ruff scoping decision made
      // in the backend's CI (see Desiconnect's docs/TESTING.md).
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
