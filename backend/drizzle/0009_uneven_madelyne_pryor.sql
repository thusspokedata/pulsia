CREATE TABLE "ecg_recording" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pdf" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL CONSTRAINT "ecg_status_check" CHECK ("status" IN ('pending','done','failed')),
	"kardia_verdict" text,
	"avg_hr" real,
	"recorded_at" text,
	"interpretation" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ecg_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "kardia_pw_encrypted" text;--> statement-breakpoint
ALTER TABLE "ecg_recording" ADD CONSTRAINT "ecg_recording_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;