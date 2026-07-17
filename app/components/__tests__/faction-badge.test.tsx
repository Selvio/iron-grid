import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../ui/button";
import { FactionBadge } from "../faction-badge";

describe("FactionBadge", () => {
  it("renders a text label alongside an insignia (identity is never color-only)", () => {
    const { container } = render(<FactionBadge faction="blue" />);
    // The color word is present as text...
    expect(screen.getByText("Blue")).toBeInTheDocument();
    // ...paired with a distinct SVG insignia — so identity survives monochrome.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps the label available to assistive tech even when visually hidden", () => {
    render(<FactionBadge faction="red" showLabel={false} />);
    const label = screen.getByText("Red");
    expect(label).toHaveClass("sr-only");
  });

  it("gives each faction a distinct label", () => {
    const { rerender } = render(<FactionBadge faction="green" />);
    expect(screen.getByText("Green")).toBeInTheDocument();
    rerender(<FactionBadge faction="yellow" />);
    expect(screen.getByText("Yellow")).toBeInTheDocument();
  });
});

describe("Button (shell primitive smoke)", () => {
  it("renders as a link when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/sign-in">Sign in</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/sign-in");
  });
});
