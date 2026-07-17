# Cardio Fase 3 — Import .FIT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar un archivo `.FIT` (exportado de Garmin Connect) en el backend, parsearlo a un preview de actividad, y confirmarlo desde el móvil para crear una `cardio_activity` con las kcal y FC medidas por el reloj.

**Architecture:** El móvil elige el archivo → lo manda en base64 a `POST /cardio/parse` → el backend valida (tamaño, magic bytes), parsea con `@garmin/fitsdk` y devuelve un **preview** (sin persistir) → el usuario revisa/corrige el tipo y confirma → `POST /cardio` con `source:"fit"`. El `.FIT` no se guarda: es solo transporte. El parseo tarda milisegundos, así que **no** hay runner async ni polling (a diferencia del ECG).

**Tech Stack:** `@garmin/fitsdk` (parser oficial JS, solo backend), Hono, Zod (shared), Expo `expo-document-picker` + `expo-file-system/legacy` (ya instalados por el ECG), Bun test (shared/backend), Jest (móvil).

---

## Contexto que el implementador necesita

**Este es un solo PR (PR3 del spec) con cambios en shared + backend + móvil.** Rama: `feat/cardio-fase3-import-fit`. Worktree aislado (se crea al ejecutar).

**Convenciones del repo (obligatorias):**
- TDD estricto. **Cada test nuevo se verifica POR MUTACIÓN** antes de darlo por bueno: romper el código a propósito, correr el test, confirmar que falla, revertir. El plan lista la mutación concreta por test.
- Commits firmados con `-S`. **Sin** atribución a Claude/Anthropic en el mensaje.
- `bun test` en shared/ y backend/. `bun test <archivo>` para un solo archivo.
- Móvil: `cd mobile && bun test` (Jest, `--runInBand` ya configurado en el script).
- Tipos derivados de schemas Zod en `shared/`, nunca duplicados a mano.

**API de `@garmin/fitsdk` (verificada con un round-trip real):**
```js
import { Decoder, Stream, Encoder, Profile } from "@garmin/fitsdk";
const dec = new Decoder(Stream.fromByteArray(bytes)); // bytes: Uint8Array | Buffer
dec.isFIT();          // boolean — valida el header
dec.checkIntegrity(); // boolean — valida CRC (no lo usamos como gate: algunos .FIT reales fallan CRC pero parsean bien)
const { messages, errors } = dec.read();
// messages.sessionMesgs[0] = { startTime: Date, sport: "walking", totalTimerTime: 1800 (s),
//   totalDistance: 2500 (m), totalCalories: 150, avgHeartRate: 110, maxHeartRate: 130, totalAscent: 12 }
// messages.recordMesgs[] = { timestamp: Date, heartRate: 108 }
```
`sport` es un string (walking/running/cycling/swimming/rowing/hiking/fitness_equipment/generic…). `startTime` y `timestamp` vuelven como `Date`. Los campos device pueden faltar (undefined).

**Preview → dominio:** el preview reúne los campos que mide el reloj. El usuario puede corregir tipo/duración/distancia/FC en el móvil antes de confirmar; `startedAt`, `kcal`, `maxHr`, `elevationGainM`, `hrSeries` se arrastran del preview tal cual. El server **re-deriva** `kcalSource` (§5 del spec): no confía en el cliente.

---

## Estructura de archivos

| archivo | responsabilidad | acción |
|---|---|---|
| `shared/src/schemas/cardio.ts` | `CardioFitPreviewSchema` + tipo | modificar |
| `shared/src/schemas/cardio.test.ts` | test del schema del preview | modificar |
| `backend/package.json` | dep `@garmin/fitsdk` | modificar |
| `backend/src/cardio/parseFit.ts` | `mapSport` + `parseFit(buffer) → CardioFitPreview` | crear |
| `backend/src/cardio/fitFixture.ts` | helper de test: construir bytes `.FIT` válidos con el Encoder | crear |
| `backend/src/cardio/parseFit.test.ts` | tests del parser (fixture, sport mapping, sin sesión) | crear |
| `backend/src/routes/cardio.ts` | ruta `POST /cardio/parse` antes de `/:id` | modificar |
| `backend/src/routes/cardio.test.ts` | tests de la ruta (200, magic bytes, tamaño, corrupto) | crear/modificar |
| `mobile/src/api/cardio.ts` | `parseFitCardio(baseUrl, base64)` | modificar |
| `mobile/src/cardio/buildFitActivity.ts` | `buildFitActivity(preview, form, id) → CardioActivity` (puro) | crear |
| `mobile/__tests__/cardio-fit.test.ts` | test de `buildFitActivity` + `parseFitCardio` | crear |
| `mobile/app/cardio.tsx` | botón "Importar .FIT" + picker + preview + confirmar | modificar |

