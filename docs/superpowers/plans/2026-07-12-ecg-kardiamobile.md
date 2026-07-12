# ECG (KardiaMobile 6L) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir PDFs de ECG del AliveCor KardiaMobile 6L, interpretarlos con IA (Opus 4.8, anclado al veredicto de Kardia, no-diagnóstico) con contexto longitudinal, guardarlos como historial y alimentar la generación + memoria del atleta. Toggle en Configuración (oculto por defecto).

**Architecture:** El PDF se sube en base64 (JSON), se guarda cifrado como `bytea`; un job async (floating promise, patrón `runGenerationJob`) lo descifra con `qpdf` si tiene contraseña y se lo manda a Claude Opus 4.8 como content block `document`. La fila `ecg_recording` ES el job (status pending→done/failed). `buildEcgSummary` (puro) da el contexto longitudinal a la interpretación, a la generación y a la memoria. Setting `ecgEnabled` por-usuario gatea la sección. Mobile usa `expo-document-picker` (nativo → APK vc9).

**Tech Stack:** `shared`/`backend` (TS, `bun test`), `mobile` (Expo/RN, jest `--runInBand`), Anthropic SDK (PDF document input, `claude-opus-4-8`), `qpdf` (descifrado PDF, en el Docker del backend). Rama `feat/ecg-kardiamobile` (spec commiteado). TDD, commits firmados `-S`.

**Entrega:** backend + shared deployan en el merge; mobile requiere **APK vc9** (file-picker nativo). Orden: shared → backend → mobile → build vc9.

---

## CAPA 1 — shared

### Task 1: Schemas de ECG (TDD)

**Files:**
- Create: `shared/src/schemas/ecg.ts`
- Modify: `shared/src/index.ts` (agregar `export * from "./schemas/ecg";`)
- Test: `shared/src/schemas/ecg.test.ts`

- [ ] **Step 1: Test que falla**
```ts
import { test, expect } from "bun:test";
import { EcgStatusSchema, EcgAnalysisSchema, EcgRecordingSchema } from "./ecg";

test("EcgAnalysisSchema parsea una interpretación válida", () => {
  const a = { kardiaVerdict: "Normal", avgHeartRate: 62, recordedAt: "2026-07-01", interpretation: "Lectura normal. No reemplaza a un médico." };
  expect(EcgAnalysisSchema.safeParse(a).success).toBe(true);
});
test("EcgAnalysisSchema tolera nullables", () => {
  const a = { kardiaVerdict: "Posible FA", avgHeartRate: null, recordedAt: null, interpretation: "..." };
  expect(EcgAnalysisSchema.safeParse(a).success).toBe(true);
});
test("EcgStatus enum", () => {
  expect(EcgStatusSchema.safeParse("pending").success).toBe(true);
  expect(EcgStatusSchema.safeParse("nope").success).toBe(false);
});
test("EcgRecordingSchema con analysis null (pending)", () => {
  const r = { id: "11111111-1111-4111-8111-111111111111", status: "pending", createdAt: 1, analysis: null, error: null };
  expect(EcgRecordingSchema.safeParse(r).success).toBe(true);
});
```

- [ ] **Step 2: Correr → falla**
Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/schemas/ecg.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `shared/src/schemas/ecg.ts`**
```ts
import { z } from "zod";

export const EcgStatusSchema = z.enum(["pending", "done", "failed"]);
export type EcgStatus = z.infer<typeof EcgStatusSchema>;

// Lo que la IA extrae + interpreta (output estructurado del tool de Anthropic).
export const EcgAnalysisSchema = z.object({
  kardiaVerdict: z.string(),
  avgHeartRate: z.number().nullable(),
  recordedAt: z.string().nullable(),
  interpretation: z.string(),
});
export type EcgAnalysis = z.infer<typeof EcgAnalysisSchema>;

// Fila devuelta por el backend (sin el PDF).
export const EcgRecordingSchema = z.object({
  id: z.string().uuid(),
  status: EcgStatusSchema,
  createdAt: z.number().int(),
  analysis: EcgAnalysisSchema.nullable(),
  error: z.string().nullable(),
});
export type EcgRecording = z.infer<typeof EcgRecordingSchema>;
```
Y en `shared/src/index.ts` agregar la línea de export.

