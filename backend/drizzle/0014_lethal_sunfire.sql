CREATE TABLE "nutrition_goal" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"objective" text NOT NULL,
	"rate_kg_per_week" real NOT NULL,
	"manual_kcal" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nutrition_goal" ADD CONSTRAINT "nutrition_goal_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;