CREATE TABLE "supplement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"serving_label" text NOT NULL,
	"components" jsonb NOT NULL,
	"label_max_per_day" text,
	"source" text NOT NULL,
	"info" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplement_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"for_date" text NOT NULL,
	"items" jsonb NOT NULL,
	"report_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplement_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"user_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplement_plan_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"supplement_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"frequency" jsonb NOT NULL,
	"dose" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "supplement_take" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"plan_item_id" uuid,
	"supplement_name" text NOT NULL,
	"planned_dose" text NOT NULL,
	"slot" text NOT NULL,
	"status" text NOT NULL,
	"actual_dose" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplement" ADD CONSTRAINT "supplement_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_adjustment" ADD CONSTRAINT "supplement_adjustment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_adjustment" ADD CONSTRAINT "supplement_adjustment_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_plan" ADD CONSTRAINT "supplement_plan_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_plan_id_supplement_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."supplement_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_plan_item" ADD CONSTRAINT "supplement_plan_item_supplement_id_supplement_id_fk" FOREIGN KEY ("supplement_id") REFERENCES "public"."supplement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_take" ADD CONSTRAINT "supplement_take_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_take" ADD CONSTRAINT "supplement_take_plan_item_id_supplement_plan_item_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."supplement_plan_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplement_user_idx" ON "supplement" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplement_adjustment_unique_idx" ON "supplement_adjustment" USING btree ("user_id","for_date");--> statement-breakpoint
CREATE INDEX "supplement_plan_user_idx" ON "supplement_plan" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supplement_plan_item_plan_idx" ON "supplement_plan_item" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplement_take_unique_idx" ON "supplement_take" USING btree ("user_id","date","plan_item_id");