- [ ] **Step 4: Correr → pasa** `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
- [ ] **Step 5: Commit** `git add shared/src/schemas/ecg.ts shared/src/schemas/ecg.test.ts shared/src/index.ts && git commit -S -m "feat(shared): schemas de ECG (status/analysis/recording)"`

---

## CAPA 2 — backend

### Task 2: DB schema — tabla `ecg_recording` + columnas de settings + migración

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create (generado): `backend/drizzle/0009_*.sql`

- [ ] **Step 1: Editar `backend/src/db/schema.ts`**
Agregar la tabla (cerca de `generationJobs`):
```ts
export const ecgRecording = pgTable("ecg_recording", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  pdf: customBytea("pdf").notNull(),      // ver nota abajo si no hay tipo bytea
  mime: text("mime").notNull(),
  status: text("status").notNull().default("pending"),
  kardiaVerdict: text("kardia_verdict"),
  avgHr: real("avg_hr"),
  recordedAt: text("recorded_at"),
  interpretation: text("interpretation"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```
Para `bytea`: drizzle-orm/pg-core no exporta `bytea` nativo — definir un custom type arriba del archivo (junto a los imports):
```ts
import { customType } from "drizzle-orm/pg-core";
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});
```
y usar `pdf: bytea("pdf").notNull()`. Asegurar que `real` esté importado de `drizzle-orm/pg-core` (ya se usa `text`, `uuid`, `timestamp`; agregar `real` si falta).
Agregar a la tabla `settings` dos columnas:
```ts
  ecgEnabled: boolean("ecg_enabled").notNull().default(false),
  kardiaPwEncrypted: text("kardia_pw_encrypted"),
```
(importar `boolean` de `drizzle-orm/pg-core` si falta).

- [ ] **Step 2: Generar la migración**
Run: `cd backend && bun run db:generate`
Expected: crea `backend/drizzle/0009_*.sql` con `CREATE TABLE ecg_recording` + `ALTER TABLE settings ADD COLUMN ecg_enabled` + `kardia_pw_encrypted`. Revisar el SQL generado (que el `bytea` y los defaults estén bien).

- [ ] **Step 3: Verificar typecheck** `cd backend && bunx tsc --noEmit`
- [ ] **Step 4: Commit** `git add backend/src/db/schema.ts backend/drizzle && git commit -S -m "feat(backend): tabla ecg_recording + settings.ecg_enabled/kardia_pw (migración 0009)"`

### Task 3: Helper de descifrado de PDF (`qpdf`) + Dockerfile (TDD)

**Files:**
- Create: `backend/src/ecg/decryptPdf.ts`
- Modify: `backend/Dockerfile`
- Test: `backend/src/ecg/decryptPdf.test.ts`

- [ ] **Step 1: Test que falla**
```ts
import { test, expect } from "bun:test";
import { isEncryptedPdf, maybeDecryptPdf } from "./decryptPdf";

test("isEncryptedPdf: PDF sin cifrar → false", () => {
  const plain = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
  expect(isEncryptedPdf(plain)).toBe(false);
});
test("maybeDecryptPdf: sin cifrar → devuelve el mismo buffer", async () => {
  const plain = Buffer.from("%PDF-1.4\nno-encrypt-here\n");
  const out = await maybeDecryptPdf(plain, undefined);
  expect(out.equals(plain)).toBe(true);
});
```
(Nota: un test real de descifrado necesita `qpdf` + un PDF cifrado de fixture; ese caso se cubre manualmente / con un fixture opcional. El test unitario cubre la detección y el passthrough.)

- [ ] **Step 2: Correr → falla** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ecg/decryptPdf.test.ts`

- [ ] **Step 3: Implementar `backend/src/ecg/decryptPdf.ts`**
```ts
// Detección simple: un PDF cifrado tiene un diccionario /Encrypt en el trailer.
export function isEncryptedPdf(pdf: Buffer): boolean {
  // Buscar "/Encrypt" en los primeros y últimos KB (el trailer suele estar al final).
  const s = pdf.toString("latin1");
  return s.includes("/Encrypt");
}

// Si el PDF está cifrado, lo desbloquea con qpdf usando `password`. Si no, lo devuelve tal cual.
// Throw con mensaje claro si está cifrado y no hay password / es incorrecta.
export async function maybeDecryptPdf(pdf: Buffer, password?: string | null): Promise<Buffer> {
  if (!isEncryptedPdf(pdf)) return pdf;
  if (!password) {
    throw new Error("El PDF está protegido con contraseña. Guardá tu contraseña de Kardia en Configuración.");
  }
  // qpdf --password=<pw> --decrypt - -   (stdin → stdout)
  const proc = Bun.spawn(["qpdf", `--password=${password}`, "--decrypt", "-", "-"], {
    stdin: pdf,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error("No se pudo descifrar el PDF (¿contraseña incorrecta?): " + err.slice(0, 200));
  }
  return Buffer.from(out);
}
```

