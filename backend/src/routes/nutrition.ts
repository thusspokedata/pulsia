import { Hono } from "hono";
import { z } from "zod";
import { FoodInputSchema, FoodIdentificationSchema, MealInputSchema, WaterLogInputSchema, NutritionGoalInputSchema, ReportGenerateInputSchema, NUTRIENT_KEYS, type ReportKind, type FoodExtraction, type FoodIdentification, type FoodMicrosEstimate } from "@pulsia/shared";
import { searchUsda, getUsdaFood, type UsdaCandidate } from "../usda/matcher";
import { assembleFoodExtraction, assembleFoodWithAiMicros } from "../nutrition/assemble";
import {
  insertFood, listFoods, getFood, updateFood, updateFoodRow, deleteFood,
  createMeal, listMeals, updateMeal, deleteMeal, getMealById,
  insertWater, listWater, deleteWater,
  getGoalInput, upsertGoalInput,
  countMealsWithFood, resnapshotItemsOfFood,
  MealValidationError,
} from "../nutrition/repository";
import { identificationFromFood } from "../nutrition/refreshUsda";
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

// Re-mezcla manual: la identificación que ya se tenía + la fila de USDA que eligió el usuario.
const AssembleSchema = z.object({
  identification: FoodIdentificationSchema,
  fdcId: z.number().int(),
});

// Completar con IA: el usuario descartó USDA y quiere que la IA estime el bloque de micros.
const AiMicrosSchema = z.object({ identification: FoodIdentificationSchema });

// Completar con IA (alimento GUARDADO), paso 2: la propuesta ya aprobada por el usuario.
const AiApplySchema = z.object({ food: FoodInputSchema });

// El alimento existía cuando lo leímos, pero el UPDATE de la transacción ya no lo encontró: se
// borró en esa ventana. Se señala con un error tipado —el mismo idioma que `MealValidationError`
// en este archivo— en vez de devolver un resultado: además de mapearse a 404, tirar aborta la
// transacción, que es lo que corresponde cuando la premisa del apply dejó de ser cierta.
class AlimentoDesaparecidoError extends Error {}

function parseQueryNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

