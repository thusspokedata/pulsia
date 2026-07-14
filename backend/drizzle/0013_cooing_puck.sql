CREATE TABLE "water_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ml" real NOT NULL,
	"logged_at" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "cholesterol_mg" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "water_ml" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "cholesterol_mg" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "water_ml" real;--> statement-breakpoint
ALTER TABLE "water_log" ADD CONSTRAINT "water_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "water_log_user_time_idx" ON "water_log" USING btree ("user_id","logged_at");