- [ ] **Step 4: Agregar `qpdf` al `backend/Dockerfile`**
Después de `WORKDIR /app` y ANTES de `RUN chown -R bun:bun /app` / `USER bun`, insertar (como root):
```dockerfile
# qpdf para descifrar PDFs de ECG protegidos con contraseña.
RUN apt-get update && apt-get install -y --no-install-recommends qpdf && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 5: Correr → pasa** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ecg/decryptPdf.test.ts`
- [ ] **Step 6: Commit** `git add backend/src/ecg/decryptPdf.ts backend/src/ecg/decryptPdf.test.ts backend/Dockerfile && git commit -S -m "feat(backend): descifrado de PDF con qpdf (on-demand) + qpdf en el Docker"`

### Task 4: `AiClient.interpretEcg` (Opus 4.8, PDF a Claude) + prompt

**Files:**
- Create: `backend/src/ai/ecg.ts` (el prompt)
- Modify: `backend/src/ai/client.ts` (interfaz + implementación)
- Test: `backend/src/ai/ecg.test.ts` (el prompt es puro-ish; la llamada a la IA se testea con un fake AiClient en los tests de las rutas/runner)

- [ ] **Step 1: Crear el prompt `backend/src/ai/ecg.ts`**
```ts
export function buildEcgPrompt(historySummary?: string): string {
  return [
    "Sos un asistente de salud. Te paso el PDF de un ECG del dispositivo AliveCor KardiaMobile 6L.",
    "Tu tarea:",
    "1. EXTRAÉ el veredicto que el propio Kardia imprime en el reporte (campo `kardiaVerdict`) — p.ej. \"Normal\", \"Posible fibrilación auricular\", \"Bradicardia\", \"Taquicardia\", \"Sin clasificar\". Copiá el que figure.",
    "2. EXTRAÉ la frecuencia cardíaca media (`avgHeartRate`, número) y la fecha/hora del ECG (`recordedAt`) si figuran; si no, null.",
    "3. Escribí una `interpretation` en español, en lenguaje claro, que:",
    "   - Se APOYE en el veredicto de Kardia (su algoritmo está aprobado por la FDA). NO des un diagnóstico propio ni contradigas a Kardia.",
    "   - Explique qué significa ese veredicto en términos generales y qué implica para el entrenamiento.",
    ...(historySummary && historySummary.trim()
      ? [`   - Note TENDENCIAS respecto de los ECGs previos del usuario (frecuencia/cambios en el tiempo), sin sobre-interpretar. Historial:\n${historySummary}`]
      : []),
    "   - CIERRE SIEMPRE aclarando que esto NO reemplaza la evaluación de un médico y que ante cualquier hallazgo preocupante debe consultar a un profesional.",
    "Usá lenguaje prudente; nunca afirmes certezas clínicas. Devolvé el resultado con el tool `return_ecg_analysis`.",
  ].join("\n");
}
```

- [ ] **Step 2: Extender la interfaz `AiClient` en `backend/src/ai/client.ts`**
Agregar al `interface AiClient`:
```ts
  interpretEcg?(input: { pdfBase64: string; apiKey: string; historySummary?: string }): Promise<import("@pulsia/shared").EcgAnalysis>;
```
E implementar en `class AnthropicAiClient` (importar `EcgAnalysisSchema` de `@pulsia/shared`, `buildEcgPrompt` de `./ecg`):
```ts
  async interpretEcg({ pdfBase64, apiKey, historySummary }: { pdfBase64: string; apiKey: string; historySummary?: string }) {
    const client = new Anthropic({ apiKey });
    const { $schema, ...inputSchema } = z.toJSONSchema(EcgAnalysisSchema) as Record<string, unknown>;
    const tool = { name: "return_ecg_analysis", description: "Devuelve la extracción + interpretación del ECG.", input_schema: inputSchema as any };
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      tools: [tool],
      tool_choice: { type: "tool", name: "return_ecg_analysis" },
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: buildEcgPrompt(historySummary) },
      ] }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("La IA no devolvió el análisis del ECG.");
    return EcgAnalysisSchema.parse(block.input);
  }
```

