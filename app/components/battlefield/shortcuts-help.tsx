"use client";

import { useRef } from "react";

import { useDialogFocus } from "./use-dialog-focus";

/**
 * The keyboard reference, opened with `?`.
 *
 * Shortcuts that are not written down anywhere are shortcuts nobody uses, and
 * the board's own affordances (the Range chip, the End turn button) can only
 * advertise one key each. This is the single place that lists them.
 *
 * @see docs/03-architecture/frontend.md §10
 */

/** The bindings, in the order a player meets them. */
export const SHORTCUTS: readonly {
  readonly keys: readonly string[];
  readonly description: string;
}[] = [
  { keys: ["←", "↑", "→", "↓"], description: "Move the cursor" },
  { keys: ["Enter"], description: "Select · confirm the highlighted action" },
  { keys: ["Esc"], description: "Cancel one step back · deselect" },
  { keys: ["Space"], description: "Show a ranged unit's attack range" },
  { keys: ["N"], description: "Jump to the next unit that has not acted" },
  { keys: ["E"], description: "End turn (asks first)" },
  { keys: ["M"], description: "Mute · unmute" },
  { keys: ["+", "-", "0"], description: "Zoom in · out · reset" },
  { keys: ["?"], description: "This list" },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border-2 border-[#1c2b45] bg-white px-2 py-0.5 font-mono text-xs font-extrabold text-[#1c2b45] shadow-[0_2px_0_rgba(28,43,69,0.25)]">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, true);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-[#1c2b45]/55 p-6"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[22px] border-[3px] border-[#1c2b45] bg-[#fff6e0] p-6 shadow-[0_8px_0_rgba(28,43,69,0.35)]"
      >
        <h2
          id="shortcuts-title"
          className="font-display text-xl font-extrabold text-[#1c2b45]"
        >
          Keyboard
        </h2>
        <dl className="mt-4 flex flex-col gap-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between gap-4"
            >
              <dt className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </dt>
              <dd className="text-right font-display text-sm font-bold text-[#4a5568]">
                {shortcut.description}
              </dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl border-[3px] border-[#1c2b45] bg-white py-2.5 font-display font-extrabold text-[#1c2b45] shadow-[0_4px_0_rgba(28,43,69,0.25)] active:translate-y-0.5"
        >
          Close
        </button>
      </div>
    </div>
  );
}
