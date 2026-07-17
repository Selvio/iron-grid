import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FactionBadge, type FactionId } from "@/app/components/faction-badge";
import { SignInForm } from "@/app/components/sign-in-form";

/**
 * M9 UI acceptance suite (M9-T8).
 *
 * The cross-cutting DoD assertions the per-screen tests don't cover: accessible
 * faction identity that never relies on color alone, keyboard operability of the
 * shell's entry form, and the reduced-motion default (`frontend.md` §10,
 * `game-specification.md` §34). The per-screen behavior (dashboard grouping,
 * create/join/commander/ready transitions, completed reason, notification
 * round-trip) is proven in each component's own suite.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T8)
 */

const FACTIONS: readonly FactionId[] = ["blue", "green", "red", "yellow"];

describe("accessibility — faction identity is never color-only", () => {
  it("pairs every faction with a distinct insignia and a text label", () => {
    const labels = new Set<string>();
    for (const faction of FACTIONS) {
      const { container, unmount } = render(<FactionBadge faction={faction} />);
      // A shape (SVG insignia) accompanies the color...
      expect(container.querySelector("svg")).toBeInTheDocument();
      // ...and a distinct text label carries identity without color.
      const label = container.textContent?.trim() ?? "";
      expect(label).not.toBe("");
      labels.add(label);
      unmount();
    }
    expect(labels.size).toBe(FACTIONS.length);
  });

  it("keeps the label for assistive tech even when visually hidden", () => {
    render(<FactionBadge faction="green" showLabel={false} />);
    expect(screen.getByText("Green")).toHaveClass("sr-only");
  });
});

describe("keyboard operability", () => {
  it("drives the sign-in form entirely from the keyboard", async () => {
    const action = vi.fn();
    const user = userEvent.setup();
    render(<SignInForm action={action} />);

    await user.tab();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    await user.keyboard("player@example.edu");
    await user.keyboard("{Enter}");

    expect(action).toHaveBeenCalledOnce();
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("email")).toBe("player@example.edu");
  });
});

describe("reduced motion is honored by default", () => {
  it("ships a prefers-reduced-motion rule in the global stylesheet", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
