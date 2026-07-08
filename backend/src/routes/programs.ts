import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { OneOffRequestSchema, TrainingProfileSchema } from "@pulsia/shared";
import { programs, settings } from "../db/schema";
import { resolveAiKey } from "../ai/resolveKey";
import { generateProgramForProfile } from "../ai/generate";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { getMemory } from "../memory/repository";
import { refreshAthleteMemory } from "../memory/service";
import type { AppDeps } from "../app";

export function programsRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/generate", async (c) => {
    const userId = c.get("userId");
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);

    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) {
      return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    }
    const model = row?.aiModel ?? deps.config.defaultModel;

    const recent = await getRecentSessions(deps.db, userId, 6);
    const historySummary = buildTrainingHistorySummary(recent);

    let memory = await getMemory(deps.db, userId);
    try {
      // Reusar `memory` y `historySummary` ya computados para evitar re-fetchear en el refresh.
      memory = await refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model, {
        current: memory,
        historySummary,
      });
    } catch (e) {
      // best-effort: si el refresh de memoria falla, seguimos con la memoria previa (no bloquea la generación)
      console.warn("refresh de memoria falló (best-effort):", (e as Error).message);
    }

    let program;
    try {
      program = await generateProgramForProfile({ profile: parsed.data, apiKey, model, ai: deps.aiClient, historySummary, memory });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }

    const inserted = await deps.db
      .insert(programs)
      .values({ userId, name: program.name, data: program, profileSnapshot: parsed.data })
      .returning();

    return c.json({ id: inserted[0].id, program });
  });

  r.post("/generate-oneoff", async (c) => {
    const userId = c.get("userId");
    const parsed = OneOffRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues }, 400);
    }
    const { profile: reqProfile, location, focus, notes } = parsed.data;
    const sessionMinutes = parsed.data.sessionMinutes ?? reqProfile.sessionMinutes;
    const equipment = parsed.data.equipment.length > 0
      ? parsed.data.equipment
      : (location === "home" ? reqProfile.homeEquipment : reqProfile.gymEquipment);

    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) {
      return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    }
    const model = row?.aiModel ?? deps.config.defaultModel;

    let program;
    try {
      program = await generateProgramForProfile({
        profile: reqProfile,
        apiKey,
        model,
        ai: deps.aiClient,
        oneOff: { location, focus, sessionMinutes, equipment, notes },
      });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }

    const inserted = await deps.db
      .insert(programs)
      .values({ userId, name: program.name, data: program, profileSnapshot: reqProfile })
      .returning();

    return c.json({ id: inserted[0].id, program });
  });

  return r;
}