---

### Task 1: Schema del preview en shared

**Files:**
- Modify: `shared/src/schemas/cardio.ts`
- Test: `shared/src/schemas/cardio.test.ts`

El preview describe lo que el reloj midió. `type` es la mejor conjetura del parser (el usuario la corrige). No lleva `id`/`source`/`kcalSource`/`notes` (los pone el móvil al confirmar).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `shared/src/schemas/cardio.test.ts` (ya existe; seguir el estilo de sus tests actuales):

```ts
import { CardioFitPreviewSchema } from "./cardio";

test("CardioFitPreviewSchema acepta un preview completo del reloj", () => {
  const preview = {
    type: "walk" as const,
    startedAt: 1_700_000_000_000,
    durationMs: 1_800_000,
    distanceM: 2500,
    avgHr: 110,
    maxHr: 130,
    elevationGainM: 12,
    kcal: 150,
    hrSeries: [{ t: 0, bpm: 108 }],
  };
  const parsed = CardioFitPreviewSchema.parse(preview);
  expect(parsed.type).toBe("walk");
  expect(parsed.kcal).toBe(150);
});

test("CardioFitPreviewSchema acepta campos device nulos y hrSeries ausente", () => {
  const parsed = CardioFitPreviewSchema.parse({
    type: "run",
    startedAt: 1_700_000_000_000,
    durationMs: 600_000,
    distanceM: null,
    avgHr: null,
    maxHr: null,
    elevationGainM: null,
    kcal: null,
  });
  expect(parsed.hrSeries).toBeUndefined();
  expect(parsed.kcal).toBeNull();
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd shared && bun test src/schemas/cardio.test.ts`
Expected: FAIL — `CardioFitPreviewSchema` no existe (import roto).

- [ ] **Step 3: Implementar el schema**

Agregar en `shared/src/schemas/cardio.ts`, justo después de `CardioActivitySchema`/`type CardioActivity`:

```ts
// Preview del parseo de un .FIT: lo que midió el reloj, antes de confirmarse como actividad.
// No lleva id/source/kcalSource/notes — los agrega el móvil al confirmar (POST /cardio). `type`
// es la conjetura del parser a partir del `sport` del archivo; el usuario la corrige en el preview.
export const CardioFitPreviewSchema = z.object({
  type: CardioTypeSchema,
  startedAt: z.number().int(),
  durationMs: z.number().int().positive(),
  distanceM: z.number().int().min(0).nullable(),
  avgHr: z.number().int().min(0).nullable(),
  maxHr: z.number().int().min(0).nullable(),
  elevationGainM: z.number().int().min(0).nullable(),
  kcal: z.number().int().min(0).nullable(),
  hrSeries: z.array(CardioHrPointSchema).optional(),
});
export type CardioFitPreview = z.infer<typeof CardioFitPreviewSchema>;
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd shared && bun test src/schemas/cardio.test.ts`
Expected: PASS (ambos tests).

- [ ] **Step 5: Verificación por mutación**

En el schema, cambiar `durationMs: z.number().int().positive()` por `.min(0)`. Correr el test. El primer test sigue pasando (no cubre eso), pero agregá temporalmente un `expect(() => CardioFitPreviewSchema.parse({ ...preview base..., durationMs: 0 })).toThrow()` — si no querés agregar assert, en su lugar mutá `type: CardioTypeSchema` → `z.string()` y confirmá que el segundo test **sigue** pasando (no cubre type inválido). La mutación relevante y barata: cambiar `kcal: ...nullable()` a `...` (sin nullable) → el segundo test (`kcal: null`) debe FALLAR. Confirmá que falla, luego revertí.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/cardio.ts shared/src/schemas/cardio.test.ts
git commit -S -m "feat(cardio): CardioFitPreviewSchema — preview del parseo de .FIT"
```

---

### Task 2: Dependencia + parser `.FIT` en el backend

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/cardio/fitFixture.ts`
- Create: `backend/src/cardio/parseFit.ts`
- Test: `backend/src/cardio/parseFit.test.ts`

- [ ] **Step 1: Instalar la dependencia**

```bash
cd backend && bun add @garmin/fitsdk
```
Expected: `package.json` gana `"@garmin/fitsdk": "^21.208.0"` (o la versión que resuelva). Confirmá con `grep fitsdk backend/package.json`.

- [ ] **Step 2: Crear el helper de fixture (para tests)**

Genera bytes `.FIT` válidos en memoria con el Encoder oficial — evita checkear un binario. `startTimeMs` en epoch ms; los records son puntos de FC opcionales.

