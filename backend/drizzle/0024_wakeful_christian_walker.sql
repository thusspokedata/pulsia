CREATE TABLE "usda_dataset" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"row_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usda_food" (
	"fdc_id" integer PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"data_type" text NOT NULL,
	"kcal" real,
	"protein_g" real,
	"carbs_g" real,
	"fat_g" real,
	"saturated_fat_g" real,
	"omega3_g" real,
	"omega6_g" real,
	"cholesterol_mg" real,
	"sugars_g" real,
	"fiber_g" real,
	"water_ml" real,
	"vitamin_a_mcg" real,
	"vitamin_b1_mg" real,
	"vitamin_b2_mg" real,
	"vitamin_b3_mg" real,
	"vitamin_b5_mg" real,
	"vitamin_b6_mg" real,
	"vitamin_b7_mcg" real,
	"vitamin_b9_mcg" real,
	"vitamin_b12_mcg" real,
	"vitamin_c_mg" real,
	"vitamin_d_mcg" real,
	"vitamin_e_mg" real,
	"vitamin_k_mcg" real,
	"choline_mg" real,
	"calcium_mg" real,
	"iron_mg" real,
	"magnesium_mg" real,
	"iodine_mcg" real,
	"phosphorus_mg" real,
	"potassium_mg" real,
	"selenium_mcg" real,
	"sodium_mg" real,
	"zinc_mg" real
);
--> statement-breakpoint
-- Búsqueda difusa del matcher (Task 10): drizzle-kit no expresa gin_trgm_ops, se agrega a mano.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "usda_food_description_trgm_idx" ON "usda_food" USING gin ("description" gin_trgm_ops);
