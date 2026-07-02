import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { TrainingProfileSchema } from "@pulsia/shared";
import { profiles } from "../db/schema";
import type { AppDeps } from "../app";

export function profileRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/", async (c) => {
    const userId = c.get("userId");
    const row = await deps.db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (!row) return c.json({ error: "Sin perfil" }, 404);
    return c.json(row.data);
  });

  r.put("/", async (c) => {
    const userId = c.get("userId");
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    await deps.db
      .insert(profiles)
      .values({ userId, data: parsed.data })
      .onConflictDoUpdate({ target: profiles.userId, set: { data: parsed.data } });
    return c.json({ ok: true });
  });

  return r;
}
