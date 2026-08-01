import { Hono } from "hono";
import { z } from "zod";
import { Decoder, Stream } from "@garmin/fitsdk";
import { WorkoutSessionSchema } from "@pulsia/shared";
import { upsertSession, getSession, listSessions, deleteSession, getRecentSessions, getSessionOwnerId, findSessionAtSecond } from "../sessions/repository";
import { lastWeightByExercise } from "../sessions/lastWeight";
import { parseFitStrength } from "../cardio/parseFitStrength";
import { catalogIdForFit } from "../cardio/fitExerciseMap";
import { fitStrengthToSession } from "../cardio/fitStrengthToSession";
import { extractHrSamples } from "../cardio/hrSamples";
import type { AppDeps } from "../app";

const MAX_FIT_B64 = 7_000_000; // ~5 MB, igual que /cardio/parse

// Decodifica un .FIT y exige que sea un entrenamiento de FUERZA. Lanza "not-strength" si no lo es,
// "no-fit" si el archivo no es válido. La ruta traduce cada caso a su status.
function decodeStrengthFit(fitBase64: string): { messages: any; startedAt: number } {
  const decoder = new Decoder(Stream.fromByteArray(Buffer.from(fitBase64, "base64")));
  if (!decoder.isFIT()) throw new Error("no-fit");
  const { messages } = decoder.read({
    includeUnknownData: true, applyScaleAndOffset: true, expandSubFields: true,
    convertTypesToStrings: true, convertDateTimesToDates: true,
  });
  const session = messages.sessionMesgs?.[0];
  if (session?.subSport !== "strengthTraining") throw new Error("not-strength");
  const startedAt = session.startTime instanceof Date ? session.startTime.getTime() : Number(session.startTime);
  return { messages, startedAt };
}

// El preview que ve el móvil: los ejercicios/series del parser + el catalogId resuelto server-side
// (el móvil no tiene el SDK ni el catálogo del lado del que se resuelve).
function strengthPreviewWithCatalog(messages: any) {
  const p = parseFitStrength(messages);
  return {
    ...p,
    exercises: p.exercises.map((ex) => ({
      ...ex,
      catalogId: catalogIdForFit(ex.category, ex.exerciseNameIndex),
    })),
  };
}

export function sessionsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  // Literales ANTES de /:id. Preview de un .FIT de fuerza (no persiste).
  r.post("/from-fit/preview", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.fitBase64 !== "string" || body.fitBase64.length > MAX_FIT_B64)
      return c.json({ error: "Archivo inválido" }, 400);
    try {
      const { messages } = decodeStrengthFit(body.fitBase64);
      return c.json(strengthPreviewWithCatalog(messages));
    } catch (e) {
      if ((e as Error).message === "not-strength")
        return c.json({ error: "El .FIT no es un entrenamiento de fuerza" }, 422);
      return c.json({ error: "No se pudo leer el .FIT" }, 400);
    }
  });

  // Persiste un .FIT de fuerza como workout_session. Idempotente por id (como PUT /sessions).
  r.post("/from-fit", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.fitBase64 !== "string" || body.fitBase64.length > MAX_FIT_B64)
      return c.json({ error: "Archivo inválido" }, 400);
    // El id se valida como UUID en el borde: un id malformado no debe llegar a la query de dueño
    // ni reportarse como un fallo genérico de import. Mismo contrato que WorkoutSessionSchema.id.
    if (!z.string().uuid().safeParse(body.id).success) return c.json({ error: "id inválido" }, 400);
    const location = body.location === "home" ? "home" : "gym";
    try {
      const { messages, startedAt } = decodeStrengthFit(body.fitBase64);
      const session = messages.sessionMesgs[0];
      const durationSec = typeof session.totalTimerTime === "number" ? session.totalTimerTime
        : typeof session.totalElapsedTime === "number" ? session.totalElapsedTime : null;
      const totalDurationMs = durationSec != null ? Math.round(durationSec * 1000) : null;
      const hrSamples = extractHrSamples(messages);
      const ws = fitStrengthToSession(parseFitStrength(messages), {
        id: body.id, startedAt,
        endedAt: totalDurationMs != null ? startedAt + totalDurationMs : null,
        totalDurationMs, location,
      }, hrSamples);
      // Misma guarda que PUT /sessions: un .FIT de un device buggy podría traer valores fuera de
      // rango (peso negativo, etc.) que hay que rechazar antes de persistir, no dejar entrar por
      // ser binario en vez de JSON. Mantiene consistentes los dos caminos de ingesta.
      const validated = WorkoutSessionSchema.safeParse(ws);
      if (!validated.success) return c.json({ error: "El .FIT produjo una sesión inválida" }, 400);
      const owner = await getSessionOwnerId(deps.db, body.id);
      if (owner && owner !== userId) return c.json({ error: "esa sesión pertenece a otro usuario" }, 409);
      // Dedupe del import (espeja /cardio): reimportar el MISMO .FIT de fuerza —la web genera un id
      // nuevo por subida, así que no choca por PK— no debe crear dos workout_session. Solo aplica a
      // un id genuinamente nuevo (owner == null); un re-POST del mismo id (owner === userId) sigue al
      // upsert idempotente, que se encontraría a sí mismo en ese segundo y daría un 409 falso.
      if (owner == null) {
        const dup = await findSessionAtSecond(deps.db, userId, startedAt);
        if (dup) return c.json({ error: "Ya importaste este entrenamiento" }, 409);
      }
      await upsertSession(deps.db, userId, validated.data);
      return c.json({ id: body.id }, 200);
    } catch (e) {
      if ((e as Error).message === "not-strength")
        return c.json({ error: "El .FIT no es un entrenamiento de fuerza" }, 422);
      return c.json({ error: "No se pudo importar el .FIT" }, 400);
    }
  });

  r.put("/:id", async (c) => {
    const id = c.req.param("id");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const parsed = WorkoutSessionSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    if (parsed.data.id !== id) return c.json({ error: "el id de la URL no coincide con el del body" }, 400);
    const userId = c.get("userId");
    // El id de sesión es PK global: si ya pertenece a otro usuario, rechazamos (evita un 500 por
    // choque de constraint y que un id ajeno se use como blanco).
    const owner = await getSessionOwnerId(deps.db, id);
    if (owner && owner !== userId) return c.json({ error: "esa sesión pertenece a otro usuario" }, 409);
    await upsertSession(deps.db, userId, parsed.data);
    return c.json({ id }, 200);
  });

  r.get("/last-weights", async (c) => {
    const recent = await getRecentSessions(deps.db, c.get("userId"), 20);
    return c.json(lastWeightByExercise(recent));
  });

  r.get("/:id", async (c) => {
    const session = await getSession(deps.db, c.req.param("id"), c.get("userId"));
    if (!session) return c.json({ error: "sesión no encontrada" }, 404);
    return c.json(session);
  });

  r.get("/", async (c) => c.json(await listSessions(deps.db, c.get("userId"))));

  r.delete("/:id", async (c) => {
    const ok = await deleteSession(deps.db, c.req.param("id"), c.get("userId"));
    return ok ? c.json({ id: c.req.param("id") }) : c.json({ error: "sesión no encontrada" }, 404);
  });

  return r;
}
