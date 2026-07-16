import { describe, expect, it } from "vitest";

import {
  MembershipForbiddenError,
  UnauthenticatedError,
} from "../../auth/errors";
import { errorResponse } from "../http";
import { PreferencesValidationError } from "../notification-preferences";

/** Reads back the JSON body and status of a mapped error response. */
async function read(
  response: Response,
): Promise<{ status: number; body: unknown }> {
  return { status: response.status, body: await response.json() };
}

describe("errorResponse", () => {
  it("maps an unauthenticated error to 401", async () => {
    const { status, body } = await read(
      errorResponse(new UnauthenticatedError()),
    );
    expect(status).toBe(401);
    expect(body).toEqual({ error: "unauthenticated" });
  });

  it("maps a membership error to 403 with its code", async () => {
    const { status, body } = await read(
      errorResponse(new MembershipForbiddenError()),
    );
    expect(status).toBe(403);
    expect(body).toEqual({ error: "not_match_player" });
  });

  it("maps a preferences validation error to 400", async () => {
    const { status } = await read(
      errorResponse(
        new PreferencesValidationError("Unknown notification preference: x."),
      ),
    );
    expect(status).toBe(400);
  });

  it("maps an unexpected error to a bodyless-detail 500", async () => {
    const { status, body } = await read(
      errorResponse(new Error("boom internals")),
    );
    expect(status).toBe(500);
    expect(body).toEqual({ error: "internal_error" });
  });
});
