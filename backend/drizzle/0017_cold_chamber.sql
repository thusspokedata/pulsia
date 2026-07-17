CREATE TABLE "cardio_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"started_at" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"distance_m" integer,
	"avg_hr" integer,
	"max_hr" integer,
	"elevation_gain_m" integer,
	"kcal" integer,
	"kcal_source" text NOT NULL,
	"source" text NOT NULL,
	"hr_series" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD CONSTRAINT "cardio_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cardio_activity_user_started_idx" ON "cardio_activity" USING btree ("user_id","started_at");