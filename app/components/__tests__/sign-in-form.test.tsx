import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppNav } from "../app-nav";
import { SignInForm } from "../sign-in-form";

describe("SignInForm", () => {
  it("renders the email form when no link has been sent", () => {
    render(<SignInForm action={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send sign-in link/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  it("submits the email to the sign-in action", async () => {
    const action = vi.fn();
    render(<SignInForm action={action} />);
    await userEvent.type(screen.getByLabelText("Email"), "player@example.edu");
    await userEvent.click(
      screen.getByRole("button", { name: /send sign-in link/i }),
    );
    expect(action).toHaveBeenCalledOnce();
    const formData = action.mock.calls[0][0] as FormData;
    expect(formData.get("email")).toBe("player@example.edu");
  });

  it("shows the check-your-inbox state once the link is sent", () => {
    render(<SignInForm action={vi.fn()} sent />);
    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("surfaces an error state", () => {
    render(<SignInForm action={vi.fn()} error />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not send/i);
  });
});

describe("AppNav", () => {
  it("shows the signed-in identity and a sign-out control", async () => {
    const signOut = vi.fn();
    render(<AppNav userLabel="player@example.edu" signOutAction={signOut} />);
    expect(screen.getByText("player@example.edu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
