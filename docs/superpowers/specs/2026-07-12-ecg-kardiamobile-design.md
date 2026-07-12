# ECG (AliveCor KardiaMobile 6L) — subir + interpretar + historial

> Diseño. Fecha: 2026-07-12. Feature opcional (activable en Configuración). Requiere **APK nuevo (vc9)** por el file-picker nativo. Modelo de interpretación: **`claude-opus-4-8`** (visión sobre el PDF).

## Objetivo

Que el usuario suba a la app los reportes de ECG que genera su **AliveCor KardiaMobile 6L** (PDF), para que:
1. Queden en un **historial** en la DB (visible al usuario) — norte de la [[athlete-ai-memory]].
2. La **IA los interprete**: extrae el veredicto del propio Kardia + FC + fecha, y agrega una lectura en lenguaje natural, **anclada al veredicto de Kardia** (algoritmo aprobado por la FDA), **NUNCA como diagnóstico propio**, con disclaimer.
3. Los veredictos recientes **alimenten la generación** de rutinas como **contexto informativo** (NO como indicación clínica ni base para prescribir/restringir ejercicio por su cuenta): ante hallazgos cardíacos la conducta correcta es **sugerir consultar a un médico**, no ajustar la intensidad autónomamente.

Como no todo el mundo tiene el aparato, la sección se **activa en Configuración**; por defecto no aparece.

**Norte — registro longitudinal:** el ECG no son snapshots aislados; es un **stream que se acumula con los años** para sacar conclusiones en el tiempo ([[athlete-ai-memory]] + dominio "estado holístico"). Por eso, desde el día 1: (a) al interpretar un ECG nuevo, la IA recibe el **historial reciente** para notar **tendencias** (ej. "3ª lectura de posible FA en 2 meses, frecuencia en aumento → consultá a un médico"), y (b) los veredictos de ECG son un input más de la memoria evolutiva del atleta.

## No-objetivos (YAGNI)

- **No** captura de ECG en tiempo real (eso lo hace el KardiaMobile).
- **No** se parsea el formato crudo ATC — solo el **PDF** (lo que exporta/comparte la app de Kardia).
- **No** es un motor de diagnóstico: la app NO emite diagnósticos propios; la IA da una lectura informativa anclada al veredicto de Kardia + disclaimer de "consultá a un médico".
- **No** hay sync automático desde la nube de Kardia (subida manual del PDF).
- **No** se toca el dominio Comidas todavía (pero la infra de subir archivos que se construye acá lo habilita después).

## Decisiones cerradas

- **APK vc9** (build nativo): subir archivos necesita `expo-document-picker` (nativo) → re-basa el fingerprint. Mismo método de build local que vc8 ([[local-android-build]]).
- **Modelo de interpretación: `claude-opus-4-8`** con visión sobre el PDF (el resto de la app sigue en `claude-sonnet-4-6`).
- **PDF directo a Claude:** la API acepta el PDF como content block `document` (base64, sin beta, hasta 32MB/~100 páginas en modelos de 200k, 600 en 1M) → no hay que rasterizar a imagen.
- **Almacenamiento:** el PDF como `bytea` en Postgres (simple, entra en los backups de la DB; los PDFs de Kardia son chicos ~100-300 KB).
- **Toggle:** setting **por-usuario en el backend** (`settings.ecgEnabled`), sincroniza entre dispositivos.
- **Análisis async** (como la generación de programas): subir devuelve al instante; la interpretación corre en background y se pollea.
- **PDFs con contraseña de Kardia:** en vez de pedir el PDF sin password, el usuario guarda **una vez** su contraseña de PDF de Kardia (encriptada en reposo con `ENCRYPTION_KEY`, patrón `aiApiKeyEncrypted`), y el backend **desbloquea el PDF con `qpdf`** al analizarlo y al servirlo. **Almacenamiento del PDF:** se guarda **tal cual se subió** (el blob NO se cifra a nivel app) — los PDFs protegidos por contraseña conservan su propia protección; los no protegidos quedan en claro. Aceptable porque la DB vive en la **Pi privada single-tenant del usuario** (dueño de los datos, sin intermediarios, sin otros usuarios locales) — decisión explícita del usuario. La **contraseña de Kardia** sí se cifra en reposo.