- [ ] **Step 3: Typecheck + commit**
Run: `cd backend && bunx tsc --noEmit`
`git add backend/src/ai/ecg.ts backend/src/ai/client.ts && git commit -S -m "feat(backend): AiClient.interpretEcg (Opus 4.8, PDF directo, no-diagnóstico)"`

### Task 5: `buildEcgSummary` (puro) + contexto en la generación (TDD)

**Files:**
- Create: `backend/src/ai/ecgSummary.ts`
- Modify: `backend/src/ai/prompt.ts` (param `ecgSummary`)
- Test: `backend/src/ai/ecgSummary.test.ts`

- [ ] **Step 1: Test que falla** `backend/src/ai/ecgSummary.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildEcgSummary } from "./ecgSummary";

test("resume veredictos por fecha (cronológico)", () => {
  const out = buildEcgSummary([
    { recordedAt: "2026-07-01", kardiaVerdict: "Posible FA" },
    { recordedAt: "2026-06-15", kardiaVerdict: "Normal" },
  ]);
  expect(out).toContain("ECG (Kardia)");
  expect(out.indexOf("Normal")).toBeLessThan(out.indexOf("Posible FA")); // 06-15 antes que 07-01
});
test("vacío si no hay ECGs", () => {
  expect(buildEcgSummary([])).toBe("");
});
```

- [ ] **Step 2: Correr → falla** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ai/ecgSummary.test.ts`

- [ ] **Step 3: Implementar `backend/src/ai/ecgSummary.ts`**
```ts
export function buildEcgSummary(
  recordings: { recordedAt: string | null; kardiaVerdict: string | null }[],
): string {
  const items = recordings
    .filter((r) => r.kardiaVerdict)
    .sort((a, b) => (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""));
  if (items.length === 0) return "";
  const parts = items.map((r) => `${r.recordedAt ?? "s/f"} ${r.kardiaVerdict}`);
  return `ECG (Kardia): ${parts.join("; ")}`;
}
```

- [ ] **Step 4: Sumar `ecgSummary` a `buildGenerationPrompt`**
En `backend/src/ai/prompt.ts`, agregar el param opcional `ecgSummary?: string` (al final) y, cuando está presente, una línea en el bloque de perfil o antes de las Reglas:
```ts
    ...(ecgSummary && ecgSummary.trim() ? ["", `Salud cardíaca reciente (informativo, no clínico): ${ecgSummary}`] : []),
```
Ajustar la firma `buildGenerationPrompt(profile, historySummary?, memory?, progressSummary?, ecgSummary?)`.

- [ ] **Step 5: Correr → pasa** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ai && (cd backend && bunx tsc --noEmit)`
- [ ] **Step 6: Commit** `git add backend/src/ai/ecgSummary.ts backend/src/ai/ecgSummary.test.ts backend/src/ai/prompt.ts && git commit -S -m "feat(backend): buildEcgSummary + contexto de ECG en la generación"`

### Task 6: Repositorio ECG + runner async `runEcgAnalysis` (TDD)

**Files:**
- Create: `backend/src/ecg/repository.ts`
- Create: `backend/src/ecg/analyze.ts` (el runner)
- Test: `backend/src/ecg/analyze.test.ts`

- [ ] **Step 1: `backend/src/ecg/repository.ts`** (helpers de acceso):
```ts
import { eq, desc, and } from "drizzle-orm";
import { ecgRecording, settings } from "../db/schema";
import type { Db } from "../db/client"; // usar el tipo Db que ya use el repo de sessions/metrics

export async function insertEcg(db: Db, userId: string, pdf: Buffer, mime: string) {
  const [row] = await db.insert(ecgRecording).values({ userId, pdf, mime, status: "pending" }).returning();
  return row;
}
export async function getEcgById(db: Db, id: string) {
  return db.query.ecgRecording.findFirst({ where: eq(ecgRecording.id, id) });
}
export async function listEcg(db: Db, userId: string) {
  return db.query.ecgRecording.findMany({
    where: eq(ecgRecording.userId, userId),
    orderBy: [desc(ecgRecording.createdAt)],
    columns: { id: true, status: true, createdAt: true, kardiaVerdict: true, avgHr: true, recordedAt: true, interpretation: true, error: true },
  });
}
export async function priorEcgFor(db: Db, userId: string) {
  // para el historial longitudinal (veredictos + fecha, sin blob)
  return db.query.ecgRecording.findMany({
    where: and(eq(ecgRecording.userId, userId), eq(ecgRecording.status, "done")),
    columns: { recordedAt: true, kardiaVerdict: true },
  });
}
export async function deleteEcg(db: Db, id: string) {
  await db.delete(ecgRecording).where(eq(ecgRecording.id, id));
}
```
(Ajustar el import de `Db` al que usen los otros repos — ver `backend/src/sessions/repository.ts`.)