Crear `backend/src/cardio/fitFixture.ts`:

```ts
import { Encoder, Profile } from "@garmin/fitsdk";

export interface FitFixtureOpts {
  startTimeMs?: number;
  sport?: string;
  totalTimerTime?: number; // segundos
  totalDistance?: number | null; // metros
  totalCalories?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  totalAscent?: number | null;
  hr?: { atMs: number; bpm: number }[]; // record mesgs
  withSession?: boolean; // default true
}

// Construye un ArrayBuffer con un .FIT válido (header + CRC correctos) para tests.
export function buildFitFixture(opts: FitFixtureOpts = {}): Uint8Array {
  const {
    startTimeMs = 1_700_000_000_000,
    sport = "walking",
    totalTimerTime = 1800,
    totalDistance = 2500,
    totalCalories = 150,
    avgHeartRate = 110,
    maxHeartRate = 130,
    totalAscent = 12,
    hr = [],
    withSession = true,
  } = opts;

  const enc = new Encoder();
  enc.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: "activity", timeCreated: new Date(startTimeMs) });
  if (withSession) {
    const session: Record<string, unknown> = { mesgNum: Profile.MesgNum.SESSION, startTime: new Date(startTimeMs), sport, totalTimerTime };
    if (totalDistance != null) session.totalDistance = totalDistance;
    if (totalCalories != null) session.totalCalories = totalCalories;
    if (avgHeartRate != null) session.avgHeartRate = avgHeartRate;
    if (maxHeartRate != null) session.maxHeartRate = maxHeartRate;
    if (totalAscent != null) session.totalAscent = totalAscent;
    enc.writeMesg(session);
  }
  for (const p of hr) {
    enc.writeMesg({ mesgNum: Profile.MesgNum.RECORD, timestamp: new Date(p.atMs), heartRate: p.bpm });
  }
  return enc.close();
}
```

- [ ] **Step 3: Escribir el test que falla**

Crear `backend/src/cardio/parseFit.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseFit, mapSport } from "./parseFit";
import { buildFitFixture } from "./fitFixture";

const START = 1_700_000_000_000;

test("parseFit extrae los campos device de una caminata", () => {
  const bytes = buildFitFixture({
    startTimeMs: START, sport: "walking", totalTimerTime: 1800,
    totalDistance: 2500, totalCalories: 150, avgHeartRate: 110, maxHeartRate: 130, totalAscent: 12,
    hr: [{ atMs: START, bpm: 108 }, { atMs: START + 60_000, bpm: 114 }],
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.type).toBe("walk");
  expect(p.startedAt).toBe(START);
  expect(p.durationMs).toBe(1_800_000);
  expect(p.distanceM).toBe(2500);
  expect(p.kcal).toBe(150);
  expect(p.avgHr).toBe(110);
  expect(p.maxHr).toBe(130);
  expect(p.elevationGainM).toBe(12);
  expect(p.hrSeries).toEqual([{ t: 0, bpm: 108 }, { t: 60_000, bpm: 114 }]);
});

test("parseFit deja null los campos device ausentes y omite hrSeries sin FC", () => {
  const bytes = buildFitFixture({
    startTimeMs: START, sport: "running", totalTimerTime: 600,
    totalDistance: null, totalCalories: null, avgHeartRate: null, maxHeartRate: null, totalAscent: null,
    hr: [],
  });
  const p = parseFit(Buffer.from(bytes));
  expect(p.type).toBe("run");
  expect(p.distanceM).toBeNull();
  expect(p.kcal).toBeNull();
  expect(p.hrSeries).toBeUndefined();
});

test("parseFit lanza si el archivo no tiene sesión", () => {
  const bytes = buildFitFixture({ withSession: false, hr: [{ atMs: START, bpm: 100 }] });
  expect(() => parseFit(Buffer.from(bytes))).toThrow(/sesión/i);
});

test("parseFit lanza con bytes que no son FIT", () => {
  expect(() => parseFit(Buffer.from("no soy un fit", "latin1"))).toThrow();
});

test("mapSport traduce los sports conocidos y cae en 'other'", () => {
  expect(mapSport("walking")).toBe("walk");
  expect(mapSport("hiking")).toBe("walk");
  expect(mapSport("running")).toBe("run");
  expect(mapSport("cycling")).toBe("bike");
  expect(mapSport("swimming")).toBe("swim");
  expect(mapSport("rowing")).toBe("rowing");
  expect(mapSport("fitness_equipment", "elliptical")).toBe("elliptical");
  expect(mapSport("generic")).toBe("other");
  expect(mapSport(undefined)).toBe("other");
});
```

- [ ] **Step 4: Correr el test para verlo fallar**

