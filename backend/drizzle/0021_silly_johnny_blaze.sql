CREATE TABLE "cardio_fit_file" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "total_cycles" integer;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "training_load" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "training_effect_aerobic" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "training_effect_anaerobic" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "avg_cadence" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "max_cadence" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "avg_fractional_cadence" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "avg_respiration" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "max_respiration" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "min_respiration" double precision;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "metabolic_kcal" integer;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "sport_profile_name" text;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "tz_offset_minutes" integer;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "samples" jsonb;--> statement-breakpoint
ALTER TABLE "cardio_activity" ADD COLUMN "fit_extras" jsonb;--> statement-breakpoint
ALTER TABLE "cardio_fit_file" ADD CONSTRAINT "cardio_fit_file_activity_id_cardio_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."cardio_activity"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Un solo modelo hacia adelante: las actividades viejas pasan de hr_series {t,bpm}[] a samples columnar.
UPDATE cardio_activity
SET samples = jsonb_build_object(
      't',  (SELECT coalesce(jsonb_agg(e->'t'   ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(hr_series) WITH ORDINALITY AS a(e, ord)),
      'hr', (SELECT coalesce(jsonb_agg(e->'bpm' ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(hr_series) WITH ORDINALITY AS a(e, ord))
    )
WHERE hr_series IS NOT NULL
  AND jsonb_typeof(hr_series) = 'array'
  AND jsonb_array_length(hr_series) > 0
  AND samples IS NULL;