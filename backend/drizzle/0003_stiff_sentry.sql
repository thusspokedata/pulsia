ALTER TABLE "session_exercise" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD COLUMN "substituted_from_id" text;