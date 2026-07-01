import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { settings } from "../db/schema";
import { encryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

const BodySchema = z.object({
  aiApiKey: z.string().min(1),
  aiModel: z.string().default("claude-sonnet-4-6"),
});

export function settingsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    const userId = c.get("userId");
    const parsed = BodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const encrypted = encryptSecret(parsed.data.aiApiKey, deps.config.encryptionKey);
    await deps.db
      .insert(settings)
      .values({ userId, aiApiKeyEncrypted: encrypted, aiModel: parsed.data.aiModel })
      .onConflictDoUpdate({
        target: settings.userId,
        set: { aiApiKeyEncrypted: encrypted, aiModel: parsed.data.aiModel },
      });
    return c.json({ ok: true });
  });

  r.get("/", async (c) => {
    const userId = c.get("userId");
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    return c.json({ hasApiKey: !!row?.aiApiKeyEncrypted, aiModel: row?.aiModel ?? deps.config.defaultModel });
  });

  return r;
}
