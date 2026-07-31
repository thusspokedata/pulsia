import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  SupplementInputSchema, GeneratePlanInputSchema, PlanItemPatchSchema, TakeInputSchema,
  resolveDayChecklist, detectComponentOverlaps, supplementMicros, type Frequency, type TakeStatus, type AiPlanItem,
} from "@pulsia/shared";
import {
  insertSupplement, listSupplements, getSupplement,
  updateSupplement, deleteSupplement, setSupplementInfo, setSupplementMapping,
  createPlan, getActivePlan, getOwnedPlanItem, updatePlanItem, upsertTake,
  listTakesForDate, getAdjustmentItems, snapshotForTake, takesWithComponents, takesWithComponentsByDay,
} from "../supplements/repository";
import { resolveAiKey } from "../ai/resolveKey";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import type { AppDeps } from "../app";
import { epochToUtcDateStr } from "../lib/dateUtc";

// Valida el rango from/to (YYYY-MM-DD) de los endpoints de nutrientes por rango. Devuelve el rango
// normalizado o un mensaje de error (mismo criterio para range-nutrients y range-nutrients-daily).
function validateNutrientRange(
  from: string | undefined, to: string | undefined,
): { from: string; to: string } | { error: string } {
  if (!from || !to || !z.iso.date().safeParse(from).success || !z.iso.date().safeParse(to).success) {
    return { error: "Faltan from/to (YYYY-MM-DD)" };
  }
  if (from > to) return { error: "from no puede ser posterior a to" };
  const rangeDays = (new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86_400_000;
  if (rangeDays > 366) return { error: "El rango entre from y to no puede superar 366 días" };
  return { from, to };
}

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

  // Warnings de solapamiento de componentes persistentes (T4 review): antes solo se veían al
  // generar (respuesta de /plan/generate) y desaparecían al recargar. Se recalculan acá con el
  // catálogo actual para que sobrevivan al reload; fecha aproximada UTC (ver dateUtc.ts).
  r.get("/plan", async (c) => {
    const userId = c.get("userId");
    const plan = await getActivePlan(deps.db, userId);
    if (!plan) return c.json({ plan: null, warnings: [] });
    const catalog = await listSupplements(deps.db, userId);
    const warnings = detectComponentOverlaps(plan.items, catalog, epochToUtcDateStr(Date.now()));
    return c.json({ plan, warnings });
  });

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

  // --- Aporte cuantificado de micros de suplementos (día / rango) ---
  r.get("/day-nutrients", async (c) => {
    const date = c.req.query("date");
    if (!date || !z.iso.date().safeParse(date).success) return c.json({ error: "Falta date (YYYY-MM-DD)" }, 400);
    const takes = await takesWithComponents(deps.db, c.get("userId"), date);
    return c.json(supplementMicros(takes));
  });

  r.get("/range-nutrients", async (c) => {
    const range = validateNutrientRange(c.req.query("from"), c.req.query("to"));
    if ("error" in range) return c.json({ error: range.error }, 400);
    // Una sola tanda de queries (catálogo/plan items una vez, tomas del rango en una query), luego
    // se aplana y se agrega de una.
    const byDay = await takesWithComponentsByDay(deps.db, c.get("userId"), range.from, range.to);
    const all = [...byDay.values()].flat();
    return c.json(supplementMicros(all));
  });

  r.get("/range-nutrients-daily", async (c) => {
    const range = validateNutrientRange(c.req.query("from"), c.req.query("to"));
    if ("error" in range) return c.json({ error: range.error }, 400);
    const { from, to } = range;
    // SIN agregar: el aporte de cada día por separado (lo que el móvil necesita para el promedio
    // diario y la evolución por período). Una sola tanda de queries vía takesWithComponentsByDay.
    const byDay = await takesWithComponentsByDay(deps.db, c.get("userId"), from, to);
    const perDay: Record<string, ReturnType<typeof supplementMicros>> = {};
    for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const day = d.toISOString().slice(0, 10);
      perDay[day] = supplementMicros(byDay.get(day) ?? []);
    }
    return c.json({ perDay });
  });

  // Backfill: mapea con IA los suplementos del catálogo que todavía no tienen nutrientKey (alta previa
  // a T6/T7, o el mapeo automático del alta falló). Idempotente: solo procesa los pendientes.
  r.post("/backfill-micros", async (c) => {
    const userId = c.get("userId");
    if (!deps.aiClient.mapSupplementComponents) return c.json({ error: "El servidor no soporta el mapeo." }, 500);
    const apiKey = await apiKeyFor(deps, userId);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    const catalog = await listSupplements(deps.db, userId);
    // Solo los que NO están mapeados aún: idempotente. "Mapeado" = todos sus componentes tienen
    // nutrientKey definido (undefined = nunca se corrió; null = se corrió y no aplica).
    const pending = catalog.filter((s) => s.components.some((comp) => comp.nutrientKey === undefined));
    let mapped = 0;
    for (const s of pending) {
      try {
        const out = await deps.aiClient.mapSupplementComponents({
          name: s.name, servingLabel: s.servingLabel,
          components: s.components.map((comp) => ({ name: comp.name, amount: comp.amount, unit: comp.unit })), apiKey,
        });
        const ok = await setSupplementMapping(deps.db, userId, s.id, out);
        if (ok) mapped++;
      } catch (e) {
        console.warn("backfill-micros falló para", s.id, (e as Error).message);
      }
    }
    return c.json({ ok: true, mapped, pending: pending.length });
  });

  // Declarada AL FINAL (carry-over PR1 §c): después de /plan/*, /day, /takes y /extract para no capturarlos.
  r.get("/:id", async (c) => {
    if (!UuidSchema.safeParse(c.req.param("id")).success) return badId(c);
    const s = await getSupplement(deps.db, c.get("userId"), c.req.param("id"));
    return s ? c.json(s) : c.json({ error: "No encontrado" }, 404);
  });

  return r;
}