// La respuesta de extract/describe: la extracción persistible + los candidatos de USDA rankeados
// (para el "¿no es este?" del Plan 2). `candidates` va SIEMPRE (vacío si no hubo búsqueda o match).
// Cuál se eligió queda en `extraction.usdaFdcId`.
//
// `identification` es la identificación que usó ESTE handler, devuelta para que el móvil pueda
// re-mezclarla con otro candidato vía `POST /usda/assemble`. Sin ella el "¿no es este?" no existe:
// `searchQuery` (que el schema del assemble exige) NO es un campo de `FoodExtraction`, así que el
// formulario no tiene con qué reconstruirla — recibiría los candidatos y no podría elegir ninguno.
// En `describe` viaja la identificación YA forzada a `sourceMacros: "ai"`: mandar la original
// reintroduciría en la re-mezcla la mentira que el handler acaba de corregir.
type ExtractResponse = FoodExtraction & { candidates: UsdaCandidate[]; identification: FoodIdentification };

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
    return { ...assembleFoodExtraction(id, null), candidates: [], identification: id };
  }
  if (candidates.length === 0) return { ...assembleFoodExtraction(id, null), candidates: [], identification: id };

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
  if (chosenFdcId == null) return { ...assembleFoodExtraction(id, null), candidates, identification: id };

  let usda = null;
  try {
    usda = await getUsdaFood(deps.db, chosenFdcId);
  } catch (e) {
    console.warn("getUsdaFood falló; alta sin micros:", (e as Error).message);
    usda = null;
  }
  return { ...assembleFoodExtraction(id, usda), candidates, identification: id };
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

  // ---- Completar con IA (alta, no persiste) ----
  // El usuario descartó USDA: la IA estima el bloque de micros (conocimiento + web_search). Mismo
  // contrato que /usda/assemble: no escribe, devuelve el FoodExtraction para recargar el form.
  r.post("/foods/ai-micros", async (c) => {
    const userId = c.get("userId");
    const parsed = AiMicrosSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    if (!deps.aiClient.estimateFoodMicros) return c.json({ error: "El servidor no soporta estimación de micros." }, 500);
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    const id = parsed.data.identification;
    try {
      const micros = await deps.aiClient.estimateFoodMicros({ name: id.name, basis: id.basis, apiKey });
      return c.json(assembleFoodWithAiMicros(id, micros));
    } catch (e) {
      console.warn("estimateFoodMicros falló:", (e as Error).message);
      return c.json({ error: "No se pudo estimar la información nutricional. Reintentá." }, 502);
    }
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

  // ---- Re-mezcla manual: el usuario eligió OTRA fila de USDA ("¿no es este?") ----
  // Es la misma mezcla que hace el alta, pero con el fdcId que eligió el usuario en vez del que
  // eligió la IA. No persiste: devuelve la extracción para que el form recargue sus valores, y
  // recién el POST /foods la guarda.
  //
  // `identification` se revalida acá aunque el móvil la haya recibido del backend hace un minuto:
  // es input del cliente y llega por HTTP. Sin el schema, un `name` vacío o un `searchQuery`
  // perdido en el viaje se persistiría como un alimento sin rastro de dónde salió.
  //
  // A diferencia de extract/describe, acá un fdcId que no existe NO se degrada a "sin micros": el
  // usuario pidió ESA fila. Devolver 200 con todo en null parecería que la eligió y no tenía datos.
  r.post("/usda/assemble", async (c) => {
    const parsed = AssembleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    const fila = await getUsdaFood(deps.db, parsed.data.fdcId);
    if (!fila) return c.json({ error: "No encontrado" }, 404);
    return c.json(assembleFoodExtraction(parsed.data.identification, fila));
  });

  // ---- Una entrada puntual de USDA: resuelve fdcId → descripción ----
  // El alimento del catálogo persiste SOLO `usda_fdc_id`; la descripción vive en `usda_food`, que
  // es un catálogo compartido y no parte del alimento del usuario. Las pantallas que muestran el
  // nombre de la entrada (el detalle de UN alimento, el chip del alta) miran un alimento por vez,
  // así que una consulta puntual alcanza: el catálogo lista 50 alimentos pero NO muestra esta
  // descripción, y por eso no se paga un JOIN ni 50 strings en cada `GET /nutrition/foods`.
  //
  // Devuelve la identidad de la fila (fdcId, descripción, tipo) y NO sus 34 nutrientes: quien
  // quiera los valores está eligiendo otra fila, y para eso está `/usda/assemble`.
  //
  // Va DESPUÉS de `/usda/search` (hono resuelve por orden de registro): al revés, `:fdcId`
  // capturaría la palabra "search".
  r.get("/usda/:fdcId", async (c) => {
    const fdcId = Number(c.req.param("fdcId"));
    if (!Number.isInteger(fdcId)) return c.json({ error: "fdcId inválido" }, 400);
    const fila = await getUsdaFood(deps.db, fdcId);
    if (!fila) return c.json({ error: "No encontrado" }, 404);
    return c.json({ fdcId: fila.fdcId, description: fila.description, dataType: fila.dataType });
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

  // ---- Actualizar un alimento YA guardado contra USDA ----
  // Los alimentos cargados antes de la copia local de USDA no tienen vitaminas ni minerales. Esta
  // pareja de endpoints los rellena: primero se PROPONE (sin escribir nada) y recién con la
  // confirmación del usuario se APLICA (y se re-snapshotean sus comidas).

  // Paso 1: propuesta. NO escribe. Devuelve qué encontró, los candidatos para el "¿no es este?" y
  // cuántas comidas se van a tocar si se aplica.
  r.post("/foods/:id/usda-proposal", async (c) => {
    const userId = c.get("userId");
    const foodId = c.req.param("id");
    const f = await getFood(deps.db, userId, foodId);
    if (!f) return c.json({ error: "No encontrado" }, 404);

    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);

    const mealsAffected = await countMealsWithFood(deps.db, userId, foodId);

    // Toda la parte de IA + USDA va en un solo try/catch, igual que en `/foods/extract`: si la
    // frase de búsqueda, `searchUsda` o la elección fallan, se responde "no encontré nada" con el
    // alimento tal cual. El peor caso de esta feature es "no mejoró nada", NUNCA un 500.
    let searchQuery = f.name;
    let candidates: UsdaCandidate[] = [];
    let chosen: number | null = null;
    let usdaRow = null;
    try {
      searchQuery = deps.aiClient.usdaSearchQuery
        ? await deps.aiClient.usdaSearchQuery({ foodName: f.name, apiKey })
        : f.name;
      candidates = await searchUsda(deps.db, searchQuery);
      if (candidates.length > 0 && deps.aiClient.pickUsdaCandidate) {
        chosen = await deps.aiClient.pickUsdaCandidate({ foodName: f.name, candidates, apiKey });
      }
      if (chosen != null) usdaRow = await getUsdaFood(deps.db, chosen);
      if (usdaRow == null) chosen = null; // fdcId elegido que ya no existe: es "sin match", no un match roto
    } catch (e) {
      console.warn("propuesta de USDA falló; se degrada a 'sin match':", (e as Error).message);
      chosen = null;
      usdaRow = null;
    }

    const identification = identificationFromFood(f, searchQuery);
    return c.json({
      identification,
      candidates,
      chosen,
      proposal: assembleFoodExtraction(identification, usdaRow),
      mealsAffected,
    });
  });

  // Paso 2: aplicar. Guarda el alimento y re-snapshotea sus ítems de comida, en UNA transacción.
  //
  // El body trae la `identification` que devolvió la propuesta (se valida: es input del cliente y
  // llega por HTTP), pero los valores que se persisten NO salen de ahí: se re-arma la
  // identificación desde el alimento GUARDADO. Una propuesta adulterada en el viaje —kcal
  // absurdas, un `sourceMacros` cambiado para que los números del cliente ganen la mezcla— no
  // llega a la base. Del body solo manda el `fdcId`: qué fila de USDA usar es justamente lo que
  // el usuario elige con el "¿no es este?".
  r.post("/foods/:id/usda-apply", async (c) => {
    const userId = c.get("userId");
    const foodId = c.req.param("id");
    const parsed = AssembleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);

    const f = await getFood(deps.db, userId, foodId);
    if (!f) return c.json({ error: "No encontrado" }, 404);
    const usdaRow = await getUsdaFood(deps.db, parsed.data.fdcId);
    if (!usdaRow) return c.json({ error: "No encontrado" }, 404);

    const final = assembleFoodExtraction(identificationFromFood(f, parsed.data.identification.searchQuery), usdaRow);
    // `assembleFoodExtraction` devuelve el `sourceMacros` de la identificación, donde `manual` ya
    // viajó como `label` para que los macros tipeados a mano ganen la mezcla. Eso es la REGLA, no
    // la procedencia: se restaura la del alimento para no convertir un dato escrito por el usuario
    // en un dato "de etiqueta" que él nunca leyó.
    const paraGuardar = { ...final, sourceMacros: f.sourceMacros };

    // Ojo con el `{ mealsUpdated: 0, itemsUpdated: 0 }`: es la respuesta LEGÍTIMA de un alimento
    // del catálogo que nunca se comió. Por eso "el alimento ya no está" NO puede contestar eso
    // —serían indistinguibles para el cliente, que trata el 200 como "se aplicó" y lo recarga—.
    try {
      return c.json(await deps.db.transaction(async (tx) => {
        const fila = await updateFoodRow(tx, userId, foodId, paraGuardar);
        if (!fila) throw new AlimentoDesaparecidoError();
        return resnapshotItemsOfFood(tx, userId, foodId, fila);
      }));
    } catch (e) {
      if (e instanceof AlimentoDesaparecidoError) return c.json({ error: "No encontrado" }, 404);
      throw e; // cualquier otra falla sigue siendo un 500, como antes
    }
  });

  // ---- Completar con IA (alimento guardado): propuesta + aplicar ----
  // Paso 1: propuesta. Estima los micros del alimento GUARDADO. NO escribe. Devuelve la propuesta y
  // cuántas comidas se tocarían al aplicar (mismo aviso que usda-proposal).
  r.post("/foods/:id/ai-micros-proposal", async (c) => {
    const userId = c.get("userId");
    const foodId = c.req.param("id");
    const f = await getFood(deps.db, userId, foodId);
    if (!f) return c.json({ error: "No encontrado" }, 404);
    if (!deps.aiClient.estimateFoodMicros) return c.json({ error: "El servidor no soporta estimación de micros." }, 500);
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA disponible." }, 400);
    const mealsAffected = await countMealsWithFood(deps.db, userId, foodId);
    // searchQuery no se usa en este camino (no hay USDA); el nombre alcanza para identificationFromFood.
    const identification = identificationFromFood(f, f.name);
    try {
      const micros = await deps.aiClient.estimateFoodMicros({ name: f.name, basis: f.basis, apiKey });
      return c.json({ identification, proposal: assembleFoodWithAiMicros(identification, micros), mealsAffected });
    } catch (e) {
      console.warn("ai-micros-proposal falló:", (e as Error).message);
      return c.json({ error: "No se pudo estimar la información nutricional. Reintentá." }, 502);
    }
  });

  // Paso 2: aplicar. Esta ruta APLICA MICROS, no edita el alimento entero: la identidad (nombre,
  // basis, unitWeightG) y los macros salen del alimento GUARDADO (`f`), y del body se toman SOLO los
  // 30 valores de micronutrientes de la propuesta aprobada (el estimado de IA no es determinístico,
  // así que no se puede re-derivar server-side como el de USDA). Se re-usa `assembleFoodWithAiMicros`
  // —la misma mezcla que la propuesta— sobre la identificación reconstruida desde `f`, así un body
  // viejo/adulterado no puede pisar nombre/macros ni marcar el bloque como USDA. Se restaura el
  // `sourceMacros` real del alimento (identificationFromFood mapea "manual"→"label"). Re-snapshotea.
  r.post("/foods/:id/ai-micros-apply", async (c) => {
    const userId = c.get("userId");
    const foodId = c.req.param("id");
    const parsed = AiApplySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Body inválido", detail: parsed.error.issues }, 400);
    const f = await getFood(deps.db, userId, foodId);
    if (!f) return c.json({ error: "No encontrado" }, 404);
    const bodyRec = parsed.data.food as unknown as Record<string, number | null | undefined>;
    const micros: FoodMicrosEstimate = {};
    for (const k of NUTRIENT_KEYS) (micros as Record<string, number | null>)[k] = bodyRec[k] ?? null;
    const final = assembleFoodWithAiMicros(identificationFromFood(f, f.name), micros);
    const paraGuardar = { ...final, sourceMacros: f.sourceMacros };
    try {
      return c.json(await deps.db.transaction(async (tx) => {
        const fila = await updateFoodRow(tx, userId, foodId, paraGuardar);
        if (!fila) throw new AlimentoDesaparecidoError();
        return resnapshotItemsOfFood(tx, userId, foodId, fila);
      }));
    } catch (e) {
      if (e instanceof AlimentoDesaparecidoError) return c.json({ error: "No encontrado" }, 404);
      throw e;
    }
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
