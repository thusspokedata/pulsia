import { Hono } from "hono";
import { z } from "zod";
import { FoodInputSchema, MealInputSchema, WaterLogInputSchema, NutritionGoalInputSchema, ReportGenerateInputSchema, type ReportKind, type FoodExtraction, type FoodIdentification } from "@pulsia/shared";
import { searchUsda, getUsdaFood, type UsdaCandidate } from "../usda/matcher";
import { assembleFoodExtraction } from "../nutrition/assemble";
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
import { appendMemory } from "../memory/repository";
import { supplementsRoutes } from "./supplements";
import { getActivePlan, upsertAdjustment } from "../supplements/repository";
import { epochToUtcDateStr } from "../lib/dateUtc";
import type { AppDeps } from "../app";

const ExtractSchema = z.object({
  imageBase64: z.string().min(10),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const DescribeSchema = z.object({ text: z.string().trim().min(2).max(100) });

function parseQueryNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

// La respuesta de extract/describe: la extracción persistible + los candidatos de USDA rankeados
// (para el "¿no es este?" del Plan 2). `candidates` va SIEMPRE (vacío si no hubo búsqueda o match).
// Cuál se eligió queda en `extraction.usdaFdcId`.
type ExtractResponse = FoodExtraction & { candidates: UsdaCandidate[] };

/**
 * Toma la identificación de la 1ª llamada de IA y le adjunta los micros de USDA:
 *   1. searchUsda(searchQuery) → candidatos
 *   2. pickUsdaCandidate → elige uno (o null / "ninguno")
 *   3. getUsdaFood(fdcId) → la fila completa
 *   4. assembleFoodExtraction(id, usda) → mezcla
 *
 * Toda la parte de USDA (búsqueda + elección + fila) está en su propio try/catch, SEPARADO del de
 * la llamada de IA que identifica el alimento: si `usda_food` está vacía/rota o la 2ª llamada
 * falla, el alta NO se bloquea — cae a "sin match" (spec §7). Un alta sin vitaminas es
 * infinitamente mejor que un 500.
 */
async function attachUsdaMicros(deps: AppDeps, id: FoodIdentification, apiKey: string): Promise<ExtractResponse> {
  let candidates: UsdaCandidate[] = [];
  try {
    candidates = await searchUsda(deps.db, id.searchQuery);
  } catch (e) {
    // usda_food vacía o rota: degradar, no romper (spec §7).
    console.warn("searchUsda falló (usda_food vacía o rota); alta sin micros:", (e as Error).message);
    return { ...assembleFoodExtraction(id, null), candidates: [] };
  }
  if (candidates.length === 0) return { ...assembleFoodExtraction(id, null), candidates: [] };

  let chosenFdcId: number | null = null;
  try {
    chosenFdcId = deps.aiClient.pickUsdaCandidate
      ? await deps.aiClient.pickUsdaCandidate({ foodName: id.name, candidates, apiKey })
      : null;
  } catch (e) {
    // La 2ª llamada falló: se ofrecen los candidatos para elegir a mano (spec §7).
    console.warn("pickUsdaCandidate falló; se ofrecen candidatos para elegir a mano:", (e as Error).message);
    chosenFdcId = null;
  }
  if (chosenFdcId == null) return { ...assembleFoodExtraction(id, null), candidates };

  let usda = null;
  try {
    usda = await getUsdaFood(deps.db, chosenFdcId);
  } catch (e) {
    console.warn("getUsdaFood falló; alta sin micros:", (e as Error).message);
    usda = null;
  }
  return { ...assembleFoodExtraction(id, usda), candidates };
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
    let id: FoodIdentification;
    try {
      id = await deps.aiClient.extractFood({ imageBase64: parsed.data.imageBase64, mediaType: parsed.data.mediaType, apiKey });
    } catch (e) {
      console.warn("extractFood falló:", (e as Error).message);
      return c.json({ error: "No se pudo analizar la foto. Reintentá o cargá el alimento a mano." }, 502);
    }
    // Por foto sí puede haber etiqueta: se respeta el sourceMacros que devolvió la IA ("label"|"ai").
    return c.json(await attachUsdaMicros(deps, id, apiKey));
  });

  // ---- Alta por texto (sincrónica, no persiste) ----
  r.post("/foods/describe", async (c) => {
    const userId = c.get("userId");
    const parsed = DescribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    if (!deps.aiClient.describeFood) return c.json({ error: "El servidor no soporta descripción de alimentos." }, 500);
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    let id: FoodIdentification;
    try {
      id = await deps.aiClient.describeFood({ text: parsed.data.text, apiKey });
    } catch (e) {
      console.warn("describeFood falló:", (e as Error).message);
      return c.json({ error: "No se pudo analizar el alimento. Reintentá o cargalo a mano." }, 502);
    }
    // Por texto no hay etiqueta que leer: el dato es SIEMPRE una estimación. No se lo pedimos al
    // prompt y confiamos — se fuerza acá. Si el modelo contestara "label" porque cree saber la
    // etiqueta de una marca, el catálogo mentiría sobre la procedencia del dato.
    const idForced: FoodIdentification = { ...id, sourceMacros: "ai" };
    return c.json(await attachUsdaMicros(deps, idForced, apiKey));
  });

  // ---- Búsqueda manual en USDA (para el "¿no es este?" del Plan 2) ----
  // Query vacía → [] (la UI puede pedir sin término y recibir nada, en vez de un error). Si
  // usda_food está vacía/rota, también degrada a [] en vez de romper.
  r.get("/usda/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length === 0) return c.json([] as UsdaCandidate[]);
    try {
      return c.json(await searchUsda(deps.db, q));
    } catch (e) {
      console.warn("usda/search falló:", (e as Error).message);
      return c.json([] as UsdaCandidate[]);
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

    // Memoria del atleta: anexar hasta 2 observaciones con la fecha del período (append recorta desde
    // el frente si excede el cap → las notas nuevas no se pierden).
    if (output.memoryNotes.length > 0) {
      const date = epochToUtcDateStr(periodStart);
      const appended = output.memoryNotes.slice(0, 2).map((note) => `[${date}] ${note}`).join("\n");
      await appendMemory(deps.db, userId, appended);
    }

    // Ajuste de suplementos para MAÑANA — solo diario, con adjustmentForDate del móvil, y solo si
    // la IA devolvió algo. Sin plan activo → no hay nada que ajustar. supplementId fuera del plan
    // activo (alucinado o de un plan viejo) → se descarta (el móvil solo puede mostrar ajustes de
    // ítems que existen en el plan actual).
    if (kind === "daily" && !parsed.data.adjustmentForDate && output.supplementAdjustment.length > 0) {
      console.warn("ajuste de suplementos: el móvil no mandó adjustmentForDate, el ajuste de la IA se descarta");
    }
    if (kind === "daily" && parsed.data.adjustmentForDate && output.supplementAdjustment.length > 0) {
      const activePlan = await getActivePlan(deps.db, userId);
      if (activePlan) {
        const knownSupplementIds = new Set(activePlan.items.map((it) => it.supplementId));
        const inPlan = output.supplementAdjustment.filter((a) => knownSupplementIds.has(a.supplementId));
        const discarded = output.supplementAdjustment.length - inPlan.length;
        if (discarded > 0) console.warn(`ajuste de suplementos: ${discarded} ítem(s) con supplementId fuera del plan activo, descartados`);
        // Dedupe por supplementId (queda el PRIMERO): una IA que devuelva skip y reduce para el
        // mismo suplemento dejaría un ajuste contradictorio si persistieran ambos.
        const seen = new Set<string>();
        const filtered = inPlan.filter((a) => {
          if (seen.has(a.supplementId)) return false;
          seen.add(a.supplementId);
          return true;
        });
        if (filtered.length > 0) {
          await upsertAdjustment(deps.db, userId, parsed.data.adjustmentForDate, filtered, saved.id);
        }
      }
    }

    return c.json(saved);
  });

  r.get("/reports", async (c) => {
    const kind = c.req.query("kind") as ReportKind | undefined;
    return c.json(await listReports(deps.db, c.get("userId"), kind, parseQueryNumber(c.req.query("from")), parseQueryNumber(c.req.query("to"))));
  });

  r.get("/reports/:kind/:periodStart", async (c) => {
    const periodStart = Number(c.req.param("periodStart"));
    if (Number.isNaN(periodStart)) return c.json({ error: "periodStart inválido" }, 400);
    const rep = await getReport(deps.db, c.get("userId"), c.req.param("kind") as ReportKind, periodStart);
    return rep ? c.json(rep) : c.json({ error: "No encontrado" }, 404);
  });

  // ---- Suplementos (catálogo) — montado al final para no interferir con /foods/* ni /meals/* ----
  r.route("/supplements", supplementsRoutes(deps));

  return r;
}
