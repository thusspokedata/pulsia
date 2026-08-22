import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getWorkObjective, upsertWorkObjective } from "../objective/repository";
import { getMemory } from "../memory/repository";
import { resolveAiKey } from "../ai/resolveKey";
import { settings, profiles, nutritionGoal } from "../db/schema";
import type { AppDeps } from "../app";

export function objectiveRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.get("/", async (c) => {
    return c.json({ content: await getWorkObjective(deps.db, c.get("userId")) });
  });

  r.put("/", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json().catch(() => ({}));
    if (typeof body?.content !== "string") return c.json({ error: "content debe ser un string." }, 400);
    await upsertWorkObjective(deps.db, userId, body.content);
    return c.json({ content: await getWorkObjective(deps.db, userId) });
  });

  r.post("/draft", async (c) => {
    const userId = c.get("userId");
    if (!deps.aiClient.draftWorkObjective) return c.json({ error: "Borrador de objetivo no disponible." }, 501);
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA configurada." }, 400);
    const model = row?.aiModel ?? deps.config.defaultModel;

    const profileRow = await deps.db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
    if (!profileRow?.data) return c.json({ error: "Completá tu perfil primero." }, 400);
    const goalRow = await deps.db.query.nutritionGoal.findFirst({ where: eq(nutritionGoal.userId, userId) });
    const memory = await getMemory(deps.db, userId);

    let content: string;
    try {
      content = await deps.aiClient.draftWorkObjective({
        profile: profileRow.data,
        memory,
        nutritionObjective: goalRow?.objective ?? "maintain",
        apiKey,
        model,
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    return c.json({ content });
  });

  return r;
}
