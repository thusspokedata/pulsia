import { Hono } from "hono";
import { z } from "zod";
import { settings } from "../db/schema";
import { encryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

const BodySchema = z.object({
  aiApiKey: z.string().min(1),
  aiModel: z.string().default("claude-sonnet-4-6"),
});

// userId fijo en v1 (single-user); se reemplaza por auth real más adelante.
export const SINGLE_USER_ID = "00000000-0000-0000-0000-000000000001";

export function settingsRoutes(deps: AppDeps) {
  const r = new Hono();

  r.post("/", async (c) => {
    const parsed = BodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const encrypted = encryptSecret(parsed.data.aiApiKey, deps.config.encryptionKey);
    await deps.db
      .insert(settings)
      .values({ userId: SINGLE_USER_ID, aiApiKeyEncrypted: encrypted, aiModel: parsed.data.aiModel })
      .onConflictDoUpdate({
        target: settings.userId,
        set: { aiApiKeyEncrypted: encrypted, aiModel: parsed.data.aiModel },
      });
    return c.json({ ok: true });
  });

  r.get("/", async (c) => {
    const row = await deps.db.query.settings.findFirst();
    return c.json({ hasApiKey: !!row?.aiApiKeyEncrypted, aiModel: row?.aiModel ?? deps.config.defaultModel });
  });

  return r;
}
