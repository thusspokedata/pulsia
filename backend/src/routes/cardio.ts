import { Hono } from "hono";
import { z } from "zod";
import { createHash } from "node:crypto";
import { CardioActivitySchema } from "@pulsia/shared";
import { insertCardio, insertCardioFitFile, findCardioAtSecond, listCardio, getCardio, getCardioOwnerId, updateCardio, deleteCardio } from "../cardio/repository";
import { parseFit } from "../cardio/parseFit";
import type { AppDeps } from "../app";

// Parsea un query param a número finito, o undefined si falta / no parsea. Sin este guard,
// Number("abc") = NaN y gte(startedAt, NaN) genera un filtro basura en vez de "sin filtro".
const finiteQuery = (v: string | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const ParseFitSchema = z.object({ fitBase64: z.string().min(1) });
// Techo de 5 MB de archivo → ~6.9 MB de base64. Los .FIT típicos son 50-500 KB.
const MAX_FIT_B64 = 7_000_000;

// Magic bytes: el header FIT tiene ".FIT" en los bytes 8-11 (equivalente al %PDF del ECG).
// Compartido por /parse y por el guardado en POST /cardio: los dos reciben el MISMO campo
// `fitBase64`, así que el criterio de "esto es un .FIT" tiene que ser uno solo o se separan.
const looksLikeFit = (buf: Buffer): boolean =>
  buf.length >= 12 && buf.subarray(8, 12).toString("latin1") === ".FIT";

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

    // El .FIT crudo es opcional y solo aplica a imports (nunca a carga manual). Es un bonus: si
    // falla guardarlo, la actividad —ya insertada arriba— igual responde 200. `raw` (no `parsed.data`)
    // porque fitBase64 no es parte de CardioActivitySchema.
    const fitBase64 = a.source === "fit" ? (raw as { fitBase64?: unknown })?.fitBase64 : undefined;
    if (typeof fitBase64 === "string" && fitBase64.length > 0) {
      if (fitBase64.length > MAX_FIT_B64) {
        console.warn(`POST /cardio: .FIT de ${a.id} demasiado grande (${fitBase64.length} chars), no se guarda`);
      } else {
        try {
          const bytes = Buffer.from(fitBase64, "base64");
          // Mismo chequeo que /parse: no persistir bytes que no son un .FIT (guardar basura en
          // la tabla del archivo crudo arruinaría el reprocesamiento futuro). No es un error del
          // alta: la actividad ya está insertada y responde 200 igual.
          if (!looksLikeFit(bytes)) {
            console.warn(`POST /cardio: el fitBase64 de ${a.id} no es un .FIT, no se guarda`);
          } else {
            const sha256 = createHash("sha256").update(bytes).digest("hex");
            await insertCardioFitFile(deps.db, a.id, bytes, bytes.length, sha256);
          }
        } catch (e) {
          // La actividad es lo que importa; el archivo crudo es un bonus. Nunca tumbar el 200 por esto.
          console.error(`no se pudo guardar el .FIT crudo de ${a.id}:`, (e as Error).message);
        }
      }
    }

    return c.json({ id: a.id }, 200);
  });

  r.get("/", async (c) => {
    const from = finiteQuery(c.req.query("from"));
    const to = finiteQuery(c.req.query("to"));
    return c.json(await listCardio(deps.db, c.get("userId"), from, to));
  });

  // ⚠️ Literal ANTES de /:id, o el param `:id` captura "parse". Parsea un .FIT y devuelve el
  // preview SIN persistir (el archivo es solo transporte, no se guarda). Parseo = ms, sin runner async.
  r.post("/parse", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "JSON inválido" }, 400); }
    const parsed = ParseFitSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: "Falta el archivo .FIT" }, 400);
    if (parsed.data.fitBase64.length > MAX_FIT_B64) return c.json({ error: "El archivo es demasiado grande (máx 5 MB)" }, 400);
    const buf = Buffer.from(parsed.data.fitBase64, "base64");
    if (!looksLikeFit(buf)) return c.json({ error: "No parece un archivo .FIT" }, 400);
    try {
      return c.json(parseFit(buf));
    } catch (e) {
      // Nunca un 500 con stack: cualquier fallo del parser es culpa del archivo → 400 legible.
      return c.json({ error: (e as Error).message || "No se pudo leer el archivo .FIT" }, 400);
    }
  });

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
