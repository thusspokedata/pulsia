# Captura total del `.FIT` — Fase 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD por task. Commits firmados (`git commit -S`), SIN `Co-Authored-By`.

**Goal:** dejar de descartar el 90% del `.FIT`: guardar el archivo crudo, extraer todos los escalares de sesión, y persistir el stream multicanal + extras (zonas, atleta, dispositivos, vueltas, eventos).

**Architecture:** `parseFit` pasa a `includeUnknownData`. El archivo crudo va a una tabla aparte (`cardio_fit_file`) para no arrastrar el binario en los listados. El stream se guarda **columnar** en `samples` (jsonb) y los extras en `fit_extras`. Migración 0021 crea todo y backfillea `hr_series`→`samples`.

**Tech Stack:** Bun, Hono, Drizzle/Postgres, Zod, `@garmin/fitsdk`, React Native.

**Verify:** `bun run typecheck && bun run test && bun run test:mobile`

**⚠️ PRIVACIDAD — regla dura:** el repo es **público** y el `.FIT` real del usuario contiene su
**nombre, peso, altura, FC en reposo y FC máxima**. **NUNCA** commitear el archivo real ni ningún
volcado suyo, ni pegar esos valores en tests, fixtures, comentarios o mensajes de commit. Todos los
tests usan el **fixture sintético** con datos inventados.

**⚠️ Working tree compartido:** hay otras sesiones sobre el mismo repo. Trabajar SIEMPRE en el
worktree aislado `/private/tmp/pulsia-fit`. No hacer `checkout` en `~/desarrollo26/pulsia`.

---

## Task 1 — Schemas (shared)

**Files:** `shared/src/schemas/cardio.ts` (+ test)

- [ ] **1.1** Agregar los schemas del stream y los extras:
```ts
// Stream columnar: un array por canal, alineado por índice con `t`. Los huecos son null porque
// los canales son dispersos (respiración aparece en ~1 de cada 3 records).
export const CardioSamplesSchema = z.object({
  t: z.array(z.number().int().min(0)),
  hr: z.array(z.number().nullable()).optional(),
  cad: z.array(z.number().nullable()).optional(),
  fracCad: z.array(z.number().nullable()).optional(),
  resp: z.array(z.number().nullable()).optional(),
  cycleLen: z.array(z.number().nullable()).optional(),
  // Campos que el SDK no sabe nombrar, guardados crudos y SIN interpretar (clave = nº de campo FIT).
  unknown: z.record(z.string(), z.array(z.number().nullable())).optional(),
});
export type CardioSamples = z.infer<typeof CardioSamplesSchema>;

export const CardioHrZonesSchema = z.object({
  secondsPerZone: z.array(z.number()),      // timeInHrZone
  highBoundary: z.array(z.number()),        // hrZoneHighBoundary
  maxHr: z.number().nullable(),
  restingHr: z.number().nullable(),
  thresholdHr: z.number().nullable(),
  calcType: z.string().nullable(),
});

export const CardioFitExtrasSchema = z.object({
  zones: CardioHrZonesSchema.optional(),
  athlete: z.record(z.string(), z.unknown()).optional(),
  devices: z.array(z.record(z.string(), z.unknown())).optional(),
  laps: z.array(z.record(z.string(), z.unknown())).optional(),
  events: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type CardioFitExtras = z.infer<typeof CardioFitExtrasSchema>;
```
- [ ] **1.2** Agregar a `CardioActivitySchema` **y** a `CardioFitPreviewSchema` (todos opcionales/nullable
  para no romper lo existente ni la carga manual):
  `totalCycles`, `trainingLoad`, `trainingEffectAerobic`, `trainingEffectAnaerobic`, `avgCadence`,
  `maxCadence`, `avgFractionalCadence`, `avgRespiration`, `maxRespiration`, `minRespiration`,
  `metabolicKcal`, `sportProfileName`, `tzOffsetMinutes`, `samples` (CardioSamplesSchema),
  `fitExtras` (CardioFitExtrasSchema).
- [ ] **1.3** Test: un `CardioActivity` mínimo (sin ninguno de los nuevos) sigue validando; uno con
  `samples` de canales dispersos (con `null`) valida; `t` negativo falla.
