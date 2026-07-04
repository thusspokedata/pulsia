# Memoria del atleta (Athlete Memory) — diseño

> Fecha: 2026-07-04. Estado: **aprobado autónomamente** (el usuario delegó explícitamente las decisiones
> de diseño de este sub-proyecto: "tomes decisiones propias... yo no voy a estar para responderte").
> Las decisiones y su razón quedan documentadas abajo para su revisión posterior.
> Sub-proyecto siguiente al núcleo C5 (ver [[athlete-ai-memory]] y el spec de C5). Norte de producto.

## Problema y objetivo

Hoy la generación mira las **últimas 6 sesiones crudas** (C5·PR4). Pero el norte de producto es que la IA
tenga una **memoria evolutiva y persistente** del atleta — conocimiento acumulado y curado (equipo que no
tiene, molestias/lesiones que aparecen en las notas, preferencias, tendencias de fuerza, qué le funciona)
— que se **actualiza con el tiempo**, se **usa en cada generación**, y que el usuario pueda **ver**
("qué sabe la IA de mí").

## Decisiones tomadas (autónomas — con razón)

1. **Forma: memoria de texto libre evolutiva** (un solo bloque de texto por usuario), NO hechos
   estructurados. *Por qué:* mapea directo a "qué sabe la IA de mí" (legible), es lo más simple de
   guardar/mostrar/inyectar, y la IA la mantiene con lenguaje natural. Estructura tipada = v-next.
2. **Storage: tabla `athlete_memory`** `{ userId PK → users.id, content text default "" not null, updatedAt }`
   — una fila por usuario, espejando `settings`/`profiles`. Single-user usa el usuario por defecto.
3. **Actualización por IA:** una función `updateAthleteMemory({ current, historySummary, apiKey, model })`
   que le pide a Claude fusionar la memoria previa con el resumen de las sesiones recientes (reusa
   `buildTrainingHistorySummary` de C5·PR4) y devuelve la **nueva memoria** como texto. Prompt: "Esto es
   lo que sabías del atleta + sus últimas sesiones; actualizá la memoria: incorporá lo nuevo, mantené lo
   relevante y durable (equipo faltante, molestias, preferencias, niveles), descartá lo efímero, sé
   conciso (máx ~1500 caracteres)." Respuesta de **texto plano** (no tool-use).
4. **Cuándo se actualiza:**
   - **Explícito:** `POST /memory/refresh` (botón "Actualizar" en la pantalla de memoria).
   - **En la generación:** `POST /programs/generate` **refresca la memoria primero** y luego la usa en el
     prompt. *Por qué:* la memoria importa sobre todo al generar; refrescar justo antes garantiza que el
     plan use el conocimiento más nuevo. El costo (1 llamada LLM extra corta) es aceptable dentro de una
     generación que ya tarda ~2 min. Si `updateAthleteMemory` falla, la generación sigue con la memoria
     previa (best-effort, no bloquea).
5. **Uso en generación:** el prompt incluye la **memoria** (conocimiento de largo plazo) **además** del
   resumen de las últimas 6 sesiones de C5·PR4 (datos crudos recientes). Los dos aportan.
6. **UI:** pantalla "Qué sabe la IA de mí" accesible desde **Perfil**, que muestra `content` y tiene un
   botón "Actualizar memoria" (llama `/memory/refresh` y re-fetchea). Read-only para el usuario (la IA la
   escribe); v-next podría permitir edición manual.
7. **No auto-refresh por sesión** (evita 1 LLM call por sesión sincronizada). El refresh en la generación
   + el botón cubren la frescura sin costo por-sesión.

## Arquitectura y decomposición (PRs)

### M1 — Backend: store + endpoint de lectura + actualización por IA (este spec + primer PR)
- **DB:** tabla `athlete_memory` (schema.ts) + migración drizzle. 
- **Repository** (`backend/src/memory/repository.ts`): `getMemory(db, userId): Promise<string>` (devuelve
  `""` si no hay fila) y `upsertMemory(db, userId, content): Promise<void>`.
- **IA** (`backend/src/ai/memory.ts`): `buildMemoryUpdatePrompt(current, historySummary): string` (pura)
  + método `updateMemory({ current, historySummary, apiKey, model })` en `AiClient` (interfaz + impl
  Anthropic; respuesta de texto). Fake AiClient de tests lo implementa.
- **Endpoints** (`backend/src/routes/memory.ts`, montado en `app.ts` como `/memory`):
  - `GET /memory` → `{ content }`.
  - `POST /memory/refresh` → obtiene las últimas 6 sesiones → `buildTrainingHistorySummary` → 
    `updateMemory` → `upsertMemory` → `{ content }`.

### M2 — Backend: usar la memoria en la generación
- `POST /programs/generate`: antes de generar, **refresca** la memoria (best-effort) y la **incluye en el
  prompt** (`buildGenerationPrompt(profile, historySummary, memory?)`), además del resumen reciente.

### M3 — Mobile: pantalla "Qué sabe la IA de mí"
- `mobile/src/api/memory.ts` (`getMemory`, `refreshMemory`), una pantalla nueva (ruta) con el texto + botón
  "Actualizar memoria", enlazada desde Perfil.

## Error handling / edge cases
- Sin memoria previa (`content=""`) → `updateMemory` arranca de cero con el historial.
- Sin sesiones recientes → `historySummary=""` → `updateMemory` puede devolver la memoria previa sin
  cambios (o vacía). `POST /memory/refresh` igual responde 200 con el content resultante.
- `updateMemory` falla (red/IA) en la generación → log best-effort, se sigue con la memoria previa (la
  generación NO debe fallar por la memoria).
- Cota de longitud: el prompt pide máx ~1500 chars; además el repo puede truncar defensivamente al guardar.
- Single-user: `userId` = usuario por defecto (SINGLE_USER_MODE), como el resto.

## Testing (TDD)
- **M1:** `getMemory`/`upsertMemory` (fake db, round-trip + default ""); `buildMemoryUpdatePrompt` (incluye
  memoria previa + historial); `GET /memory` (200 con content); `POST /memory/refresh` (llama updateMemory
  con el historial y persiste el resultado — aiClient mockeado). Migración generada + commiteada.
- **M2:** `buildGenerationPrompt` incluye el bloque de memoria cuando se pasa; la ruta refresca+pasa la
  memoria (mock); fallo de refresh no rompe la generación.
- **M3:** api client + pantalla (render del content + botón dispara refresh).

## Fuera de alcance (v-next)
- Memoria **estructurada** (hechos tipados). Edición manual por el usuario. Auto-refresh por sesión.
- Integración Garmin en la memoria (sueño/HRV/estrés) — cuando exista esa ingesta.
- Versionado/historial de la memoria.