Run: `cd backend && bun test src/cardio/parseFit.test.ts`
Expected: FAIL — `parseFit`/`mapSport` no existen.

- [ ] **Step 5: Implementar el parser**

Crear `backend/src/cardio/parseFit.ts`:

```ts
import { Decoder, Stream } from "@garmin/fitsdk";
import type { CardioType, CardioFitPreview } from "@pulsia/shared";

// Traduce el `sport` (y a veces `subSport`) del .FIT a nuestro CardioType. Aproximado a propósito:
// el usuario corrige el tipo en el preview. Garmin marca caminatas como "hiking" y la elíptica como
// fitness_equipment + subSport "elliptical".
export function mapSport(sport: string | undefined, subSport?: string): CardioType {
  if (sport === "walking" || sport === "hiking") return "walk";
  if (sport === "running") return "run";
  if (sport === "cycling") return "bike";
  if (sport === "swimming") return "swim";
  if (sport === "rowing") return "rowing";
  if (sport === "fitness_equipment" && subSport === "elliptical") return "elliptical";
  return "other";
}

// Redondea un número a entero, o null si viene null/undefined/no-finito.
function intOrNull(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

// Parsea un .FIT a un preview. Lanza Error (mensaje legible) si no es FIT, está corrupto o no tiene
// sesión. La ruta traduce cualquier throw a un 400 — nunca un 500 con stack.
export function parseFit(buffer: Buffer): CardioFitPreview {
  const decoder = new Decoder(Stream.fromByteArray(buffer));
  if (!decoder.isFIT()) throw new Error("El archivo no es un .FIT válido");
  const { messages } = decoder.read();
  const session = messages.sessionMesgs?.[0];
  if (!session) throw new Error("El .FIT no contiene una sesión de actividad");

  const startedAt = session.startTime instanceof Date ? session.startTime.getTime() : Number(session.startTime);
  if (!Number.isFinite(startedAt)) throw new Error("El .FIT no tiene una hora de inicio válida");

  const seconds = typeof session.totalTimerTime === "number" ? session.totalTimerTime
    : typeof session.totalElapsedTime === "number" ? session.totalElapsedTime : 0;
  const durationMs = Math.round(seconds * 1000);
  if (durationMs <= 0) throw new Error("El .FIT no tiene una duración válida");

  const records: any[] = messages.recordMesgs ?? [];
  const hrSeries = records
    .filter((r) => typeof r.heartRate === "number" && r.timestamp instanceof Date)
    .map((r) => ({ t: (r.timestamp as Date).getTime() - startedAt, bpm: Math.round(r.heartRate) }));

  return {
    type: mapSport(session.sport, session.subSport),
    startedAt,
    durationMs,
    distanceM: intOrNull(session.totalDistance),
    avgHr: intOrNull(session.avgHeartRate),
    maxHr: intOrNull(session.maxHeartRate),
    elevationGainM: intOrNull(session.totalAscent),
    kcal: intOrNull(session.totalCalories),
    hrSeries: hrSeries.length > 0 ? hrSeries : undefined,
  };
}
```

- [ ] **Step 6: Correr el test para verlo pasar**

Run: `cd backend && bun test src/cardio/parseFit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Verificación por mutación (uno por comportamiento clave)**

1. En `mapSport`, cambiar `if (sport === "walking" || sport === "hiking") return "walk";` por `return "run";` → el test de `mapSport` y el primer test de `parseFit` deben FALLAR. Revertir.
2. En `parseFit`, cambiar `hrSeries.length > 0 ? hrSeries : undefined` por `hrSeries` → el segundo test (hrSeries ausente) debe FALLAR (espera `undefined`, recibe `[]`). Revertir.
3. Quitar el guard `if (!session) throw` → el tercer test debe FALLAR (ya no lanza). Revertir.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/bun.lock backend/src/cardio/parseFit.ts backend/src/cardio/fitFixture.ts backend/src/cardio/parseFit.test.ts
git commit -S -m "feat(cardio): parser de .FIT con @garmin/fitsdk"
```

---

### Task 3: Ruta `POST /cardio/parse`

**Files:**
- Modify: `backend/src/routes/cardio.ts`
- Test: `backend/src/routes/cardio.test.ts` (**ya existe** con su arnés: `createApp(deps(fakeDb()) as any)` + `app.request("/cardio", ...)`, single-user, sin token). Append los tests de `/parse` reusando ese `deps`/`fakeDb` (la ruta `/parse` no toca la DB, así que cualquier `fakeDb` sirve).

Validaciones (patrón ECG): tamaño en chars de base64 → magic bytes `.FIT` en offset 8–11 → parseo en try/catch → 400. **Declarar `/parse` ANTES de `/:id`.**

