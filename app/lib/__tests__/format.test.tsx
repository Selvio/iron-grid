import { describe, expect, it } from "vitest";

import {
  formatCountdown,
  formatFunds,
  formatHp,
  formatMapName,
} from "../format";

const NOW = new Date("2026-07-16T12:00:00.000Z");

describe("formatFunds", () => {
  it("renders the generic currency G, thousands-grouped", () => {
    expect(formatFunds(0)).toBe("0 G");
    expect(formatFunds(12000)).toBe("12,000 G");
  });
});

describe("formatHp", () => {
  it("clamps and rounds onto the 0-10 scale", () => {
    expect(formatHp(10)).toBe("10");
    expect(formatHp(0)).toBe("0");
    expect(formatHp(-3)).toBe("0");
    expect(formatHp(14)).toBe("10");
    expect(formatHp(7.6)).toBe("8");
  });
});

describe("formatMapName", () => {
  it("title-cases a slug id without inventing a name", () => {
    expect(formatMapName("crossfire-basin")).toBe("Crossfire Basin");
    expect(formatMapName("ridge_line")).toBe("Ridge Line");
    expect(formatMapName("delta")).toBe("Delta");
  });

  it("tolerates stray separators", () => {
    expect(formatMapName("--twin--peaks-")).toBe("Twin Peaks");
    expect(formatMapName("")).toBe("");
  });
});

describe("formatCountdown", () => {
  it("reads 'No deadline' for a null (none) deadline", () => {
    expect(formatCountdown(null, NOW)).toBe("No deadline");
  });

  it("reads 'Overdue' once the deadline has passed", () => {
    expect(formatCountdown("2026-07-16T11:00:00.000Z", NOW)).toBe("Overdue");
    expect(formatCountdown(NOW.toISOString(), NOW)).toBe("Overdue");
  });

  it("shows days+hours, then hours+minutes, then minutes", () => {
    expect(formatCountdown("2026-07-18T14:00:00.000Z", NOW)).toBe("2d 2h");
    expect(formatCountdown("2026-07-16T15:30:00.000Z", NOW)).toBe("3h 30m");
    expect(formatCountdown("2026-07-16T12:45:00.000Z", NOW)).toBe("45m");
  });
});
