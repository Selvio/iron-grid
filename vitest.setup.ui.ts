import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * UI test setup (M9-T1): jest-dom matchers + an auto-unmount between tests so
 * component trees never leak across cases.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1)
 */
afterEach(() => {
  cleanup();
});
