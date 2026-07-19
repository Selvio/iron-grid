"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  isMuted,
  isMutedServer,
  subscribeMuted,
  toggleMuted,
} from "@/app/lib/audio/settings";

/**
 * The board's sound switch (M12 audio).
 *
 * Reads the preference through `useSyncExternalStore` rather than mirroring it
 * in state: the audio module is the one that knows whether it is muted, and the
 * keyboard shortcut changes it without going through this button.
 */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, isMutedServer);
}

export function SoundToggle() {
  const muted = useMuted();
  const Icon = muted ? VolumeX : Volume2;
  return (
    <button
      type="button"
      aria-label={muted ? "Unmute" : "Mute"}
      aria-pressed={muted}
      onClick={() => toggleMuted()}
      className="grid size-9 place-items-center rounded-xl border-2 border-[#1c2b45] bg-white text-[#1c2b45] shadow-[0_2px_0_rgba(28,43,69,0.25)] transition-[filter,transform] hover:brightness-105 active:translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4a93f7]"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
