/**
 * Runtime enumerations, mirrored from `rules.yaml` → `enums`.
 *
 * These are match/runtime vocabularies (status, action, event, completion,
 * validation-error codes) — distinct from the reference-data enums in
 * `game-data`. Encoding them as string-literal unions keeps the engine's
 * discriminated unions exhaustive-checkable (`coding-standards.md` §5).
 *
 * @see docs/02-data/rules.yaml → enums
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

/** Match lifecycle status (`rules.yaml` enums.match_statuses). */
export type MatchStatus =
  | "draft"
  | "waiting_for_opponent"
  | "commander_selection"
  | "ready_check"
  | "active"
  | "completed"
  | "cancelled";

/** Action types a player may submit (`rules.yaml` enums.action_types). */
export type ActionType =
  | "move_and_wait"
  | "attack"
  | "capture"
  | "supply"
  | "load"
  | "unload"
  | "join"
  | "produce"
  | "dive"
  | "surface"
  | "launch_missile"
  | "activate_power"
  | "end_turn"
  | "resign"
  | "claim_victory";

/** How a match ended (`rules.yaml` enums.completion_reasons). */
export type CompletionReason =
  | "headquarters_captured"
  | "army_eliminated"
  | "resignation"
  | "timeout_claimed"
  | "day_limit_score"
  | "administrative";

/** Resolved event types (`rules.yaml` enums.event_types). */
export type EventType =
  | "match_started"
  | "turn_started"
  | "income_granted"
  | "unit_repaired"
  | "unit_resupplied"
  | "fuel_consumed"
  | "unit_moved"
  | "unit_blocked_by_fog"
  | "unit_attacked"
  | "unit_counterattacked"
  | "unit_damaged"
  | "unit_destroyed"
  | "cargo_destroyed"
  | "capture_started"
  | "capture_progressed"
  | "property_captured"
  | "unit_produced"
  | "unit_loaded"
  | "unit_unloaded"
  | "units_joined"
  | "unit_supplied"
  | "submarine_dived"
  | "submarine_surfaced"
  | "missile_launched"
  | "terrain_damaged"
  | "terrain_destroyed"
  | "power_activated"
  | "turn_ended"
  | "player_resigned"
  | "victory_claimed"
  | "match_completed";

/** Action-rejection codes (`rules.yaml` enums.validation_error_codes). */
export type ValidationErrorCode =
  | "match_not_active"
  | "not_match_player"
  | "not_active_player"
  | "stale_state_version"
  | "invalid_action_type"
  | "invalid_unit"
  | "unit_not_owned"
  | "unit_already_acted"
  | "invalid_path"
  | "path_blocked"
  | "insufficient_movement"
  | "insufficient_fuel"
  | "destination_occupied"
  | "target_not_visible"
  | "invalid_target"
  | "out_of_range"
  | "cannot_move_and_attack"
  | "no_valid_weapon"
  | "insufficient_ammo"
  | "invalid_capture"
  | "invalid_supply"
  | "invalid_transport"
  | "invalid_join"
  | "invalid_production"
  | "insufficient_funds"
  | "invalid_special_state"
  | "power_not_ready"
  | "deadline_not_expired"
  | "victory_claim_unavailable"
  | "match_already_completed"
  | "invalid_map_state"
  | "data_version_mismatch";
