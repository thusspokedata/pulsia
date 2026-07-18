-- Deduplica (user_id, metric_type, measured_at) quedándose con la fila MÁS NUEVA del grupo.
-- Recargar el mismo día es el flujo de corrección: el formulario de actividad diaria guarda con
-- `measured_at` = mediodía local (un instante fijo por día), así que volver a guardar produce
-- otra fila con el mismo `measured_at` pero el valor corregido. La fila más reciente es la buena;
-- quedarse con la más vieja descartaría las correcciones del usuario.
DELETE FROM "body_metric" WHERE "id" IN (
	SELECT "id" FROM (
		SELECT "id", row_number() OVER (
			PARTITION BY "user_id", "metric_type", "measured_at"
			ORDER BY "created_at" DESC, "id" DESC
		) AS rn
		FROM "body_metric"
	) t WHERE t.rn > 1
);
--> statement-breakpoint
DROP INDEX IF EXISTS "body_metric_user_type_time_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "body_metric_user_type_time_unique_idx" ON "body_metric" USING btree ("user_id","metric_type","measured_at");