- [ ] **Step 2: Test que falla `backend/src/ecg/analyze.test.ts`** — el runner nunca throwea, marca done/failed. Usar un fake db (patrón de `generateJob.test.ts`) y un fake `interpretEcg`:
```ts
import { test, expect } from "bun:test";
import { runEcgAnalysis } from "./analyze";

function fakeDeps(opts: { interpret?: any; pdf?: Buffer } = {}) {
  const updates: any[] = [];
  const db = {
    query: {
      ecgRecording: { findFirst: async () => ({ id: "e1", userId: "u1", pdf: opts.pdf ?? Buffer.from("%PDF-1.4\nx"), status: "pending" }), findMany: async () => [] },
      settings: { findFirst: async () => ({ kardiaPwEncrypted: null }) },
    },
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); } }) }),
  } as any;
  const aiClient = { interpretEcg: opts.interpret ?? (async () => ({ kardiaVerdict: "Normal", avgHeartRate: 60, recordedAt: "2026-07-01", interpretation: "ok" })) } as any;
  return { deps: { db, aiClient, config: { encryptionKey: "a".repeat(64), defaultAiApiKey: "sk-x" } } as any, updates };
}

test("done + campos cuando interpretEcg anda", async () => {
  const { deps, updates } = fakeDeps();
  await runEcgAnalysis(deps, "e1", "u1");
  expect(updates.at(-1)).toMatchObject({ status: "done", kardiaVerdict: "Normal" });
});
test("failed + error cuando interpretEcg tira (no propaga)", async () => {
  const { deps, updates } = fakeDeps({ interpret: async () => { throw new Error("boom"); } });
  await runEcgAnalysis(deps, "e1", "u1"); // no throw
  expect(updates.at(-1)).toMatchObject({ status: "failed" });
  expect(updates.at(-1).error).toContain("boom");
});
```

- [ ] **Step 3: Correr → falla** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ecg/analyze.test.ts`

- [ ] **Step 4: Implementar `backend/src/ecg/analyze.ts`**
```ts
import { eq } from "drizzle-orm";
import { ecgRecording, settings } from "../db/schema";
import { maybeDecryptPdf } from "./decryptPdf";
import { priorEcgFor } from "./repository";
import { buildEcgSummary } from "../ai/ecgSummary";
import { resolveAiKey } from "../ai/resolveKey";
import { decryptSecret } from "../crypto/secrets";
import type { AppDeps } from "../app";

// Floating promise: NUNCA throwea. Marca la fila done/failed.
export async function runEcgAnalysis(deps: AppDeps, recordingId: string, userId: string): Promise<void> {
  try {
    const row = await deps.db.query.ecgRecording.findFirst({ where: eq(ecgRecording.id, recordingId) });
    if (!row) return;
    const settingsRow = await deps.db.query.settings.findFirst({ where: eq(settings.userId, userId) });
    const password = settingsRow?.kardiaPwEncrypted ? decryptSecret(settingsRow.kardiaPwEncrypted, deps.config.encryptionKey) : undefined;
    const decrypted = await maybeDecryptPdf(row.pdf as Buffer, password);
    const prior = await priorEcgFor(deps.db, userId);
    const historySummary = buildEcgSummary(prior);
    const apiKey = resolveAiKey(settingsRow, deps.config);
    if (!apiKey) throw new Error("No hay API key de IA disponible.");
    if (!deps.aiClient.interpretEcg) throw new Error("El cliente de IA no soporta interpretEcg.");
    const analysis = await deps.aiClient.interpretEcg({ pdfBase64: decrypted.toString("base64"), apiKey, historySummary });
    await deps.db.update(ecgRecording).set({
      status: "done", kardiaVerdict: analysis.kardiaVerdict, avgHr: analysis.avgHeartRate,
      recordedAt: analysis.recordedAt, interpretation: analysis.interpretation, error: null,
    }).where(eq(ecgRecording.id, recordingId));
  } catch (e) {
    await deps.db.update(ecgRecording).set({ status: "failed", error: (e as Error).message })
      .where(eq(ecgRecording.id, recordingId))
      .catch((err) => console.warn("no se pudo marcar el ECG como failed:", (err as Error).message));
  }
}
```

- [ ] **Step 5: Correr → pasa** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/ecg && (cd backend && bunx tsc --noEmit)`
- [ ] **Step 6: Commit** `git add backend/src/ecg/repository.ts backend/src/ecg/analyze.ts backend/src/ecg/analyze.test.ts && git commit -S -m "feat(backend): repo ECG + runner async runEcgAnalysis (nunca throwea)"`

