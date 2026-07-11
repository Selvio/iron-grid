import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Documentation is not lintable source (cspell covers the Markdown); this
    // also excludes the vendored Claude Design export under docs/05-design
    // (support.js, *.dc.html). See docs/05-design/design-reference.md.
    "docs/**",
  ]),
]);

export default eslintConfig;