## Diseño

### 1. Shared (`shared/src/schemas/ecg.ts`)

```ts
export const EcgStatusSchema = z.enum(["pending", "done", "failed"]);
// Lo que la IA extrae + interpreta (output estructurado):
export const EcgAnalysisSchema = z.object({
  kardiaVerdict: z.string(),          // el veredicto del reporte Kardia, ej. "Normal", "Posible fibrilación auricular"
  avgHeartRate: z.number().nullable(), // FC media si figura
  recordedAt: z.string().nullable(),   // fecha/hora del ECG si figura (ISO o texto)
  interpretation: z.string(),          // lectura informativa de la IA, NO diagnóstica, con disclaimer
});
// Fila persistida / devuelta (sin el PDF):
export const EcgRecordingSchema = z.object({
  id: z.string().uuid(),
  status: EcgStatusSchema,
  createdAt: z.number().int(),         // epoch ms de la subida
  analysis: EcgAnalysisSchema.nullable(), // null mientras pending/failed
  error: z.string().nullable(),
});
```

### 2. Backend

- **Migración `00xx`: tabla `ecg_recording`:**
  ```
  id uuid pk, user_id uuid → users, pdf bytea not null, mime text not null,
  status text not null default 'pending',
  kardia_verdict text, avg_hr real, recorded_at text, interpretation text, error text,
  created_at timestamptz default now()
  ```
  (La fila ES el "job": `status` pending→done/failed; se pollea `GET /ecg/:id`.)

- **`AiClient.interpretEcg?`** (nuevo método opcional, `backend/src/ai/ecg.ts` para el prompt):
  ```ts
  interpretEcg(input: { pdfBase64: string; apiKey: string; historySummary?: string }): Promise<EcgAnalysis>;
  ```
  `historySummary` = resumen de los ECGs previos del usuario (fecha + veredicto de Kardia, orden cronológico), para que la interpretación note **tendencias en el tiempo** (registro longitudinal).
  Implementación: `client.messages.create({ model: "claude-opus-4-8", max_tokens: 4000, tools: [return_ecg_analysis], tool_choice: {type:"tool", name:"return_ecg_analysis"}, messages: [{ role:"user", content: [ {type:"document", source:{type:"base64", media_type:"application/pdf", data: pdfBase64}}, {type:"text", text: ECG_PROMPT} ] }] })`. Tool con `input_schema` = `z.toJSONSchema(EcgAnalysisSchema)` (mismo patrón que `generateProgram`). **Modelo fijo `claude-opus-4-8`** (no el del setting del usuario). Key de IA: la del server (`ANTHROPIC_API_KEY`) con override por usuario, vía `resolveAiKey` (igual que la generación).
  - **`ECG_PROMPT` (safety, clave):** instruye a Claude a (a) **extraer** el veredicto que el propio Kardia imprime en el PDF (campo `kardiaVerdict`) + FC + fecha; (b) dar una **interpretación informativa en lenguaje natural**, explícitamente **NO un diagnóstico**, **anclada al veredicto de Kardia** (que es el aprobado por la FDA); (c) si se le pasó `historySummary`, **notar tendencias** respecto de los ECGs previos (frecuencia/cambios en el tiempo), sin sobre-interpretar; y (d) **cerrar SIEMPRE** con que esto no reemplaza la evaluación de un médico y que ante hallazgos preocupantes debe consultar a un profesional. Nunca afirmar certezas clínicas; usar lenguaje prudente.

