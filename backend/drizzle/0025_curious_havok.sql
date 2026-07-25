ALTER TABLE "workout_session" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_session" ALTER COLUMN "week_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_session" ALTER COLUMN "day_label" DROP NOT NULL;