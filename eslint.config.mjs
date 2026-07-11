import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * Modules the pure engine may never import — the canonical list is
 * `rules.yaml` → `engine_contract.forbidden_dependencies`. This is the
 * source-level guard; the package-manifest guard lives in
 * `packages/game-engine/src/forbidden-deps.test.ts`.
 */
const FORBIDDEN_ENGINE_IMPORTS = [
  "next",
  "next/*",
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "phaser",
  "phaser/*",
  "drizzle-orm",
  "drizzle-orm/*",
  "pg",
  "pg/*",
  "@neondatabase/serverless",
  "resend",
  "@auth/core",
  "@auth/core/*",
];

const eslintConfig = defineConfig([
  // The Next.js + TypeScript presets apply workspace-wide: their TypeScript
  // rules lint the pure packages, while their React/Next rules simply do not
  // match the packages' framework-free code (so no separate slice is needed).
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

  // The pure engine must stay framework-free (architecture.md §4).
  {
    files: ["packages/game-engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: FORBIDDEN_ENGINE_IMPORTS,
              message:
                "game-engine must stay framework-free — see rules.yaml → engine_contract.forbidden_dependencies.",
            },
          ],
        },
      ],
    },
  },

  // Disable ESLint formatting rules that would conflict with Prettier.
  // Keep this last so it wins.
  prettier,
]);

export default eslintConfig;