- **Descifrado de PDF (`backend/src/ecg/decryptPdf.ts`):** helper `maybeDecryptPdf(pdf: Buffer, password?: string): Promise<Buffer>` — si el PDF está cifrado, corre `qpdf --password=<pw> --decrypt - -` (stdin→stdout vía `Bun.spawn`) y devuelve el PDF desbloqueado; si no está cifrado, lo devuelve tal cual; si está cifrado y no hay password/está mal → throw con mensaje claro (`"El PDF está protegido con contraseña; guardá tu contraseña de Kardia en Configuración."`). Requiere **`qpdf` en el Docker del backend** (`apt-get install -y qpdf` en `backend/Dockerfile`).
- **Setting `kardiaPdfPasswordEncrypted`:** agregar a `settings` (encriptado con `ENCRYPTION_KEY`, patrón `aiApiKeyEncrypted`). Expuesto en `GET/PUT /settings` (el GET devuelve solo si está seteada, no el valor). Solo se usa server-side para descifrar.
- **Runner async `runEcgAnalysis(deps, recordingId)`** (patrón de `runGenerationJob`: floating promise, **nunca throwea**): lee el PDF de la fila → `maybeDecryptPdf(pdf, kardiaPassword)` → base64; arma el **`historySummary`** de los ECGs previos del usuario (via `buildEcgSummary`); `resolveAiKey`; `ai.interpretEcg({ pdfBase64, apiKey, historySummary })`; guarda `kardia_verdict/avg_hr/recorded_at/interpretation` + `status='done'`; en error (incl. "PDF protegido sin contraseña") → `status='failed'` + `error`. Fallback stale (>N min) como la generación.

- **Rutas (bajo `auth`, `backend/src/routes/ecg.ts`, registrada con `app.use("/ecg", auth)`):**
  - `POST /ecg` — recibe el PDF (multipart o base64 en JSON; Hono soporta `c.req.parseBody()` para multipart). Valida mime `application/pdf` + tamaño (≤ ~10 MB). Inserta la fila (status pending) + **dispara `runEcgAnalysis` como floating promise** → devuelve `{ id, status:"pending" }`.
  - `GET /ecg` — lista del usuario (sin el blob): `{ id, status, createdAt, analysis (o null) }`.
  - `GET /ecg/:id` — detalle (sin blob). 404/409 si es de otro usuario.
  - `GET /ecg/:id/pdf` — devuelve el PDF **desbloqueado** (`maybeDecryptPdf` con la contraseña del usuario) para que el visor del teléfono lo abra sin pedir nada. Auth + ownership.
  - `DELETE /ecg/:id`.

- **Setting `ecgEnabled`:** agregar `ecgEnabled boolean not null default false` a la tabla `settings` (misma migración o una chica). Exponerlo en `GET/PUT /settings`. Gatea (a) que la app muestre la sección y (b) que se inyecte el contexto ECG en la generación.

- **Contexto longitudinal (`backend/src/ai/ecgSummary.ts`, puro):** `buildEcgSummary(recordings)` → líneas con los veredictos por fecha (orden cronológico): p.ej. `"ECG (Kardia): 2026-06-15 Normal; 2026-07-01 Posible FA"`. **Tres usos** (registro longitudinal → conclusiones):
  1. Como `historySummary` para `interpretEcg` (que la lectura de un ECG nuevo note tendencias).
  2. Inyectado en `buildGenerationPrompt` (nuevo param opcional `ecgSummary`) — **solo si `ecgEnabled` y hay recordings**, **no reactivo** (solo al generar/refrescar).
  3. Como input del **refresh de la memoria del atleta** (`buildMemoryUpdatePrompt`, junto a history/progress) → el ECG pasa a formar parte de la memoria evolutiva ([[athlete-ai-memory]]).

### 3. Mobile

