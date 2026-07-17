import { Hono } from "hono";
import { CardioActivitySchema } from "@pulsia/shared";
import { insertCardio, findCardioAtSecond, listCardio, getCardio, getCardioOwnerId, updateCardio, deleteCardio } from "../cardio/repository";

// Parsea un query param a número finito, o undefined si falta / no parsea. Sin este guard,
// Number("abc") = NaN y gte(startedAt, NaN) genera un filtro basura en vez de "sin filtro".
const finiteQuery = (v: string | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
import type { AppDeps } from "../app";

export function cardioRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "JSON inválido" }, 400); }
    const parsed = CardioActivitySchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const a = parsed.data;
    const userId = c.get("userId");

    // El server DERIVA kcalSource, no lo acepta del cliente: sin kcal no hay medición del reloj.
    // Mismo criterio que el source:"estimate" forzado en /foods/describe.
    const kcalSource = a.kcal != null && a.source === "fit" ? "device" : "estimate";

    // Pre-check por `id` (PK global generada en el cliente). Cubre el choque de id EXACTO, distinto
    // del dedupe-por-segundo (misma actividad reimportada con id nuevo) — los dos deben quedar.
    // Va PRIMERO: sin él, un re-POST por timeout de red o un id ajeno reventarían el PK con un 500.
    // Análogo a getSessionOwnerId en sessions.ts (lección del choque de constraint).
    const owner = await getCardioOwnerId(deps.db, a.id);
    if (owner && owner !== userId) return c.json({ error: "esa actividad pertenece a otro usuario" }, 409);
    // owner === userId: re-POST del mismo id por el mismo usuario (retry) → idempotente, sin reinsertar.
    if (owner === userId) return c.json({ id: a.id }, 200);

    // El dedupe aplica solo al import: reimportar el mismo .FIT (con id NUEVO) no debe crear dos
    // caminatas. La carga manual no lo chequea (dos actividades cortas seguidas son asunto del usuario).
    if (a.source === "fit") {
      const dup = await findCardioAtSecond(deps.db, userId, a.startedAt);
      if (dup) return c.json({ error: "Ya importaste esta actividad" }, 409);
    }
    await insertCardio(deps.db, userId, { ...a, kcalSource });
    return c.json({ id: a.id }, 200);
  });

  r.get("/", async (c) => {
    const from = finiteQuery(c.req.query("from"));
    const to = finiteQuery(c.req.query("to"));
    return c.json(await listCardio(deps.db, c.get("userId"), from, to));
  });

  // ⚠️ Cuando llegue POST /cardio/parse (fase 3), va declarado ANTES de /:id
  // o el param `:id` lo captura como si "parse" fuera un id.

  r.get("/:id", async (c) => {
    const id = c.req.param("id");
    const userId = c.get("userId");
    const a = await getCardio(deps.db, id, userId);
    if (a) return c.json(a);
    const owner = await getCardioOwnerId(deps.db, id);
    if (owner && owner !== userId) return c.json({ error: "esa actividad pertenece a otro usuario" }, 409);
    return c.json({ error: "actividad no encontrada" }, 404);
  });

  r.patch("/:id", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "JSON inválido" }, 400); }
    const PatchSchema = CardioActivitySchema.pick({ type: true, durationMs: true, distanceM: true, notes: true }).partial();
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const ok = await updateCardio(deps.db, c.req.param("id"), c.get("userId"), parsed.data);
    return ok ? c.json({ id: c.req.param("id") }) : c.json({ error: "actividad no encontrada" }, 404);
  });

  r.delete("/:id", async (c) => {
    const ok = await deleteCardio(deps.db, c.req.param("id"), c.get("userId"));
    return ok ? c.json({ id: c.req.param("id") }) : c.json({ error: "actividad no encontrada" }, 404);
  });

  return r;
}
