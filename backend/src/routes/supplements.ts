import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  SupplementInputSchema, GeneratePlanInputSchema, PlanItemPatchSchema, TakeInputSchema,
  resolveDayChecklist, detectComponentOverlaps, type Frequency, type TakeStatus, type AiPlanItem,
} from "@pulsia/shared";
import {
  insertSupplement, listSupplements, getSupplement,
  updateSupplement, deleteSupplement, setSupplementInfo,
  createPlan, getActivePlan, getOwnedPlanItem, updatePlanItem, upsertTake,
  listTakesForDate, getAdjustmentItems, snapshotForTake,
} from "../supplements/repository";
import { resolveAiKey } from "../ai/resolveKey";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import type { AppDeps } from "../app";

const ExtractSchema = z.object({
  imageBase64: z.string().min(10),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const UuidSchema = z.string().uuid();
function badId(c: Context<{ Variables: { userId: string } }>) {
  return c.json({ error: "Id inválido" }, 400);
}

async function apiKeyFor(deps: AppDeps, userId: string): Promise<string | null> {
  const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
  return resolveAiKey(settingsRow, deps.config);
}

export function supplementsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  // Extracción por foto (sincrónica, no persiste) — mismo contrato que /foods/extract.
  r.post("/extract", async (c) => {
    const userId = c.get("userId");
    const parsed = ExtractSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    if (parsed.data.imageBase64.length > 14_000_000) return c.json({ error: "Imagen demasiado grande (máx 10 MB)" }, 400);
    if (!deps.aiClient.extractSupplement) return c.json({ error: "El servidor no soporta extracción de suplementos." }, 500);
    const apiKey = await apiKeyFor(deps, userId);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    try {
      const extraction = await deps.aiClient.extractSupplement({
        imageBase64: parsed.data.imageBase64, mediaType: parsed.data.mediaType, apiKey,
      });
      return c.json(extraction);
    } catch (e) {
      console.warn("extractSupplement falló:", (e as Error).message);
      return c.json({ error: "No se pudo analizar la foto. Reintentá o cargá el suplemento a mano." }, 502);
    }
  });

  r.post("/", async (c) => {
    const parsed = SupplementInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Suplemento inválido", detail: parsed.error.issues }, 400);
    return c.json(await insertSupplement(deps.db, c.get("userId"), parsed.data));
  });

  r.get("/", async (c) => c.json(await listSupplements(deps.db, c.get("userId"))));

  // --- Plan ---
  r.post("/plan/generate", async (c) => {
    const userId = c.get("userId");
    const parsed = GeneratePlanInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    const catalog = await listSupplements(deps.db, userId);
    if (catalog.length === 0) return c.json({ error: "El catálogo está vacío: agregá suplementos primero." }, 422);
    if (!deps.aiClient.generateSupplementPlan) return c.json({ error: "El servidor no soporta generación de planes." }, 500);
    const apiKey = await apiKeyFor(deps, userId);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    let aiItems: AiPlanItem[];
    try {
      aiItems = await deps.aiClient.generateSupplementPlan({
        catalog, athleteContext: parsed.data.athleteContext, userNote: parsed.data.userNote ?? null, apiKey,
      });
    } catch (e) {
      console.warn("generateSupplementPlan falló:", (e as Error).message);
      return c.json({ error: "No se pudo generar el plan. Reintentá." }, 502);
    }
    const known = new Set(catalog.map((s) => s.id));
    const items = aiItems.filter((it) => known.has(it.supplementId)).map((it) => ({
      supplementId: it.supplementId, slot: it.slot, dose: it.dose, reason: it.reason,
      // la IA no ancla el "día por medio": se ancla al hoy del dispositivo
      frequency: (it.frequency.type === "every_other_day"
        ? { type: "every_other_day", anchorDate: parsed.data.date }
        : it.frequency) as Frequency,
    }));
    if (items.length === 0) return c.json({ error: "La IA no devolvió un plan utilizable. Reintentá." }, 422);
    // Fuera del try: un error de DB acá no debe reportarse como falla de la IA (502).
    const planView = await createPlan(deps.db, userId, parsed.data.userNote ?? null, items);
    // Chequeo runtime (no bloqueante): componentes activos que se solapan entre productos
    // distintos del plan recién creado — la IA puede repetir un componente sin saberlo.
    const warnings = detectComponentOverlaps(planView.items, catalog, parsed.data.date);
    for (const warning of warnings) console.warn("solapamiento de componentes en plan generado:", warning);
    return c.json({ plan: planView, warnings });
  });

  r.get("/plan", async (c) => c.json(await getActivePlan(deps.db, c.get("userId"))));

  r.patch("/plan/items/:id", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const parsed = PlanItemPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Patch inválido", detail: parsed.error.issues }, 400);
    const updated = await updatePlanItem(deps.db, c.get("userId"), c.req.param("id"), parsed.data);
    return updated ? c.json(updated) : c.json({ error: "No encontrado" }, 404);
  });

  // --- Checklist del día ---
  r.get("/day", async (c) => {
    const date = c.req.query("date");
    if (!date || !z.iso.date().safeParse(date).success) return c.json({ error: "Falta date (YYYY-MM-DD)" }, 400);
    const userId = c.get("userId");
    const plan = await getActivePlan(deps.db, userId);
    if (!plan) return c.json({ hasPlan: false, entries: [] });
    const [takes, adjustments] = await Promise.all([
      listTakesForDate(deps.db, userId, date),
      getAdjustmentItems(deps.db, userId, date),
    ]);
    const entries = resolveDayChecklist({
      planItems: plan.items,
      adjustments,
      takes: takes
        .filter((t) => t.planItemId != null)
        .map((t) => ({
          planItemId: t.planItemId as string,
          status: t.status as TakeStatus,
          actualDose: t.actualDose,
          note: t.note,
        })),
      date,
    });
    return c.json({ hasPlan: true, entries });
  });

  // --- Tomas ---
  r.put("/takes", async (c) => {
    const parsed = TakeInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Toma inválida", detail: parsed.error.issues }, 400);
    const item = await getOwnedPlanItem(deps.db, c.get("userId"), parsed.data.planItemId);
    if (!item) return c.json({ error: "Ítem de plan no encontrado" }, 404);
    await upsertTake(deps.db, c.get("userId"), parsed.data, snapshotForTake(item));
    return c.json({ ok: true });
  });

  r.patch("/:id", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const parsed = SupplementInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Suplemento inválido", detail: parsed.error.issues }, 400);
    const updated = await updateSupplement(deps.db, c.get("userId"), c.req.param("id"), parsed.data);
    return updated ? c.json(updated) : c.json({ error: "No encontrado" }, 404);
  });

  r.delete("/:id", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const ok = await deleteSupplement(deps.db, c.get("userId"), c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json({ error: "No encontrado" }, 404);
  });

  // Genera y guarda la explicación de componentes (altas manuales / regenerar tras editar).
  r.post("/:id/explain", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const userId = c.get("userId");
    const sup = await getSupplement(deps.db, userId, c.req.param("id"));
    if (!sup) return c.json({ error: "No encontrado" }, 404);
    if (!deps.aiClient.explainSupplement) return c.json({ error: "El servidor no soporta explicaciones." }, 500);
    const apiKey = await apiKeyFor(deps, userId);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    try {
      const info = await deps.aiClient.explainSupplement({
        supplement: { name: sup.name, servingLabel: sup.servingLabel, components: sup.components }, apiKey,
      });
      const updated = await setSupplementInfo(deps.db, userId, sup.id, info);
      return updated ? c.json(updated) : c.json({ error: "No encontrado" }, 404);
    } catch (e) {
      console.warn("explainSupplement falló:", (e as Error).message);
      return c.json({ error: "No se pudo generar la explicación. Reintentá." }, 502);
    }
  });

  // Declarada AL FINAL (carry-over PR1 §c): después de /plan/*, /day, /takes y /extract para no capturarlos.
  r.get("/:id", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const s = await getSupplement(deps.db, c.get("userId"), c.req.param("id"));
    return s ? c.json(s) : c.json({ error: "No encontrado" }, 404);
  });

  return r;
}