- [ ] **1.4** Verify `bun run test && bun run typecheck`. Commit: `feat(fit): schemas del stream multicanal y extras`

---

## Task 2 — Fixture sintético ampliado (backend)

**Files:** `backend/src/cardio/fitFixture.ts` (+ su test si existe)

- [ ] **2.1** LEER el fixture actual: usa el `Encoder` del SDK para sintetizar un `.FIT` válido.
- [ ] **2.2** Extenderlo para emitir además: `timeInZoneMesgs`, `zonesTargetMesgs`, `userProfileMesgs`,
  `deviceInfoMesgs`, `lapMesgs`, `eventMesgs`, los escalares nuevos de sesión, y **campos desconocidos**
  en los records. Opciones con overrides, como ya hace.
  **Datos 100% inventados** (nombre tipo `"Test Atleta"`, pesos/FC redondos). Nada del archivo real.
- [ ] **2.3** Que los canales sean **dispersos** a propósito (p. ej. respiración solo en 1 de cada 3
  records) para poder testear los huecos.
- [ ] **2.4** Verify + commit: `test(fit): fixture sintético con zonas, atleta, vueltas y campos desconocidos`

---

## Task 3 — Parser (backend)

**Files:** `backend/src/cardio/parseFit.ts` (+ test)

- [ ] **3.1** Tests primero, **todos contra el fixture sintético**:
  extrae los 13 escalares nuevos; `samples` columnar con `t` relativo al inicio y `null` en los huecos;
  `unknown` presente y sin interpretar; `zones` con segundos y fronteras; `athlete`/`devices`/`laps`/`events`;
  `tzOffsetMinutes` derivado de `activityMesgs.localTimestamp − timestamp`; y que un `.FIT` sin esos
  mensajes siga parseando (todo opcional).
- [ ] **3.2** Implementar: `read({ includeUnknownData: true, applyScaleAndOffset: true, expandSubFields: true, convertTypesToStrings: true, convertDateTimesToDates: true })`.
  Construir `samples` recorriendo `recordMesgs` UNA vez: `t` = `timestamp − startedAt` (descartando
  records anteriores al inicio, como ya hace hoy), y por cada canal `push(valor ?? null)`.
  Las claves numéricas (`135`,`136`,`143`,`144`) van a `unknown`.
  Mantener `hrSeries` como está (compatibilidad) además de `samples`.
  Seguir validando la salida con `CardioFitPreviewSchema.parse` y que todo throw sea 400 legible.
- [ ] **3.3** Verify + commit: `feat(fit): parser captura escalares, stream multicanal, zonas y extras`

---

## Task 4 — DB: tabla, columnas y migración 0021

**Files:** `backend/src/db/schema.ts`, `backend/drizzle/0021_*.sql`, `meta/_journal.json`

- [ ] **4.1** En `schema.ts`: tabla `cardioFitFile` (`activityId` uuid PK → `cardio_activity.id`
  `onDelete: cascade`, `bytes` bytea, `sizeBytes` int, `sha256` text, `createdAt`), y las columnas
  nuevas en `cardioActivity` (los 13 escalares + `samples` jsonb + `fit_extras` jsonb).
- [ ] **4.2** Generar la migración con `drizzle-kit generate` (ESTA sí cambia el esquema, a diferencia
  de la 0020). Revisar el SQL generado.
- [ ] **4.3** Agregar al final del `.sql` el **backfill** de `hr_series` → `samples`:
```sql
-- Un solo modelo hacia adelante: las actividades viejas pasan de {t,bpm}[] a columnar {t:[],hr:[]}.
UPDATE cardio_activity
SET samples = jsonb_build_object(
      't',  (SELECT coalesce(jsonb_agg(e->'t'   ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(hr_series) WITH ORDINALITY AS a(e, ord)),
      'hr', (SELECT coalesce(jsonb_agg(e->'bpm' ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(hr_series) WITH ORDINALITY AS a(e, ord))
    )
WHERE hr_series IS NOT NULL
  AND jsonb_typeof(hr_series) = 'array'
  AND jsonb_array_length(hr_series) > 0
  AND samples IS NULL;
```
- [ ] **4.4** ⚠️ **Verificar contra un Postgres efímero, NUNCA contra prod.** Levantar
  `docker run --rm -e POSTGRES_PASSWORD=x -p 55433:5432 -d --name pulsia-fit-mig postgres:16-alpine`
  (si `postgres:16` pide auth, usar `-alpine`), crear una `cardio_activity` mínima con `hr_series`,
  correr la migración y probar: (a) el backfill produce `{"t":[…],"hr":[…]}` con el mismo largo y
  orden; (b) una fila con `hr_series` NULL queda con `samples` NULL; (c) re-run = 0 filas afectadas.
  Pegar el output real de psql. Borrar el contenedor.
