import { Hono } from "hono";
import { z } from "zod";
import { insertEcg, getEcgById, listEcg, deleteEcg } from "../ecg/repository";
import { runEcgAnalysis } from "../ecg/analyze";
import { maybeDecryptPdf } from "../ecg/decryptPdf";
import { eq } from "drizzle-orm";
import { settings } from "../db/schema";
import { decryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

const UploadSchema = z.object({ pdfBase64: z.string().min(10) });

function toRecording(row: any) {
  const done = row.status === "done";
  return {
    id: row.id, status: row.status, createdAt: new Date(row.createdAt).getTime(),
    analysis: done ? { kardiaVerdict: row.kardiaVerdict, avgHeartRate: row.avgHr, recordedAt: row.recordedAt, interpretation: row.interpretation } : null,
    error: row.error ?? null,
  };
}

export function ecgRoutes(deps: AppDeps) {
  const r = new Hono<{ Variables: { userId: string } }>();

  r.post("/", async (c) => {
    const userId = c.get("userId");
    const parsed = UploadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues }, 400);
    if (parsed.data.pdfBase64.length > 14_000_000) return c.json({ error: "PDF demasiado grande (máx 10 MB)" }, 400);
    const pdf = Buffer.from(parsed.data.pdfBase64, "base64");
    if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF")) return c.json({ error: "No parece un PDF" }, 400);
    if (pdf.length > 10 * 1024 * 1024) return c.json({ error: "PDF demasiado grande (máx 10 MB)" }, 400);
    const row = await insertEcg(deps.db, userId, pdf, "application/pdf");
    void runEcgAnalysis(deps, row.id, userId);
    return c.json({ id: row.id, status: "pending" });
  });

  r.get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await listEcg(deps.db, userId);
    return c.json({ recordings: rows.map(toRecording) });
  });

  r.get("/:id", async (c) => {
    const userId = c.get("userId");
    const row = await getEcgById(deps.db, c.req.param("id"));
    if (!row) return c.json({ error: "no existe" }, 404);
    if (row.userId !== userId) return c.json({ error: "de otro usuario" }, 409);
    return c.json(toRecording(row));
  });

  r.get("/:id/pdf", async (c) => {
    const userId = c.get("userId");
    const row = await getEcgById(deps.db, c.req.param("id"));
    if (!row) return c.json({ error: "no existe" }, 404);
    if (row.userId !== userId) return c.json({ error: "de otro usuario" }, 409);
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const password = settingsRow?.kardiaPwEncrypted ? decryptSecret(settingsRow.kardiaPwEncrypted, deps.config.encryptionKey) : undefined;
    let pdf: Buffer;
    try {
      pdf = await maybeDecryptPdf(row.pdf as Buffer, password);
    } catch {
      return c.json({ error: "El PDF está protegido; guardá tu contraseña de Kardia en Configuración." }, 422);
    }
    return c.body(new Uint8Array(pdf), 200, { "content-type": "application/pdf" });
  });

  r.delete("/:id", async (c) => {
    const userId = c.get("userId");
    const row = await getEcgById(deps.db, c.req.param("id"));
    if (!row) return c.json({ error: "no existe" }, 404);
    if (row.userId !== userId) return c.json({ error: "de otro usuario" }, 409);
    await deleteEcg(deps.db, row.id);
    return c.json({ ok: true });
  });

  return r;
}
