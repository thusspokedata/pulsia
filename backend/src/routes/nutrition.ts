import { Hono } from "hono";
import { z } from "zod";
import { FoodInputSchema, MealInputSchema, WaterLogInputSchema, NutritionGoalInputSchema, ReportGenerateInputSchema, type ReportKind } from "@pulsia/shared";
import {
  insertFood, listFoods, getFood, updateFood, deleteFood,
  createMeal, listMeals, updateMeal, deleteMeal, getMealById,
  insertWater, listWater, deleteWater,
  getGoalInput, upsertGoalInput,
  MealValidationError,
} from "../nutrition/repository";
import { resolveAiKey } from "../ai/resolveKey";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import { getReport, upsertReport, listReports } from "../reports/repository";
import { collectReportData, hasAnyData } from "../reports/collect";
import { getMemory, upsertMemory } from "../memory/repository";
import type { AppDeps } from "../app";

const ExtractSchema = z.object({
  imageBase64: z.string().min(10),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

function parseQueryNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

export function nutritionRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  // ---- Extracción por foto (sincrónica, no persiste) ----
  r.post("/foods/extract", async (c) => {
    const userId = c.get("userId");
    const parsed = ExtractSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    if (parsed.data.imageBase64.length > 14_000_000) return c.json({ error: "Imagen demasiado grande (máx 10 MB)" }, 400);
    if (!deps.aiClient.extractFood) return c.json({ error: "El servidor no soporta extracción de alimentos." }, 500);
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    try {
      const extraction = await deps.aiClient.extractFood({ imageBase64: parsed.data.imageBase64, mediaType: parsed.data.mediaType, apiKey });
      return c.json(extraction);
    } catch (e) {
      console.warn("extractFood falló:", (e as Error).message);
      return c.json({ error: "No se pudo analizar la foto. Reintentá o cargá el alimento a mano." }, 502);
    }
  });

  // ---- Foods (catálogo) ----
  r.post("/foods", async (c) => {
    const parsed = FoodInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Alimento inválido", detail: parsed.error.issues }, 400);
    return c.json(await insertFood(deps.db, c.get("userId"), parsed.data));
  });

  r.get("/foods", async (c) => {
    return c.json(await listFoods(deps.db, c.get("userId")));
  });

  r.get("/foods/:id", async (c) => {
    const f = await getFood(deps.db, c.get("userId"), c.req.param("id"));
    return f ? c.json(f) : c.json({ error: "No encontrado" }, 404);
  });

  r.patch("/foods/:id", async (c) => {
    const parsed = FoodInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Alimento inválido", detail: parsed.error.issues }, 400);
    const updated = await updateFood(deps.db, c.get("userId"), c.req.param("id"), parsed.data);
    return updated ? c.json(updated) : c.json({ error: "No encontrado" }, 404);
  });

  r.delete("/foods/:id", async (c) => {
    const ok = await deleteFood(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrado" }, 404);
  });

  // ---- Meals ----
  r.post("/meals", async (c) => {
    const parsed = MealInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Comida inválida", detail: parsed.error.issues }, 400);
    try {
      return c.json(await createMeal(deps.db, c.get("userId"), parsed.data));
    } catch (e) {
      // snapshotItems tira MealValidationError si un foodId no pertenece al usuario / unidad incoherente.
      if (e instanceof MealValidationError) return c.json({ error: e.message }, 409);
      console.warn("createMeal falló:", (e as Error).message);
      return c.json({ error: "No se pudo guardar la comida." }, 500);
    }
  });

  r.get("/meals", async (c) => {
    const from = parseQueryNumber(c.req.query("from"));
    const to = parseQueryNumber(c.req.query("to"));
    return c.json(await listMeals(deps.db, c.get("userId"), from, to));
  });

  r.get("/meals/:id", async (c) => {
    const m = await getMealById(deps.db, c.get("userId"), c.req.param("id"));
    return m ? c.json(m) : c.json({ error: "No encontrada" }, 404);
  });

  r.patch("/meals/:id", async (c) => {
    const parsed = MealInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Comida inválida", detail: parsed.error.issues }, 400);
    try {
      const updated = await updateMeal(deps.db, c.get("userId"), c.req.param("id"), parsed.data);
      return updated ? c.json(updated) : c.json({ error: "No encontrada" }, 404);
    } catch (e) {
      if (e instanceof MealValidationError) return c.json({ error: e.message }, 409);
      console.warn("updateMeal falló:", (e as Error).message);
      return c.json({ error: "No se pudo guardar la comida." }, 500);
    }
  });

  r.delete("/meals/:id", async (c) => {
    const ok = await deleteMeal(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrada" }, 404);
  });

  // ---- Water log (agua tomada) ----
  r.post("/water", async (c) => {
    const parsed = WaterLogInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Registro de agua inválido", detail: parsed.error.issues }, 400);
    return c.json(await insertWater(deps.db, c.get("userId"), parsed.data));
  });

  r.get("/water", async (c) => {
    const from = parseQueryNumber(c.req.query("from"));
    const to = parseQueryNumber(c.req.query("to"));
    return c.json(await listWater(deps.db, c.get("userId"), from, to));
  });

  r.delete("/water/:id", async (c) => {
    const ok = await deleteWater(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrado" }, 404);
  });

  // ---- Objetivo nutricional (metas) ----
  r.get("/goal", async (c) => {
    return c.json(await getGoalInput(deps.db, c.get("userId")));
  });

  r.put("/goal", async (c) => {
    const parsed = NutritionGoalInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Objetivo inválido", detail: parsed.error.issues }, 400);
    return c.json(await upsertGoalInput(deps.db, c.get("userId"), parsed.data));
  });

  // ---- Informes del agente (#4) ----
  const NO_DATA = "No registraste datos en este período. Cargá tus comidas, agua o entrenamientos y volvé a generar el informe.";

  r.post("/reports/generate", async (c) => {
    const userId = c.get("userId");
    const parsed = ReportGenerateInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Pedido inválido", detail: parsed.error.issues }, 400);
    const { kind, periodStart, periodEnd, athleteContext, force } = parsed.data;

    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    if (!settingsRow?.reportsEnabled) return c.json({ error: "Los informes están desactivados. Activalos en Configuración." }, 403);

    if (!force) {
      const existing = await getReport(deps.db, userId, kind, periodStart);
      if (existing) return c.json(existing);
    }

    const data = await collectReportData(deps.db, userId, periodStart, periodEnd, athleteContext);
    if (!hasAnyData(data)) {
      return c.json(await upsertReport(deps.db, userId, { kind, periodStart, periodEnd, content: NO_DATA }));
    }

    if (!deps.aiClient.generateReport) return c.json({ error: "El servidor no soporta la generación de informes." }, 500);
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);

    let output;
    try {
      output = await deps.aiClient.generateReport({ kind, data, apiKey });
    } catch (e) {
      console.warn("generateReport falló:", (e as Error).message);
      return c.json({ error: "No se pudo generar el informe. Reintentá en un rato." }, 502);
    }

    const saved = await upsertReport(deps.db, userId, { kind, periodStart, periodEnd, content: output.content });

    // Memoria del atleta: anexar hasta 2 observaciones con la fecha del período.
    if (output.memoryNotes.length > 0) {
      const date = new Date(periodStart).toISOString().slice(0, 10);
      const current = await getMemory(deps.db, userId);
      const appended = output.memoryNotes.slice(0, 2).map((note) => `[${date}] ${note}`).join("\n");
      await upsertMemory(deps.db, userId, current ? `${current}\n${appended}` : appended);
    }
    return c.json(saved);
  });

  r.get("/reports", async (c) => {
    const kind = c.req.query("kind") as ReportKind | undefined;
    return c.json(await listReports(deps.db, c.get("userId"), kind, parseQueryNumber(c.req.query("from")), parseQueryNumber(c.req.query("to"))));
  });

  r.get("/reports/:kind/:periodStart", async (c) => {
    const rep = await getReport(deps.db, c.get("userId"), c.req.param("kind") as ReportKind, Number(c.req.param("periodStart")));
    return rep ? c.json(rep) : c.json({ error: "No encontrado" }, 404);
  });

  return r;
}
