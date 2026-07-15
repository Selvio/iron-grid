CREATE TYPE "public"."completion_reason" AS ENUM('headquarters_captured', 'army_eliminated', 'resignation', 'timeout_claimed', 'day_limit_score', 'administrative');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('draft', 'waiting_for_opponent', 'commander_selection', 'ready_check', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "match_status" NOT NULL,
	"map_id" text NOT NULL,
	"settings" jsonb NOT NULL,
	"invitation_code" text NOT NULL,
	"game_data_version" text,
	"random_seed" text,
	"state_version" integer DEFAULT 0 NOT NULL,
	"active_player_id" text,
	"day_counter" integer DEFAULT 0 NOT NULL,
	"turn_deadline_at" timestamp with time zone,
	"state" jsonb,
	"winner_player_id" text,
	"completion_reason" "completion_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "matches_invitation_code_key" ON "matches" USING btree ("invitation_code");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_turn_deadline_at_idx" ON "matches" USING btree ("turn_deadline_at");--> statement-breakpoint
CREATE INDEX "matches_active_player_id_idx" ON "matches" USING btree ("active_player_id");