### Task 7: Rutas `/ecg` + registro en `app.ts` (TDD)

**Files:**
- Create: `backend/src/routes/ecg.ts`
- Modify: `backend/src/app.ts` (import + `app.use("/ecg", auth)` + `app.use("/ecg/*", auth)` + `app.route("/ecg", ecgRoutes(deps))`)
- Test: `backend/src/routes/ecg.test.ts`

- [ ] **Step 1: Test que falla** (modelar `sessions.test.ts` — fake db + createApp). Casos: `POST /ecg` con `{pdfBase64}` (un PDF fake `%PDF...`) → 200 `{id, status:"pending"}` y dispara el análisis (mockear `aiClient.interpretEcg`); `GET /ecg` scoping por usuario; `GET /ecg/:id`; `DELETE /ecg/:id`; 401 sin auth. (Usar el patrón de deps/fakeDb de los tests existentes.)

- [ ] **Step 2: Correr → falla** `cd /Users/kilo/desarrollo26/pulsia && bun test backend/src/routes/ecg.test.ts`

- [ ] **Step 3: Implementar `backend/src/routes/ecg.ts`**
```ts
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
    const pdf = Buffer.from(parsed.data.pdfBase64, "base64");
    if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF")) return c.json({ error: "No parece un PDF" }, 400);
    if (pdf.length > 10 * 1024 * 1024) return c.json({ error: "PDF demasiado grande (máx 10 MB)" }, 400);
    const row = await insertEcg(deps.db, userId, pdf, "application/pdf");
    void runEcgAnalysis(deps, row.id, userId); // floating promise
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
    const pdf = await maybeDecryptPdf(row.pdf as Buffer, password).catch(() => row.pdf as Buffer);
    return c.body(pdf, 200, { "content-type": "application/pdf" });
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
```

- [ ] **Step 4: Registrar en `backend/src/app.ts`**
Import: `import { ecgRoutes } from "./routes/ecg";`. En la lista de `auth` (junto a `/metrics`): `app.use("/ecg", auth); app.use("/ecg/*", auth);`. En los `app.route`: `app.route("/ecg", ecgRoutes(deps));`.

- [ ] **Step 5: Correr → pasa** `cd /Users/kilo/desarrollo26/pulsia && bun test backend && (cd backend && bunx tsc --noEmit)`
- [ ] **Step 6: Commit** `git add backend/src/routes/ecg.ts backend/src/routes/ecg.test.ts backend/src/app.ts && git commit -S -m "feat(backend): rutas /ecg (subir/listar/ver/pdf/borrar)"`

### Task 8: Settings — `ecgEnabled` + contraseña de Kardia + contexto ECG en generación (TDD)

**Files:**
- Modify: `backend/src/routes/settings.ts`
- Modify: `backend/src/routes/programs.ts` y `backend/src/programs/generateJob.ts` (pasar `ecgSummary` cuando `ecgEnabled`)
- Test: `backend/src/routes/settings.test.ts` (agregar)

- [ ] **Step 1: Test que falla** — `PUT /settings` acepta `ecgEnabled` + `kardiaPdfPassword`; `GET /settings` devuelve `ecgEnabled` + `hasKardiaPw` (no el valor). (Modelar el test existente de settings.)

- [ ] **Step 2: Implementar en `backend/src/routes/settings.ts`**
Extender `BodySchema` → agregar `ecgEnabled: z.boolean().optional()`, `kardiaPdfPassword: z.string().optional()`. En el upsert: setear `ecgEnabled` si vino; si vino `kardiaPdfPassword` no vacío → `kardiaPwEncrypted: encryptSecret(pw, key)`. En el `GET`: agregar `ecgEnabled: row?.ecgEnabled ?? false, hasKardiaPw: !!row?.kardiaPwEncrypted`.
(Nota: `aiApiKey` hoy es `.min(1)` requerido — para permitir togglear ECG sin re-mandar la key, hacer `aiApiKey` opcional en el body y solo re-encriptar si viene; NO pisar la key existente con vacío.)