- [ ] **Step 1: Escribir el test que falla**

Append en `backend/src/routes/cardio.test.ts`, reusando el `createApp`/`deps`/`fakeDb` ya definidos arriba en el archivo. Agregar `import { buildFitFixture } from "../cardio/fitFixture";` a los imports:

```ts
test("POST /cardio/parse devuelve el preview de un .FIT válido", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const fitB64 = Buffer.from(buildFitFixture({ sport: "walking", totalCalories: 150 })).toString("base64");
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: fitB64 }),
  });
  expect(res.status).toBe(200);
  const preview = await res.json();
  expect(preview.type).toBe("walk");
  expect(preview.kcal).toBe(150);
});

test("POST /cardio/parse rechaza algo que no es .FIT con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: Buffer.from("no soy un fit de verdad").toString("base64") }),
  });
  expect(res.status).toBe(400);
});

test("POST /cardio/parse rechaza un base64 demasiado grande con 400", async () => {
  const app = createApp(deps(fakeDb()) as any);
  const huge = "A".repeat(7_000_001);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: huge }),
  });
  expect(res.status).toBe(400);
});

test("POST /cardio/parse no queda capturada por /:id (orden de rutas)", async () => {
  // Con base64 vacío da 400 por magic bytes (lo tomó /parse). Si /:id la capturara, el POST
  // ni siquiera matchearía (no hay POST /:id) y daría 404.
  const app = createApp(deps(fakeDb()) as any);
  const res = await app.request("/cardio/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fitBase64: "" }),
  });
  expect(res.status).toBe(400);
});
```

> Si `ParseFitSchema` exige `fitBase64` con `min(1)`, el test de base64 vacío daría 400 por el schema (no por magic bytes) — igual es 400, el assert vale. Está bien.

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd backend && bun test src/routes/cardio.test.ts`
Expected: FAIL — `/cardio/parse` responde 404 (no existe la ruta).

- [ ] **Step 3: Implementar la ruta**

En `backend/src/routes/cardio.ts`:

1. Agregar imports arriba:
```ts
import { z } from "zod";
import { parseFit } from "../cardio/parseFit";
```
2. Definir el schema del body junto a `finiteQuery`:
```ts
const ParseFitSchema = z.object({ fitBase64: z.string().min(1) });
// Techo de 5 MB de archivo → ~6.9 MB de base64. Los .FIT típicos son 50-500 KB.
const MAX_FIT_B64 = 7_000_000;
```
3. Reemplazar el comentario placeholder (`// ⚠️ Cuando llegue POST /cardio/parse...`) por la ruta, **entre `r.get("/")` y `r.get("/:id")`**:
```ts
  // ⚠️ Literal ANTES de /:id, o el param `:id` captura "parse". Parsea un .FIT y devuelve el
  // preview SIN persistir (el archivo es solo transporte, no se guarda). Parseo = ms, sin runner async.
  r.post("/parse", async (c) => {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { return c.json({ error: "JSON inválido" }, 400); }
    const parsed = ParseFitSchema.safeParse(raw);
    if (!parsed.success) return c.json({ error: "Falta el archivo .FIT" }, 400);
    if (parsed.data.fitBase64.length > MAX_FIT_B64) return c.json({ error: "El archivo es demasiado grande (máx 5 MB)" }, 400);
    const buf = Buffer.from(parsed.data.fitBase64, "base64");
    // Magic bytes: el header FIT tiene ".FIT" en los bytes 8-11 (equivalente al %PDF del ECG).
    if (buf.length < 12 || buf.subarray(8, 12).toString("latin1") !== ".FIT") {
      return c.json({ error: "No parece un archivo .FIT" }, 400);
    }
    try {
      return c.json(parseFit(buf));
    } catch (e) {
      // Nunca un 500 con stack: cualquier fallo del parser es culpa del archivo → 400 legible.
      return c.json({ error: (e as Error).message || "No se pudo leer el archivo .FIT" }, 400);
    }
  });
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd backend && bun test src/routes/cardio.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verificación por mutación**

1. Mover la ruta `r.post("/parse", ...)` a DESPUÉS de `r.get("/:id")` y `r.patch("/:id")` — el POST no colisiona con GET/PATCH `:id`, así que este orden en particular no rompe (POST /parse sigue matcheando). En cambio, la mutación real: cambiar `buf.subarray(8, 12)` por `buf.subarray(0, 4)` → el primer test (fixture válido, que tiene el header size en el byte 0, no ".FIT") debe FALLAR con 400. Revertir.
2. Cambiar `> MAX_FIT_B64` por `> 999_999_999` → el test de tamaño debe FALLAR (ya no rechaza). Revertir.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/cardio.ts backend/src/routes/cardio.test.ts
git commit -S -m "feat(cardio): POST /cardio/parse — preview de .FIT sin persistir"
```

