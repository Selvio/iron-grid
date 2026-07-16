import { defineConfig } from "vitest/config";

/**
 * Workspace Vitest harness (M0-T4).
 *
 * Node environment, TypeScript + ESM native. Each package is a project so
 * engine and data stay testable in isolation (`testing.md` §12).
 *
 * @see docs/04-development/milestones/m0-foundations.md (M0-T4)
 */
export default defineConfig({
  test: {
    environment: "node",
    projects: [
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
    ],
  },
});