- [ ] **4.5** Commit: `feat(fit): tabla del archivo crudo, columnas nuevas y migración 0021`

---

## Task 5 — Persistencia y ruta (backend)

**Files:** `backend/src/cardio/repository.ts`, `backend/src/routes/cardio.ts` (+ tests)

- [ ] **5.1** `insertCardio` persiste los campos nuevos; `getCardio`/`listCardio` los devuelven.
  **`listCardio` NO debe traer el binario** (está en otra tabla, pero verificar que no se joinee).
- [ ] **5.2** `POST /cardio` acepta `fitBase64` **opcional** en el body. Si viene Y `source === "fit"`:
  decodificar, calcular sha256, e insertar en `cardio_fit_file` con el `activityId`. Si no viene
  (carga manual), no romper. Reusar el tope `MAX_FIT_B64` existente.
  Guardar el archivo **no debe** hacer fallar el alta: si el insert del archivo falla, loguear y
  devolver 200 igual — la actividad es lo importante.
- [ ] **5.3** Tests: alta con `fitBase64` guarda el archivo; sin él no rompe; `source:"manual"` con
  `fitBase64` NO guarda; re-POST del mismo id sigue siendo idempotente.
- [ ] **5.4** Verify + commit: `feat(fit): guardar el .FIT crudo al crear la actividad`

---

## Task 6 — Móvil

**Files:** `mobile/src/cardio/buildFitActivity.ts`, `mobile/app/cardio.tsx`, `mobile/src/api/cardio.ts` (+ test)

- [ ] **6.1** Al confirmar un import, mandar también el `fitBase64` que ya se tiene en memoria
  (la pantalla lo leyó para el preview) en el `POST /cardio`.
- [ ] **6.2** Donde hoy se lee `hrSeries` para graficar, leer `samples.hr`/`samples.t` con **fallback**
  a `hrSeries` (las actividades viejas backfilleadas ya tienen `samples`, pero el fallback cubre
  cualquier caso).
- [ ] **6.3** **Sin UI nueva** — los tiles y gráficos son Fase 2.
- [ ] **6.4** Verify (`typecheck` + suite completa de móvil) + commit: `feat(fit): mandar el archivo al confirmar el import`

---

## Task 7 — Verificación final

- [ ] `bun run typecheck` → 0
- [ ] `bun run test` → 0 fail (OJO: `bun run test`, no `bun test` — el segundo usa el runner nativo sobre todo el repo)
- [ ] `bun run test:mobile` → 0 fail
- [ ] `git status` — que NO haya quedado ningún `.fit`, volcado ni script temporal sin trackear.

## Self-review

- **Cobertura del spec:** archivo crudo en tabla aparte (T4/T5) ✓; 13 escalares (T1/T3) ✓; stream
  columnar con huecos (T1/T3) ✓; campos desconocidos sin interpretar (T1/T3) ✓; zonas/atleta/
  dispositivos/vueltas/eventos (T1/T3) ✓; tz del archivo (T3) ✓; backfill `hr_series`→`samples` (T4) ✓;
  fixture sintético (T2) ✓; sin UI nueva (T6.3) ✓.
- **Placeholders:** ninguno. El SQL del backfill y los schemas van completos; T2/T3/T5 llevan la
  especificación exacta de comportamiento y los tests que deben pasar.
- **Consistencia:** `CardioSamplesSchema`/`CardioFitExtrasSchema` definidos en T1 y consumidos igual
  en T3–T6; los nombres de columna de T4 coinciden con los campos de T1.