---

### Task 4: Cliente API móvil `parseFitCardio`

**Files:**
- Modify: `mobile/src/api/cardio.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `mobile/__tests__/cardio-fit.test.ts` (parte del test de `buildFitActivity` va en Task 5; acá solo el fetch). Mirar `mobile/__tests__/cardio-api.test.ts` para el patrón de mock de `apiFetch`/fetch:

```ts
import { parseFitCardio } from "../src/api/cardio";

test("parseFitCardio postea el base64 y devuelve el preview", async () => {
  const preview = { type: "walk", startedAt: 1, durationMs: 60000, distanceM: null, avgHr: null, maxHr: null, elevationGainM: null, kcal: 150 };
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => preview });
  // @ts-expect-error global fetch mock
  global.fetch = fetchMock;
  const res = await parseFitCardio("http://x", "QUJD");
  expect(res.kcal).toBe(150);
  const [, opts] = fetchMock.mock.calls[0];
  expect(JSON.parse(opts.body)).toEqual({ fitBase64: "QUJD" });
});

test("parseFitCardio lanza el mensaje del backend en 400", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "No parece un archivo .FIT" }) });
  // @ts-expect-error global fetch mock
  global.fetch = fetchMock;
  await expect(parseFitCardio("http://x", "bad")).rejects.toThrow(/No parece/);
});
```

> Nota: si `apiFetch` no usa el `fetch` global directamente, replicar el mock que ya usa `cardio-api.test.ts` (mock del módulo `./client`).

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd mobile && bun test __tests__/cardio-fit.test.ts`
Expected: FAIL — `parseFitCardio` no existe.

- [ ] **Step 3: Implementar el cliente**

Agregar en `mobile/src/api/cardio.ts`:

```ts
import type { CardioActivity, CardioFitPreview } from "@pulsia/shared";
```
(extender el import existente de `@pulsia/shared` con `CardioFitPreview`).

```ts
// Manda el .FIT (base64) a parsear. Devuelve el preview SIN persistir. En error, propaga el
// mensaje del backend (400 con "No parece un archivo .FIT", etc.) para mostrarlo tal cual.
export async function parseFitCardio(baseUrl: string, fitBase64: string): Promise<CardioFitPreview> {
  const res = await apiFetch(baseUrl, "/cardio/parse", { method: "POST", body: JSON.stringify({ fitBase64 }) });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo leer el archivo .FIT");
  }
  return (await res.json()) as CardioFitPreview;
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd mobile && bun test __tests__/cardio-fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificación por mutación**

Cambiar `JSON.stringify({ fitBase64 })` por `JSON.stringify({ fitBase64: "x" })` → el primer test debe FALLAR (body no matchea). Revertir. Cambiar `throw new Error(msg || ...)` por `return {} as any` → el segundo test debe FALLAR. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/api/cardio.ts mobile/__tests__/cardio-fit.test.ts
git commit -S -m "feat(cardio): cliente parseFitCardio en el móvil"
```

---

### Task 5: Helper puro `buildFitActivity`

**Files:**
- Create: `mobile/src/cardio/buildFitActivity.ts`
- Test: `mobile/__tests__/cardio-fit.test.ts` (append)

Convierte un preview + los campos del form (posiblemente editados) + un id en una `CardioActivity` con `source:"fit"`. Los campos device (`startedAt`, `kcal`, `maxHr`, `elevationGainM`, `hrSeries`) se arrastran del preview; `type`/`durationMs`/`distanceM`/`avgHr`/`notes` vienen del form. Testeable sin render.

- [ ] **Step 1: Escribir el test que falla**

Append en `mobile/__tests__/cardio-fit.test.ts`:

