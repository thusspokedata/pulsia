import { Hono } from "hono";
import { TrainingProfileSchema } from "@pulsia/shared";
import { programs } from "../db/schema";
import { decryptSecret } from "../crypto/secrets";
import { generateProgramForProfile } from "../ai/generate";
import { SINGLE_USER_ID } from "../constants";
import type { AppDeps } from "../app";

export function programsRoutes(deps: AppDeps) {
  const r = new Hono();

  r.post("/generate", async (c) => {
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

    const row = await deps.db.query.settings.findFirst();
    if (!row?.aiApiKeyEncrypted) {
      return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    }
    const apiKey = decryptSecret(row.aiApiKeyEncrypted, deps.config.encryptionKey);
    const model = row.aiModel ?? deps.config.defaultModel;

    let program;
    try {
      program = await generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }

    const inserted = await deps.db
      .insert(programs)
      .values({ userId: SINGLE_USER_ID, name: program.name, data: program, profileSnapshot: parsed.data })
      .returning();

    return c.json({ id: inserted[0].id, program });
  });

  return r;
}
