DELETE FROM "body_metric" WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (
			PARTITION BY "user_id", "metric_type", "measured_at"
			ORDER BY "created_at" ASC, "id" ASC
		) AS rn
		FROM "body_metric"
	) t WHERE t.rn > 1
);
--> statement-breakpoint
DROP INDEX IF EXISTS "body_metric_user_type_time_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "body_metric_user_type_time_unique_idx" ON "body_metric" USING btree ("user_id","metric_type","measured_at");