```ts
import { buildFitActivity } from "../src/cardio/buildFitActivity";
import type { CardioFitPreview } from "@pulsia/shared";

const preview: CardioFitPreview = {
  type: "walk", startedAt: 1_700_000_000_000, durationMs: 1_800_000,
  distanceM: 2500, avgHr: 110, maxHr: 130, elevationGainM: 12, kcal: 150,
  hrSeries: [{ t: 0, bpm: 108 }],
};

test("buildFitActivity arrastra los campos device y usa el form para lo editable", () => {
  const a = buildFitActivity(
    preview,
    { type: "run", durationMs: 1_800_000, distanceM: 2500, avgHr: 110, notes: "corregí el tipo" },
    "11111111-1111-1111-1111-111111111111",
  );
  expect(a.source).toBe("fit");
  expect(a.type).toBe("run"); // del form (usuario corrigió)
  expect(a.startedAt).toBe(1_700_000_000_000); // del preview
  expect(a.kcal).toBe(150);
  expect(a.kcalSource).toBe("device"); // hay kcal + source fit
  expect(a.maxHr).toBe(130);
  expect(a.hrSeries).toEqual([{ t: 0, bpm: 108 }]);
  expect(a.notes).toBe("corregí el tipo");
});

test("buildFitActivity marca estimate cuando el .FIT no trae kcal", () => {
  const a = buildFitActivity(
    { ...preview, kcal: null },
    { type: "walk", durationMs: 1_800_000, distanceM: null, avgHr: null, notes: "" },
    "22222222-2222-2222-2222-222222222222",
  );
  expect(a.kcal).toBeNull();
  expect(a.kcalSource).toBe("estimate");
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd mobile && bun test __tests__/cardio-fit.test.ts`
Expected: FAIL — `buildFitActivity` no existe.

- [ ] **Step 3: Implementar el helper**

Crear `mobile/src/cardio/buildFitActivity.ts`:

```ts
import type { CardioActivity, CardioFitPreview, CardioType } from "@pulsia/shared";

export interface FitFormFields {
  type: CardioType;
  durationMs: number;
  distanceM: number | null;
  avgHr: number | null;
  notes: string;
}

// Arma la CardioActivity a confirmar desde un preview de .FIT. Los campos que el reloj mide y el
// usuario no toca (startedAt, kcal, maxHr, elevación, hrSeries) salen del preview; el resto del form.
// `kcalSource` se setea igual que lo deriva el server (kcal + source fit → device); el server lo
// re-deriva de todos modos, esto es solo optimista para el estado local.
export function buildFitActivity(preview: CardioFitPreview, form: FitFormFields, id: string): CardioActivity {
  return {
    id,
    type: form.type,
    startedAt: preview.startedAt,
    durationMs: form.durationMs,
    distanceM: form.distanceM,
    avgHr: form.avgHr,
    maxHr: preview.maxHr,
    elevationGainM: preview.elevationGainM,
    kcal: preview.kcal,
    kcalSource: preview.kcal != null ? "device" : "estimate",
    source: "fit",
    hrSeries: preview.hrSeries,
    notes: form.notes,
  };
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `cd mobile && bun test __tests__/cardio-fit.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Verificación por mutación**

1. Cambiar `startedAt: preview.startedAt` por `startedAt: Date.now()` → el primer test debe FALLAR. Revertir.
2. Cambiar `kcalSource: preview.kcal != null ? "device" : "estimate"` por `"device"` fijo → el segundo test debe FALLAR. Revertir.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/cardio/buildFitActivity.ts mobile/__tests__/cardio-fit.test.ts
git commit -S -m "feat(cardio): buildFitActivity — preview .FIT a actividad confirmable"
```

---

### Task 6: Camino de import en `cardio.tsx`

**Files:**
- Modify: `mobile/app/cardio.tsx`

Agregar un botón "Importar archivo .FIT" (solo en modo alta, no en edición). Flujo: picker (`type: "*/*"`, porque `.fit` no tiene MIME registrado) → base64 → `parseFitCardio` → prefill de los campos del form + guardar el preview en estado → banner "Importado — revisá y confirmá" → al guardar, si hay preview, se usa `buildFitActivity` (source:"fit") en vez del alta manual.

- [ ] **Step 1: Imports y estado**

En `mobile/app/cardio.tsx`:
1. Agregar imports:
```ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { parseFitCardio } from "../src/api/cardio";
import { buildFitActivity } from "../src/cardio/buildFitActivity";
import type { CardioFitPreview } from "@pulsia/shared";
```
   (extender el import de `@pulsia/shared` existente con `CardioFitPreview` si preferís una sola línea.)
2. Agregar estado junto a los otros `useState`:
```ts
const [fitPreview, setFitPreview] = useState<CardioFitPreview | null>(null);
const [importing, setImporting] = useState(false);
```

- [ ] **Step 2: Handler de import**

Agregar dentro del componente, antes del `return`:

```ts
async function onImportFit() {
  const url = baseUrl.current;
  if (!url) {
    setError("Configurá el backend");
    return;
  }
  setError(null);
  let picked;
  try {
    // `.fit` no tiene MIME estándar registrado → hay que abrir "*/*".
    picked = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
  } catch {
    setError("No se pudo abrir el selector de archivos");
    return;
  }
  if (picked.canceled || !picked.assets || picked.assets.length === 0) return;
  setImporting(true);
  try {
    const base64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: "base64" });
    const preview = await parseFitCardio(url, base64);
    setFitPreview(preview);
    // Prefill de los campos editables con lo que midió el reloj.
    setType(preview.type);
    setDurationText(numText(Math.round(preview.durationMs / 60000)));
    setDistanceText(preview.distanceM != null ? numText(preview.distanceM / 1000) : "");
    setHrText(preview.avgHr != null ? String(preview.avgHr) : "");
  } catch (e) {
    setError((e as Error).message || "No se pudo leer el archivo .FIT");
  } finally {
    setImporting(false);
  }
}
```

- [ ] **Step 3: Ramificar el guardado**

En `onCreate`, después de `if (!fields) return;`, insertar la rama de import antes de armar el objeto manual:

```ts
    // Si venimos de un import .FIT, confirmamos ese preview (source:"fit", kcal/FC del reloj).
    if (fitPreview) {
      const activity = buildFitActivity(
        fitPreview,
        { type, durationMs: fields.durationMs, distanceM: fields.distanceM, avgHr: fields.avgHr, notes },
        newSessionId(),
      );
      const parsed = CardioActivitySchema.safeParse(activity);
      if (!parsed.success) {
        setError("Datos inválidos, revisá los campos");
        return;
      }
      setSaving(true);
      try {
        await createCardio(url, parsed.data);
        router.back();
      } catch (e) {
        setError((e as Error).message || "No se pudo guardar la actividad");
      } finally {
        setSaving(false);
      }
      return;
    }
