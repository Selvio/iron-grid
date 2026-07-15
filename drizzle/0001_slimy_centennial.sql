CREATE TYPE "public"."match_player_role" AS ENUM('host', 'guest');--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text,
	"role" "match_player_role" NOT NULL,
	"faction_id" text,
	"commander_id" text,
	"is_ready" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_players_match_faction_key" UNIQUE("match_id","faction_id"),
	CONSTRAINT "match_players_match_commander_key" UNIQUE("match_id","commander_id")
);
--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_players_user_id_idx" ON "match_players" USING btree ("user_id");