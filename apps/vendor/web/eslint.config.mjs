import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Back to blocking (issue #2): every effect that set state synchronously
      // was rewritten — derived during render, keyed to what it was loaded
      // for, or set only when a promise settles. A new one should get the same
      // treatment (https://react.dev/learn/you-might-not-need-an-effect).
      "react-hooks/set-state-in-effect": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-noescrow/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
