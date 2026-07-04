import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getMemory, upsertMemory } from "../memory/repository";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { decryptSecret } from "../crypto/secrets";
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
    if (!row?.aiApiKeyEncrypted) return c.json({ error: "No hay API key de IA configurada." }, 400);
    if (!deps.aiClient.updateMemory) return c.json({ error: "Actualización de memoria no disponible." }, 501);
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
    const model = row.aiModel ?? deps.config.defaultModel;

    const current = await getMemory(deps.db, userId);
    const recent = await getRecentSessions(deps.db, userId, 6);
    const historySummary = buildTrainingHistorySummary(recent);
    let updated: string;
    try {
      updated = await deps.aiClient.updateMemory({ current, historySummary, apiKey, model });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
    await upsertMemory(deps.db, userId, updated);
    return c.json({ content: updated });
  });

  return r;
}
