import { Hono } from "hono";
import { z } from "zod";
import { MetricReadingSchema, MetricTypeSchema, type MetricCsvPreview } from "@pulsia/shared";
import { insertReading, getMetrics, getLatestMetrics, deleteMetric, insertReadingsDedup } from "../metrics/repository";
import { parseSleepCsv } from "../metrics/parseSleepCsv";
import { parseWeightCsv } from "../metrics/parseWeightCsv";
import { parseStepsCsv } from "../metrics/parseStepsCsv";
import type { AppDeps } from "../app";

// Devuelve undefined si el query param está ausente o no es un número válido
// (evita que un valor no numérico se cuele como NaN hasta gte/lte).
function parseQueryNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export function metricsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    const parsed = MetricReadingSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Lectura inválida", detail: parsed.error.issues }, 400);
    const rows = await insertReading(deps.db, c.get("userId"), parsed.data);
    return c.json(rows);
  });

  r.get("/", async (c) => {
    const typeRaw = c.req.query("type");
    let type: import("@pulsia/shared").MetricType | undefined;
    if (typeRaw) {
      const t = MetricTypeSchema.safeParse(typeRaw);
      if (!t.success) return c.json({ error: "Tipo de métrica inválido" }, 400);
      type = t.data;
    }
    const from = parseQueryNumber(c.req.query("from"));
    const to = parseQueryNumber(c.req.query("to"));
    return c.json(await getMetrics(deps.db, c.get("userId"), { type, from, to }));
  });

  r.get("/latest", async (c) => {
    return c.json(await getLatestMetrics(deps.db, c.get("userId")));
  });

  const ImportCsvSchema = z.object({
    csvBase64: z.string().min(1),
    // Rango real de Date#getTimezoneOffset(): -840 (UTC+14, islas Line) a +720 (UTC-12).
    tzOffsetMinutes: z.number().int().min(-840).max(720).optional(),
  });
  // Tope: ~2.2 MB de CSV → base64 ~3 MB. Un export de sueño/peso/pasos típico son unos pocos KB.
  const MAX_CSV_B64 = 3_000_000;

  // Las 6 rutas de import (sleep/weight/steps × parse/persist) difieren solo en qué parser
  // usan y si escriben a la DB — este helper evita repetir el body-parsing y el manejo de
  // errores 6 veces. tzOffsetMinutes ausente (clientes viejos) default a 0 = mediodía UTC,
  // el comportamiento previo.
  function registerCsvImport(
    path: string,
    parser: (csv: string, offMin: number) => MetricCsvPreview,
    persist: boolean,
  ) {
    r.post(path, async (c) => {
      const parsed = ImportCsvSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "Falta el archivo CSV" }, 400);
      if (parsed.data.csvBase64.length > MAX_CSV_B64) return c.json({ error: "El archivo es demasiado grande" }, 400);
      const csv = Buffer.from(parsed.data.csvBase64, "base64").toString("utf8");
      const offMin = parsed.data.tzOffsetMinutes ?? 0;
      let preview: MetricCsvPreview;
      try {
        preview = parser(csv, offMin);
      } catch (e) {
        return c.json({ error: (e as Error).message || "No se pudo leer el CSV" }, 400);
      }
      if (!persist) return c.json(preview);
      const { imported, duplicates } = await insertReadingsDedup(deps.db, c.get("userId"), preview.rows);
      return c.json({ imported, duplicates, rows: preview.rows, skipped: preview.skipped });
    });
  }

  registerCsvImport("/import/sleep/parse", parseSleepCsv, false);
  registerCsvImport("/import/sleep", parseSleepCsv, true);
  registerCsvImport("/import/weight/parse", parseWeightCsv, false);
  registerCsvImport("/import/weight", parseWeightCsv, true);
  registerCsvImport("/import/steps/parse", parseStepsCsv, false);
  registerCsvImport("/import/steps", parseStepsCsv, true);

  r.delete("/:id", async (c) => {
    const ok = await deleteMetric(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrada" }, 404);
  });

  return r;
}