- **Dep nativa:** `expo-document-picker` (→ vc9). Tipo `application/pdf`.
- **Configuración (`app/configuracion.tsx`):** toggle **"ECG / Corazón"** (lee/escribe `settings.ecgEnabled` vía la API de settings, como la API key). Cuando está activo: un acceso a la pantalla ECG **+ un campo "Contraseña del PDF de Kardia (opcional)"** — "si protegés tus exportaciones de Kardia con contraseña, guardala acá para que la app pueda abrirlas" (escribe `kardiaPdfPasswordEncrypted`; el GET no devuelve el valor, solo si está seteada). Cuando está inactivo, nada de esto se muestra.
- **Pantalla ECG (`app/ecg.tsx`, solo accesible con `ecgEnabled`):**
  - Botón **"Subir ECG"** → `DocumentPicker.getDocumentAsync({ type: "application/pdf" })` → sube al backend (`POST /ecg`) → **pollea** el análisis (como `generando.tsx`, cada ~3s) hasta `done`/`failed`.
  - **Lista** de ECGs: fecha · **veredicto de Kardia** (destacado) · interpretación (resumen). Tap → detalle con la interpretación completa + botón **"Ver PDF"** (`GET /ecg/:id/pdf`, abrir con el visor del sistema / `Linking`/`WebBrowser`).
  - **Disclaimer visible** en la pantalla: "Esto no reemplaza la evaluación de un médico."
  - Estados: pending ("Analizando…"), failed (mensaje + reintentar), done.

### 4. Seguridad / privacidad médica

- La app **no diagnostica**; muestra el veredicto de Kardia + una lectura informativa de la IA + disclaimer, en la UI y horneado en el prompt.
- El PDF es dato de salud sensible → queda en la DB del usuario (scoping por `userId`, backups de la Pi). No se expone públicamente. Borrable por el usuario (`DELETE /ecg/:id`).

## Testabilidad

- **shared:** los schemas parsean (`EcgAnalysisSchema`, `EcgRecordingSchema`); `EcgStatus` enum.
- **backend:**
  - `buildEcgSummary` (puro): arma las líneas de veredictos recientes; vacío si no hay.
  - Rutas: `POST /ecg` con un PDF fake crea la fila (status pending) y dispara el análisis (mockear `ai.interpretEcg`); `GET /ecg`/`:id` scoping por usuario; `GET /:id/pdf` devuelve el blob con content-type; `DELETE`; 409 si es de otro usuario. `ecgEnabled` en settings.
  - `runEcgAnalysis`: con un `ai.interpretEcg` mock → done + campos; con throw → failed + error (nunca propaga).
  - `maybeDecryptPdf`: PDF sin cifrar → devuelve igual; cifrado + password correcta → desbloqueado; cifrado sin/con password incorrecta → throw con el mensaje. (Test con un PDF de fixture cifrado; requiere `qpdf` en el entorno de test o mockear el spawn.)
  - `prompt.ts`: incluye el `ecgSummary` cuando está presente.
- **mobile:** la pantalla ECG lista, sube (mock del picker + api), pollea a done; el toggle de Configuración persiste `ecgEnabled`.

## Entrega

- **Backend + shared** deployan en el merge (auto-deploy) y funcionan aunque el móvil todavía no tenga el picker.
- **Mobile** necesita **APK vc9** (el file-picker es nativo). Build local ([[local-android-build]]); nuevo fingerprint; release + `PUT /app/latest` (como vc8). De ahí en más, todo OTA futuro matchea el fingerprint de vc9.
- Orden sugerido: **shared → backend (mergeable/deployable ya) → mobile → build vc9**.

## Riesgos

- **Calidad/seguridad de la interpretación:** mitigada por el prompt (anclar a Kardia, no-diagnóstico, disclaimer) + el modelo Opus 4.8. Revisar la salida con un PDF real antes de dar por buena.
- **Tamaño de PDF / límites de la API:** validar tamaño (≤10 MB) y páginas; el reporte de Kardia es 1-2 páginas.
- **PDFs protegidos por contraseña** (Kardia lo permite): resuelto guardando la contraseña (encriptada) + `qpdf` server-side (ver §Decisiones/§2). Si viene cifrado y no hay contraseña guardada → falla con mensaje claro pidiendo guardarla. Dependencia nueva: `qpdf` en la imagen Docker del backend.
- **Contraseña de Kardia en reposo:** encriptada con `ENCRYPTION_KEY` (patrón `aiApiKeyEncrypted`); nunca se devuelve por la API; solo se usa server-side para descifrar.
- **Costo:** Opus 4.8 por interpretación; son pocas por usuario y se cachea nada (uno-off). Aceptable.
