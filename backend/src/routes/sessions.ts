import { Hono } from "hono";
import { WorkoutSessionSchema } from "@pulsia/shared";
import { SINGLE_USER_ID } from "../constants";
import { upsertSession, getSession, listSessions } from "../sessions/repository";
import type { AppDeps } from "../app";

export function sessionsRoutes(deps: AppDeps) {
  const r = new Hono();

  r.put("/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = WorkoutSessionSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    if (parsed.data.id !== id) return c.json({ error: "el id de la URL no coincide con el del body" }, 400);
    await upsertSession(deps.db, SINGLE_USER_ID, parsed.data);
    return c.json({ id }, 200);
  });

  r.get("/:id", async (c) => {
    const session = await getSession(deps.db, c.req.param("id"));
    if (!session) return c.json({ error: "sesión no encontrada" }, 404);
    return c.json(session);
  });

  r.get("/", async (c) => c.json(await listSessions(deps.db, SINGLE_USER_ID)));

  return r;
}
