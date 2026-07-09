import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { OneOffRequestSchema, TrainingProfileSchema } from "@pulsia/shared";
import { programs, settings, generationJobs } from "../db/schema";
import { resolveAiKey } from "../ai/resolveKey";
import { generateProgramForProfile } from "../ai/generate";
import { getRecentSessions } from "../sessions/repository";
import { buildTrainingHistorySummary } from "../ai/history";
import { getMemory } from "../memory/repository";
import { refreshAthleteMemory } from "../memory/service";
import { runGenerationJob } from "../programs/generateJob";
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

    // Generar con la memoria YA guardada (rápido: una sola llamada a la IA). El refresh de memoria
    // —otra llamada a la IA— se hace en background DESPUÉS de responder: la generación tarda ~60s y
    // el cliente móvil (okhttp) / el NAT del celular cortan conexiones ociosas de >~60s (499), así que
    // el camino crítico debe ser una única llamada.
    const memory = await getMemory(deps.db, userId);

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

    // Refresh de memoria en background (best-effort, no bloquea la respuesta). Actualiza la memoria
    // del atleta para las PRÓXIMAS generaciones; si falla, no afecta esta respuesta.
    void refreshAthleteMemory(deps.db, deps.aiClient, userId, apiKey, model, { current: memory, historySummary })
      .catch((e) => console.warn("refresh de memoria (background) falló:", (e as Error).message));

    return c.json({ id: inserted[0].id, program });
  });

  r.post("/generate-async", async (c) => {
    const userId = c.get("userId");
    const parsed = TrainingProfileSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    const row = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const apiKey = resolveAiKey(row, deps.config);
    if (!apiKey) return c.json({ error: "No hay API key de IA configurada. Cargala en Configuración." }, 400);
    const model = row?.aiModel ?? deps.config.defaultModel;
    const [job] = await deps.db.insert(generationJobs).values({ userId, status: "pending" }).returning();
    // La generación corre DESPUÉS de responder (floating promise): la conexión con el cliente es corta.
    void runGenerationJob(deps, job.id, userId, parsed.data, apiKey, model);
    return c.json({ jobId: job.id });
  });

  r.get("/generate-async/:jobId", async (c) => {
    const userId = c.get("userId");
    const jobId = c.req.param("jobId");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(jobId)) return c.json({ error: "job no encontrado" }, 404);
    const job = await deps.db.query.generationJobs.findFirst({ where: and(eq(generationJobs.id, jobId), eq(generationJobs.userId, userId)) });
    if (!job) return c.json({ error: "job no encontrado" }, 404);
    // Stale-job fallback: un restart del server deja jobs 'pending' colgados (el floating promise se
    // pierde). Si el job es viejo (>10 min), lo auto-sanamos flipeándolo a 'error' al pollear.
    const STALE_MS = 10 * 60 * 1000;
    if (job.status === "pending" && Date.now() - new Date(job.createdAt).getTime() > STALE_MS) {
      const msg = "La generación expiró. Reintentá.";
      await deps.db.update(generationJobs).set({ status: "error", error: msg }).where(eq(generationJobs.id, jobId)).catch(() => {});
      return c.json({ status: "error", error: msg });
    }
    if (job.status === "done") {
      const prog = job.programId
        ? await deps.db.query.programs.findFirst({ where: and(eq(programs.id, job.programId), eq(programs.userId, userId)) })
        : null;
      if (!prog) return c.json({ status: "error", error: "El programa generado no está disponible." });
      return c.json({ status: "done", programId: job.programId, program: prog.data });
    }
    return c.json({ status: job.status, error: job.error ?? undefined });
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
