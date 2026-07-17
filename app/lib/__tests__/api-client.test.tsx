import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "../api-client";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a match with fog forced off, carrying the session cookie", async () => {
    const fetchMock = mockFetch(201, {
      matchId: "m1",
      invitationCode: "ABC123",
      status: "waiting_for_opponent",
    });

    const result = await apiClient.createMatch({
      mapId: "map-1",
      turnDeadline: "24h",
      dayLimit: null,
    });

    expect(result.invitationCode).toBe("ABC123");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/matches");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({
      mapId: "map-1",
      settings: { fogEnabled: false, turnDeadline: "24h", dayLimit: null },
    });
  });

  it("issues a GET for the match read model", async () => {
    const fetchMock = mockFetch(200, { matchId: "m1", status: "active" });
    await apiClient.getMatch("m1");
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/matches/m1");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("normalizes the join code to upper-case", async () => {
    const fetchMock = mockFetch(200, {
      matchId: "m1",
      status: "commander_selection",
    });
    await apiClient.joinMatch("m1", " abc123 ");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ code: "ABC123" });
  });

  it("decodes a typed error, including the 409 conflict version", async () => {
    mockFetch(409, {
      error: "stale_state_version",
      currentStateVersion: 7,
    });
    await expect(apiClient.readyUp("m1")).rejects.toMatchObject({
      status: 409,
      code: "stale_state_version",
      currentStateVersion: 7,
    });
  });

  it("falls back to a generic code when the body has none", async () => {
    mockFetch(500, null);
    const error = await apiClient.listMatches().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("request_failed");
  });
});
