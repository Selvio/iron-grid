import { describe, expect, it } from "vitest";

import { StateVersionConflictError } from "../../db";
import {
  ActionValidationError,
  InvalidActionError,
  MatchNotActiveError,
  NotActivePlayerError,
  UnsupportedActionError,
} from "../errors";
import { errorResponse } from "../http";

async function read(
  response: Response,
): Promise<{ status: number; body: unknown }> {
  return { status: response.status, body: await response.json() };
}

describe("actions errorResponse", () => {
  it("maps a stale-version conflict to 409 with the safe version", async () => {
    const { status, body } = await read(
      errorResponse(new StateVersionConflictError(7)),
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      error: "stale_state_version",
      currentStateVersion: 7,
    });
  });

  it("maps an illegal action to 422 with the engine codes", async () => {
    const { status, body } = await read(
      errorResponse(
        new ActionValidationError(["unit_already_acted", "invalid_path"]),
      ),
    );
    expect(status).toBe(422);
    expect(body).toEqual({
      error: "invalid_action_legality",
      codes: ["unit_already_acted", "invalid_path"],
    });
  });

  it("maps malformed / unsupported / status errors to their codes", async () => {
    expect(
      (await read(errorResponse(new InvalidActionError("x")))).status,
    ).toBe(400);
    expect(
      (await read(errorResponse(new UnsupportedActionError()))).status,
    ).toBe(422);
    expect((await read(errorResponse(new MatchNotActiveError()))).body).toEqual(
      {
        error: "match_not_active",
      },
    );
    expect((await read(errorResponse(new NotActivePlayerError()))).status).toBe(
      409,
    );
  });

  it("maps an unexpected error to a detail-free 500", async () => {
    const { status, body } = await read(
      errorResponse(new Error("boom internals")),
    );
    expect(status).toBe(500);
    expect(body).toEqual({ error: "internal_error" });
  });
});