```

- [ ] **Step 4: UI del botón + banner**

Dentro del `<>...</>` de alta (no edición), arriba del bloque "Tipo", agregar:

```tsx
{!isEdit && (
  <>
    <Pressable
      testID="cardio-import-fit"
      onPress={onImportFit}
      disabled={importing}
      style={{
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        alignItems: "center",
        opacity: importing ? 0.6 : 1,
      }}
    >
      {importing ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={{ color: colors.accentText, fontWeight: "600" }}>Importar archivo .FIT</Text>
      )}
    </Pressable>
    {fitPreview && (
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Importado del reloj{fitPreview.kcal != null ? ` · ${fitPreview.kcal} kcal medidas` : ""}. Revisá el tipo y confirmá.
      </Text>
    )}
  </>
)}
```

- [ ] **Step 5: Verificación manual (typecheck + tests existentes)**

Run: `cd mobile && bun test` y `cd mobile && bunx tsc --noEmit` (o el script de typecheck del repo; verificá en `mobile/package.json`).
Expected: sin errores de tipo; todos los tests verdes. (La pantalla en sí no tiene test de render; la lógica extraída ya está cubierta por `buildFitActivity` y `parseFitCardio`.)

- [ ] **Step 6: Commit**

```bash
git add mobile/app/cardio.tsx
git commit -S -m "feat(cardio): importar .FIT desde la pantalla de alta (picker + preview + confirmar)"
```

---

### Task 7: PR + review

- [ ] **Step 1: Verificación final de toda la fase**

```bash
cd shared && bun test
cd ../backend && bun test
cd ../mobile && bun test
```
Expected: todo verde en los tres workspaces.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/cardio-fase3-import-fit
gh pr create --title "feat(cardio): import .FIT (fase 3)" --body "<resumen: parser backend con @garmin/fitsdk, POST /cardio/parse sin persistir, camino de import en cardio.tsx con preview>"
```

- [ ] **Step 3: Disparar reviews**

Comentar `@claude review` y `@coderabbitai review` en el PR. Esperar, evaluar hallazgos (skill receiving-code-review), aplicar los válidos, re-review.

- [ ] **Step 4: Merge (squash) tras aprobación** — solo con OK del usuario, según la convención de la sesión.

---

## Notas de integración

- **OTA:** este PR agrega una dep **solo al backend** (`@garmin/fitsdk`) → no re-basa el fingerprint del móvil. El móvil solo cambia JS (reusa `expo-document-picker` + `expo-file-system`, ya instalados por el ECG). **Llega por OTA a vc10** (runtime `784872cbc4d3628548bb75567f088dec209dcf87`). Verificar el runtime al publicar (ver memoria `ota-fingerprint-gotcha`).
- **El detalle con `LineChart` de la curva de FC** (spec §9) ya se cubre por el `hrSeries` que arrastra el import; si el detalle de cardio aún no renderiza la curva, es un follow-up menor, no parte de esta fase.
- **Fase 4 (wiring del balance #2b)** queda para el próximo PR: migrar `useNutritionDay.ts:63` y `reports/collect.ts:97` de `sumDayExerciseBurn` a `dayExerciseBurn`, borrar `sumDayExerciseBurn`, corregir textos de UI.
