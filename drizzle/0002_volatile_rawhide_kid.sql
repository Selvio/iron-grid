CREATE TYPE "public"."event_type" AS ENUM('match_started', 'turn_started', 'income_granted', 'unit_repaired', 'unit_resupplied', 'fuel_consumed', 'unit_moved', 'unit_blocked_by_fog', 'unit_attacked', 'unit_counterattacked', 'unit_damaged', 'unit_destroyed', 'cargo_destroyed', 'capture_started', 'capture_progressed', 'property_captured', 'unit_produced', 'unit_loaded', 'unit_unloaded', 'units_joined', 'unit_supplied', 'submarine_dived', 'submarine_surfaced', 'missile_launched', 'terrain_damaged', 'terrain_destroyed', 'power_activated', 'turn_ended', 'player_resigned', 'victory_claimed', 'match_completed');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" "event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" "event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_player_id_match_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."match_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_match_sequence_key" ON "events" USING btree ("match_id","sequence");--> statement-breakpoint
CREATE INDEX "player_events_match_player_sequence_idx" ON "player_events" USING btree ("match_id","player_id","sequence");