- [ ] **Step 3: Contexto ECG en la generación**
En `backend/src/programs/generateJob.ts` (`runGenerationJob`) y en el `POST /programs/generate` sync (`backend/src/routes/programs.ts`): si el usuario tiene `ecgEnabled`, cargar `priorEcgFor(db, userId)` → `buildEcgSummary(...)` → pasarlo a `generateProgramForProfile`/`buildGenerationPrompt` como `ecgSummary`. (Agregar `ecgSummary` al input de `generateProgramForProfile` en `backend/src/ai/generate.ts`, que lo reenvía a `ai.generateProgram` → `buildGenerationPrompt`. Requiere sumar `ecgSummary` a la firma de `AiClient.generateProgram` y a `buildGenerationPrompt`, que ya se extendió en Task 5.)

- [ ] **Step 4: Correr suite completa + typecheck** `cd /Users/kilo/desarrollo26/pulsia && bun test backend && (cd backend && bunx tsc --noEmit)`
- [ ] **Step 5: Commit** `git add backend/src/routes/settings.ts backend/src/routes/programs.ts backend/src/programs/generateJob.ts backend/src/ai/generate.ts backend/src/ai/client.ts backend/src/routes/settings.test.ts && git commit -S -m "feat(backend): settings ecgEnabled + contraseña Kardia + contexto ECG en la generación"`

### Task 9: Cerrar PR backend
- [ ] Push `feat/ecg-kardiamobile`, abrir PR contra `main`. Review CodeRabbit (`@coderabbitai review` si rate-limited; `@claude review` si caído). Squash-merge tras review limpio. **El merge auto-deploya el backend** (que ya trae `qpdf` en el Docker) → verificar salud (`ssh vps 'curl -s http://10.8.0.2:3011/health'`). El móvil todavía no usa esto (falta el picker); el backend queda listo.

> **Nota:** el backend + shared son un PR mergeable/deployable por sí solo. El mobile (abajo) es un segundo PR que además exige el build vc9.

---

## CAPA 3 — mobile (segundo PR, exige APK vc9)

Rama nueva desde `main` tras mergear el backend, p.ej. `feat/ecg-mobile`. **Agrega dep nativa → APK vc9.**

### Task 10: Dep `expo-document-picker` + expo-file-system (para leer base64)

**Files:** Modify: `mobile/package.json` (+ `app.json` si el plugin lo pide)
- [ ] Run: `cd mobile && bunx expo install expo-document-picker expo-file-system`
- [ ] Verificar: `cd mobile && bunx tsc --noEmit` + `node -e "require('./app.json')"`.
- [ ] Commit: `git add mobile/package.json mobile/app.json bun.lock && git commit -S -m "chore(mobile): expo-document-picker + expo-file-system (ECG, nativo → vc9)"`

### Task 11: Cliente API de ECG (mobile) (TDD)

**Files:** Create: `mobile/src/api/ecg.ts`; Test: `mobile/__tests__/ecg-api.test.ts`
- [ ] Test (modelar `mobile/__tests__/metrics-api.test.ts` o `sessions-api.test.ts`): `uploadEcg` hace POST `{pdfBase64}` y devuelve `{id,status}`; `listEcg`, `getEcg`, `deleteEcg`, `ecgPdfUrl`.
- [ ] Implementar `mobile/src/api/ecg.ts` con `apiFetch` (el helper con Bearer que ya existe): `uploadEcg(url, pdfBase64)`, `listEcg(url)`, `getEcg(url, id)`, `deleteEcg(url, id)`, y `ecgPdfUrl(url, id)` (para abrir el PDF).
- [ ] Correr → pasa + commit.

### Task 12: Configuración — toggle "ECG / Corazón" + contraseña Kardia (TDD)

**Files:** Modify: `mobile/app/configuracion.tsx`; Modify: `mobile/src/api/settings.ts` (soportar `ecgEnabled`/`kardiaPdfPassword`); Test: `mobile/__tests__/configuracion.test.tsx` (agregar)
- [ ] Test: togglear "ECG / Corazón" persiste `ecgEnabled` (mock de la API de settings); con ECG activo aparece el campo de contraseña + el acceso a la pantalla ECG.
- [ ] Implementar: leer `ecgEnabled`/`hasKardiaPw` del `GET /settings`; un `Switch` (patrón del toggle "Sonidos") que hace `PUT /settings {ecgEnabled}`; cuando activo, un `TextInput` (secureTextEntry) para la contraseña (`PUT /settings {kardiaPdfPassword}`) + un botón/enlace a `app/ecg.tsx`.
- [ ] Correr → pasa + commit.

