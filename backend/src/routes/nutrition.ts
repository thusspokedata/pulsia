import { Hono } from "hono";
import { z } from "zod";
import { FoodInputSchema, MealInputSchema, WaterLogInputSchema, NutritionGoalInputSchema } from "@pulsia/shared";
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

  return r;
}
