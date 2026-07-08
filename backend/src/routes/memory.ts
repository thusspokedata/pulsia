import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getMemory } from "../memory/repository";
import { refreshAthleteMemory } from "../memory/service";
import { resolveAiKey } from "../ai/resolveKey";
import { settings } from "../db/schema";
import type { AppDeps } from "../app";

export function memoryRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/", async (c) => {
    return c.json({ content: await getMemory(deps.db, c.get("userId")) });
  });

  r.post("/refresh", async (c) => {
    const userId = c.get("userId");
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA configurada." }, 400);
    if (!deps.aiClient.updateMemory) return c.json({ error: "Actualización de memoria no disponible." }, 501);
    const model = row?.aiModel ?? deps.config.defaultModel;

    let updated: string;
    try {
      updated = await refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    return c.json({ content: updated });
  });

  return r;
}
