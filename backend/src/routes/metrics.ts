import { Hono } from "hono";
import { MetricReadingSchema, MetricTypeSchema } from "@pulsia/shared";
import { insertReading, getMetrics, getLatestMetrics, deleteMetric } from "../metrics/repository";
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

  r.delete("/:id", async (c) => {
    const ok = await deleteMetric(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrada" }, 404);
  });

  return r;
}
