CREATE TABLE "athlete_memory" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_memory" ADD CONSTRAINT "athlete_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;