### Task 13: Pantalla ECG — subir + pollear + listar + ver (TDD)

**Files:** Create: `mobile/app/ecg.tsx`; Test: `mobile/__tests__/ecg.test.tsx`
- [ ] Test (modelar `generando.test.tsx` para el polling + `historial.test.tsx` para la lista): montar la pantalla, mockear `DocumentPicker`/`FileSystem`/la API de ECG; "Subir ECG" → `uploadEcg` → **pollea** `getEcg` cada ~3s hasta `done` (mostrar "Analizando…" mientras pending); la lista muestra fecha · veredicto · interpretación; tap → detalle; disclaimer visible.
- [ ] Implementar `mobile/app/ecg.tsx`:
  - `DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true })` → `FileSystem.readAsStringAsync(uri, { encoding: "base64" })` → `uploadEcg(url, base64)`.
  - Polling con `setInterval`/`useEffect` (patrón de `generando.tsx`) hasta `status !== "pending"`.
  - Lista (`FlatList`/map) de recordings: fecha (`createdAt`/`recordedAt`) · **veredicto Kardia** (destacado, `colors.accent`) · resumen de interpretación. Tap → modal/detalle con la interpretación completa + botón "Ver PDF" (`Linking.openURL(ecgPdfUrl(...))` o `WebBrowser.openBrowserAsync` — pero el PDF necesita el header Bearer; si `Linking` no manda auth, bajar el PDF con `apiFetch` a un archivo temporal con `FileSystem` y abrirlo con `IntentLauncher`/`Sharing`. Simplificación aceptable: bajar a cache + `Sharing.shareAsync`/visor del sistema).
  - **Disclaimer visible**: "Esto no reemplaza la evaluación de un médico."
  - Estados: pending/failed/done.
- [ ] Correr toda la suite mobile `cd mobile && npm test -- --runInBand && bunx tsc --noEmit` → verde.
- [ ] Commit.

### Task 14: Cerrar PR mobile
- [ ] Push, PR, review, squash-merge. **NO llega por OTA** (dep nativa) → requiere build vc9.

---

## OPS — Build & activación vc9 (tras merge del PR mobile)

- [ ] Build local vc9 ([[local-android-build]]): keystore EAS + prebuild + `gradlew assembleRelease` + `MaxMetaspaceSize=1536m` + ABIs `arm64-v8a,armeabi-v7a`. Mismo keystore → instala como update. versionCode 9.
- [ ] Registrar el **nuevo fingerprint** (cambia por `expo-document-picker`) → memoria [[ota-fingerprint-gotcha]]. De acá en más, todo OTA matchea el fingerprint de vc9.
- [ ] `gh release create mobile-vc9 <apk>` (mutación externa → confirmar puntual).
- [ ] `PUT /app/latest` `{versionCode:9, apkUrl, label}` con token de sesión (usuario ops) + `X-Admin-Token` (mutación externa → confirmar).
- [ ] Actualizar `ONBOARDING.md` + memorias (vc9, nuevo fingerprint).
- [ ] Prueba real: subir un PDF de ECG (con y sin contraseña) desde el teléfono → ver la interpretación.

---

## Self-review — cobertura del spec

- Schemas ECG (status/analysis/recording) → Task 1. ✓
- Tabla `ecg_recording` (bytea) + settings `ecgEnabled`/`kardiaPwEncrypted` + migración → Task 2. ✓
- Descifrado PDF con `qpdf` on-demand + Docker → Task 3. ✓
- `interpretEcg` Opus 4.8, PDF directo, prompt no-diagnóstico + tendencias → Task 4. ✓
- `buildEcgSummary` + contexto longitudinal (interpretación, generación) → Tasks 5, 6, 8. ✓
- Runner async que nunca throwea (done/failed) → Task 6. ✓
- Rutas /ecg (subir/listar/ver/pdf/borrar) + scoping + ownership → Task 7. ✓
- Settings toggle + contraseña + gate → Task 8, 12. ✓
- Mobile: picker (vc9), API, Configuración, pantalla ECG con polling + disclaimer → Tasks 10-13. ✓
- Memoria del atleta (uso #3): `buildEcgSummary` disponible para el refresh — se puede sumar a `refreshAthleteMemory` en Task 8 si es barato; si no, queda anotado como follow-up (los otros dos usos ya cubren el norte). 
- Entrega backend deploy + APK vc9 → Task 9 + OPS. ✓
- Framing médico (no-diagnóstico + disclaimer en prompt y UI) → Tasks 4, 13. ✓
