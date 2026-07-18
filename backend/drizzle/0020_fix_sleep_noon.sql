-- Corrección puntual de datos: el import de sueño (#155) escribía a mediodía UTC mientras la carga
-- manual diaria escribe a mediodía LOCAL → dos filas del mismo dato por día (verificado en prod:
-- sleep_hours tenía filas a 10:00 y a 12:00 UTC el mismo día).
-- Acotada al owner: es el ÚNICO usuario con filas a mediodía UTC exacto (209; la familia tiene 0).
-- Un mediodía local nunca cae en 12:00 UTC exacto (Berlín da 10:00/11:00; Argentina 15:00), así que
-- el filtro % 86400000 = 43200000 selecciona solo filas del import.
-- Se usa AT TIME ZONE 'Europe/Berlin' (no un offset fijo) para que el DST se resuelva por fecha.

-- 1) Las que colisionarían con una fila ya existente en el destino se borran: gana lo manual,
--    misma política que el ON CONFLICT DO NOTHING del importador.
DELETE FROM body_metric b
WHERE b.user_id = 'dae98d70-dc82-4321-83cb-d020bf83beb3'
  AND b.measured_at % 86400000 = 43200000
  AND b.metric_type IN ('sleep_score','body_battery','pulse_ox','respiration','hrv','sleep_need_hours','sleep_hours','resting_hr')
  AND EXISTS (
    SELECT 1 FROM body_metric o
    WHERE o.user_id = b.user_id
      AND o.metric_type = b.metric_type
      AND o.measured_at = (EXTRACT(EPOCH FROM (
            (date_trunc('day', to_timestamp(b.measured_at/1000.0) AT TIME ZONE 'UTC') + interval '12 hours')
            AT TIME ZONE 'Europe/Berlin')) * 1000)::bigint
  );
--> statement-breakpoint
-- 2) El resto se mueve al mediodía local.
UPDATE body_metric b
SET measured_at = (EXTRACT(EPOCH FROM (
      (date_trunc('day', to_timestamp(b.measured_at/1000.0) AT TIME ZONE 'UTC') + interval '12 hours')
      AT TIME ZONE 'Europe/Berlin')) * 1000)::bigint
WHERE b.user_id = 'dae98d70-dc82-4321-83cb-d020bf83beb3'
  AND b.measured_at % 86400000 = 43200000
  AND b.metric_type IN ('sleep_score','body_battery','pulse_ox','respiration','hrv','sleep_need_hours','sleep_hours','resting_hr');
