"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Focus behaviour shared by the battlefield's modal surfaces (`game-specification.md`
 * §27.4: keyboard focus must not be trapped by the canvas, and critical state
 * must be reachable as HTML).
 *
 * While a dialog is open, Tab cycles inside it — a modal that lets Tab wander
 * onto the board behind it strands the keyboard — and closing returns focus to
 * whatever opened it, so the next Tab continues from where the player was
 * instead of restarting at the top of the page.
 *
 * @see docs/03-architecture/frontend.md §10
 */
export function useDialogFocus(
  container: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // No visibility filtering: `offsetParent` is meaningless in jsdom, and these
    // dialogs never hold hidden controls — the selector's :not([disabled]) and
    // the tabindex guard are enough.
    const focusable = (): HTMLElement[] => [
      ...(container.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back in if it escaped the dialog.
      if (
        event.shiftKey &&
        (active === first || !container.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !container.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      opener.current?.focus();
    };
  }, [open, container]);
}
