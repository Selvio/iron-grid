import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLiveSync, type LiveSyncOptions } from "../use-live-sync";

/**
 * The adaptive live-sync loop (M11-T1).
 *
 * `.tsx` on purpose: vitest runs this project's `.tsx` files under jsdom
 * (`vitest.config.ts`), and the hook's whole point is reacting to
 * `document.visibilityState`.
 */

function Probe(options: LiveSyncOptions) {
  useLiveSync(options);
  return null;
}

/** Drive `document.visibilityState`, which jsdom leaves read-only by default. */
function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveSync", () => {
  it("polls on the active cadence while something keeps changing", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    render(<Probe poll={poll} activeMs={1000} idleMs={8000} />);

    expect(poll).not.toHaveBeenCalled(); // nothing before the first interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("backs off toward the idle cadence while nothing changes", async () => {
    const poll = vi.fn().mockResolvedValue(false);
    render(<Probe poll={poll} activeMs={1000} idleMs={4000} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);

    // The next gap has grown past the active cadence, so 1s buys nothing.
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(poll).toHaveBeenCalledTimes(2);

    // …and it never grows past the idle ceiling.
    await vi.advanceTimersByTimeAsync(4000 * 5);
    expect(poll.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("snaps back to the active cadence as soon as something changes", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    render(<Probe poll={poll} activeMs={1000} idleMs={8000} />);

    await vi.advanceTimersByTimeAsync(1000); // 1st: no change → backs off
    await vi.advanceTimersByTimeAsync(1500); // 2nd: change → resets
    expect(poll).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000); // active cadence again
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("makes no request at all while the tab is hidden", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    render(<Probe poll={poll} activeMs={1000} idleMs={8000} />);

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).not.toHaveBeenCalled();
  });

  it("polls immediately when the tab becomes visible again", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    render(<Probe poll={poll} activeMs={5000} idleMs={30_000} />);

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(poll).not.toHaveBeenCalled();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("skips a tick rather than stacking requests on a slow network", async () => {
    let release: (() => void) | undefined;
    const poll = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );
    render(<Probe poll={poll} activeMs={1000} idleMs={8000} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);
    // Three more intervals elapse while the first request is still in flight.
    await vi.advanceTimersByTimeAsync(3000);
    expect(poll).toHaveBeenCalledTimes(1);

    release?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a failed request instead of surfacing it", async () => {
    const poll = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(true);
    render(<Probe poll={poll} activeMs={1000} idleMs={8000} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);
    // A rejection is treated as "nothing changed": it backs off, never throws.
    await vi.advanceTimersByTimeAsync(1500);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("does not poll when disabled, and stops on unmount", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    const { unmount } = render(
      <Probe poll={poll} enabled={false} activeMs={1000} idleMs={8000} />,
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(poll).not.toHaveBeenCalled();
    unmount();

    const live = vi.fn().mockResolvedValue(true);
    const mounted = render(<Probe poll={live} activeMs={1000} idleMs={8000} />);
    await vi.advanceTimersByTimeAsync(1000);
    expect(live).toHaveBeenCalledTimes(1);

    mounted.unmount();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(live).toHaveBeenCalledTimes(1);
  });
});

describe("useLiveSync · canPoll", () => {
  it("skips without polling, and without letting the cadence drift", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    let allowed = false;
    render(
      <Probe
        poll={poll}
        canPoll={() => allowed}
        activeMs={1000}
        idleMs={16_000}
      />,
    );

    // A player deliberating for many cadences must not push the loop out to the
    // idle ceiling — a skip is "not now", not "the server is quiet".
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).not.toHaveBeenCalled();

    allowed = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});

describe("useLiveSync · nobody is watching", () => {
  it("goes dormant when the human stops touching anything, and wakes on them", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    render(
      <Probe poll={poll} activeMs={1000} idleMs={2000} idleStopMs={10_000} />,
    );

    await vi.advanceTimersByTimeAsync(5000);
    expect(poll.mock.calls.length).toBeGreaterThan(0);

    // Past the inactivity window a visible-but-abandoned tab stops asking, and
    // then stays stopped however long it is left — which is what keeps a
    // serverless database from being held awake all night for an empty chair.
    await vi.advanceTimersByTimeAsync(15_000);
    const settled = poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(poll.mock.calls.length).toBe(settled);

    // The player comes back: a single keystroke resumes it immediately.
    window.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(poll.mock.calls.length).toBe(settled + 1);
  });

  it("treats a moving pointer as presence, not as a reason to poll", async () => {
    const poll = vi.fn().mockResolvedValue(false);
    render(
      <Probe poll={poll} activeMs={1000} idleMs={1000} idleStopMs={10_000} />,
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);

    // Fifty pointer moves inside one interval must not add fifty requests.
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(new Event("pointermove"));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("polls only on attention when there is no cadence to keep", async () => {
    const poll = vi.fn().mockResolvedValue(true);
    render(<Probe poll={poll} attentionOnly activeMs={1000} idleMs={2000} />);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);

    // …and it does not start a cadence off the back of that one poll.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
