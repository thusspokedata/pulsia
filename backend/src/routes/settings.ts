import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { settings } from "../db/schema";
import { encryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

const BodySchema = z.object({
  aiApiKey: z.string().min(1).optional(),
  aiModel: z.string().default("claude-sonnet-4-6"),
  ecgEnabled: z.boolean().optional(),
  kardiaPdfPassword: z.string().optional(),
});

export function settingsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    const userId = c.get("userId");
    const parsed = BodySchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const { aiApiKey, aiModel, ecgEnabled, kardiaPdfPassword } = parsed.data;
    const key = deps.config.encryptionKey;

    // Sólo re-encriptar/persistir lo que vino: no pisar la key con vacío ni resetear campos ausentes.
    const aiApiKeyEncrypted = aiApiKey ? encryptSecret(aiApiKey, key) : undefined;
    const kardiaPwEncrypted = kardiaPdfPassword ? encryptSecret(kardiaPdfPassword, key) : undefined;

    const fields: Record<string, unknown> = { aiModel };
    if (aiApiKeyEncrypted !== undefined) fields.aiApiKeyEncrypted = aiApiKeyEncrypted;
    if (kardiaPwEncrypted !== undefined) fields.kardiaPwEncrypted = kardiaPwEncrypted;
    if (ecgEnabled !== undefined) fields.ecgEnabled = ecgEnabled;

    await deps.db
      .insert(settings)
      .values({ userId, ...fields })
      .onConflictDoUpdate({ target: settings.userId, set: fields });
    return c.json({ ok: true });
  });

  r.get("/", async (c) => {
    const userId = c.get("userId");
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    return c.json({
      hasApiKey: !!row?.aiApiKeyEncrypted,
      aiModel: row?.aiModel ?? deps.config.defaultModel,
      ecgEnabled: row?.ecgEnabled ?? false,
      hasKardiaPw: !!row?.kardiaPwEncrypted,
    });
  });

  return r;
}
