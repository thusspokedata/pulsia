ALTER TABLE "food" ADD COLUMN "added_sugars_g" real;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "sugar_class" text;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "added_sugars_g" real;--> statement-breakpoint
ALTER TABLE "meal_item" ADD COLUMN "sugar_class" text;--> statement-breakpoint
ALTER TABLE "usda_food" ADD COLUMN "added_sugars_g" real;