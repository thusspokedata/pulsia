CREATE TABLE "body_metric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric_type" text NOT NULL,
	"value" double precision NOT NULL,
	"measured_at" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "body_metric" ADD CONSTRAINT "body_metric_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_metric_user_type_time_idx" ON "body_metric" USING btree ("user_id","metric_type","measured_at");