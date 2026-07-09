import { Hono } from "hono";
import { WorkoutSessionSchema } from "@pulsia/shared";
import { upsertSession, getSession, listSessions, deleteSession, getRecentSessions } from "../sessions/repository";
import { lastWeightByExercise } from "../sessions/lastWeight";
import type { AppDeps } from "../app";

export function sessionsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

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
    await upsertSession(deps.db, c.get("userId"), parsed.data);
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
