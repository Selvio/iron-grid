import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Workspace Vitest harness (M0-T4).
 *
 * Node environment, TypeScript + ESM native. Each package is a project so
 * engine and data stay testable in isolation (`testing.md` §12). M9-T1 adds the
 * `ui` project (jsdom + React Testing Library) for the frontend shell.
 *
 * @see docs/04-development/milestones/m0-foundations.md (M0-T4)
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1)
 */
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./", import.meta.url)),
          },
        },
        test: {
          name: "ui",
          root: "./app",
          include: ["**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["../vitest.setup.ui.ts"],
        },
      },
      {
        // Generated-asset guards: the build scripts' outputs must not go stale.
        test: {
          name: "assets",
          root: "./scripts",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "game-engine",
          root: "./packages/game-engine",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "game-data",
          root: "./packages/game-data",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "backend-db",
          root: "./app/server/db",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "backend-auth",
          root: "./app/server/auth",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "backend-account",
          root: "./app/server/account",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "backend-lifecycle",
          root: "./app/server/lifecycle",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "backend-actions",
          root: "./app/server/actions",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "backend-notifications",
          root: "./app/server/notifications",
          include: ["**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
