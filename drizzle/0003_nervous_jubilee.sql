CREATE TYPE "public"."notification_job_status" AS ENUM('pending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('match_invitation', 'turn_started', 'turn_reminder', 'turn_expired', 'match_completed');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"match_id" text NOT NULL,
	"committed_result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_match_id_key_pk" PRIMARY KEY("match_id","key")
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"status" "notification_job_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_player_id_match_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."match_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_jobs_status_scheduled_at_idx" ON "notification_jobs" USING btree ("status","scheduled_at");