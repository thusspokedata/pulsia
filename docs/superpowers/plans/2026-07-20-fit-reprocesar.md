# Reprocesar el `.FIT` guardado — Fase 3 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD por task. Commits firmados (`git commit -S`), SIN `Co-Authored-By`.

**Goal:** rellenar los datos ricos de una actividad desde el `.FIT` crudo ya guardado, sin que el usuario reimporte.

**Architecture:** una función núcleo `reprocessActivity` (lee bytes → `parseFit` → UPDATE selectivo) con dos disparadores: un endpoint por actividad y uno masivo. Preserva lo que el formulario puede editar y refresca el resto.

**Tech Stack:** Bun, Hono, Drizzle/Postgres, Zod, React Native/Expo.

**Verify:** `bun run typecheck && bun run test && bun run test:mobile`

**⚠️ Worktree aislado:** trabajar SIEMPRE en `/tmp/pulsia-fase3`. Hay otras sesiones sobre `~/desarrollo26/pulsia`; no tocarlo. Correr `bun install` una vez.

**⚠️ Privacidad:** repo público. Fixtures **sintéticos**, nunca datos reales del usuario.

**Contexto de lo que ya existe:**
- `parseFit(buffer: Buffer): CardioFitPreview` en `backend/src/cardio/parseFit.ts` — puro, tira `Error` legible si el archivo no sirve.
- `buildFitFixture(opts)` en `backend/src/cardio/fitFixture.ts` sintetiza un `.FIT` válido (`Uint8Array`).
- Tabla `cardioFitFile` (`backend/src/db/schema.ts:351`): `activityId` uuid PK → `cardioActivity.id` cascade, `bytes` bytea, `sizeBytes`, `sha256`, `createdAt`.
- `backend/src/cardio/repository.ts` importa `{ and, eq, gte, lte, desc }` de drizzle y `{ cardioActivity, cardioFitFile }` del schema. Tiene `toActivity(row)`, `getCardio`, `updateCardio` (solo `type`/`durationMs`/`distanceM`/`notes`), `insertCardio` (que lista los 15 campos derivados — usarlo como referencia de nombres).
- `backend/src/routes/cardio.ts` tiene `r.post("/")`, `r.get("/")`, `r.post("/parse")`, `r.get("/:id")`, `r.patch("/:id")`, `r.delete("/:id")`.

---

## Task 1 — `hasFitFile` en el detalle

**Files:** `shared/src/schemas/cardio.ts`, `backend/src/cardio/repository.ts`, `backend/src/cardio/repository.test.ts`

- [ ] **1.1** En `shared/src/schemas/cardio.ts`, agregar a `CardioActivitySchema` (NO al preview):
```ts
  // Solo lo llena el DETALLE (getCardio): dice si hay un .FIT crudo guardado que se pueda
  // reprocesar. El listado no lo trae (sigue liviano).
  hasFitFile: z.boolean().optional(),
```

- [ ] **1.2** Test primero, en `backend/src/cardio/repository.test.ts`:
```ts
test("getCardio devuelve hasFitFile true cuando hay archivo guardado", async () => {
  const row = { id: AID, type: "run", startedAt: 1, durationMs: 1000, distanceM: null,
    avgHr: null, maxHr: null, elevationGainM: null, kcal: null, kcalSource: "device",
    source: "fit", hrSeries: null, notes: "", totalCycles: null, trainingLoad: null,
    trainingEffectAerobic: null, trainingEffectAnaerobic: null, avgCadence: null,
    maxCadence: null, avgFractionalCadence: null, avgRespiration: null, maxRespiration: null,
    minRespiration: null, metabolicKcal: null, sportProfileName: null, tzOffsetMinutes: null,
    samples: null, fitExtras: null };
  const db: any = {
    select: (proj?: any) => ({
      from: () => ({
        where: async () => (proj && proj.activityId ? [{ activityId: AID }] : [row]),
      }),
    }),
  };
  const res = await getCardio(db, AID, UID);
  expect(res?.hasFitFile).toBe(true);
});

test("getCardio devuelve hasFitFile false cuando no hay archivo", async () => {
  const row = { id: AID, type: "run", startedAt: 1, durationMs: 1000, distanceM: null,
    avgHr: null, maxHr: null, elevationGainM: null, kcal: null, kcalSource: "estimate",
    source: "manual", hrSeries: null, notes: "", totalCycles: null, trainingLoad: null,
    trainingEffectAerobic: null, trainingEffectAnaerobic: null, avgCadence: null,
    maxCadence: null, avgFractionalCadence: null, avgRespiration: null, maxRespiration: null,
    minRespiration: null, metabolicKcal: null, sportProfileName: null, tzOffsetMinutes: null,
    samples: null, fitExtras: null };
  const db: any = {
    select: (proj?: any) => ({
      from: () => ({ where: async () => (proj && proj.activityId ? [] : [row]) }),
    }),
  };
  expect((await getCardio(db, AID, UID))?.hasFitFile).toBe(false);
});
```

- [ ] **1.3** Correr → FAIL. `bun test backend/src/cardio/repository.test.ts`

- [ ] **1.4** En `repository.ts`, cambiar `getCardio` para consultar la existencia del archivo sin
  traer el binario:
```ts
export async function getCardio(db: Db, id: string, userId: string): Promise<CardioActivity | null> {
  const rows = await db.select().from(cardioActivity)
    .where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId)));
  if (!rows[0]) return null;
  // Solo el id: saber SI hay archivo no debe arrastrar los bytes (pueden ser cientos de KB).
  const files = await db.select({ activityId: cardioFitFile.activityId }).from(cardioFitFile)
    .where(eq(cardioFitFile.activityId, id));
  return { ...toActivity(rows[0]), hasFitFile: files.length > 0 };
}
```

- [ ] **1.5** Correr tests + `bun run --filter @pulsia/backend typecheck` → 0.
  Commit: `feat(fit): el detalle informa si hay .FIT guardado`

---

## Task 2 — Repositorio: leer bytes, actualizar derivados, listar reprocesables

**Files:** `backend/src/cardio/repository.ts`, `backend/src/cardio/repository.test.ts`

- [ ] **2.1** Tests primero:
```ts
test("getCardioFitFileBytes devuelve los bytes si la actividad es del usuario", async () => {
  const db: any = { select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => [{ bytes: Buffer.from("abc") }] }) }) }) };
  const b = await getCardioFitFileBytes(db, AID, UID);
  expect(b?.toString()).toBe("abc");
});

test("getCardioFitFileBytes devuelve null si no hay fila (o es de otro usuario)", async () => {
  const db: any = { select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => [] }) }) }) };
  expect(await getCardioFitFileBytes(db, AID, UID)).toBeNull();
});

test("listReprocessableIds devuelve los ids con archivo guardado", async () => {
  const db: any = { select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => [{ id: AID }, { id: "otro" }] }) }) }) };
  expect(await listReprocessableIds(db, UID)).toEqual([AID, "otro"]);
});

test("updateCardioFromFit setea los derivados y NO toca los editables", async () => {
  let seen: any;
  const db: any = { update: () => ({ set: (s: any) => { seen = s; return { where: async () => {} }; } }) };
  await updateCardioFromFit(db, AID, UID, {
    maxHr: 180, elevationGainM: 10, kcal: 300, totalCycles: 1000, trainingLoad: 50,
    trainingEffectAerobic: 3, trainingEffectAnaerobic: 0, avgCadence: 60, maxCadence: 80,
    avgFractionalCadence: 0.5, avgRespiration: 20, maxRespiration: 30, minRespiration: 10,
    metabolicKcal: 40, sportProfileName: "Test", tzOffsetMinutes: 60,
    samples: { t: [0], hr: [100] }, fitExtras: {},
  });
  expect(seen.totalCycles).toBe(1000);
  expect(seen.samples).toEqual({ t: [0], hr: [100] });
  // Los editables por el formulario NUNCA se tocan.
  expect(seen).not.toHaveProperty("type");
  expect(seen).not.toHaveProperty("durationMs");
  expect(seen).not.toHaveProperty("distanceM");
  expect(seen).not.toHaveProperty("avgHr");
  expect(seen).not.toHaveProperty("notes");
});
```

- [ ] **2.2** Correr → FAIL.

- [ ] **2.3** Implementar en `repository.ts` (el import de drizzle ya tiene `and`/`eq`):
```ts
// Bytes del .FIT de una actividad, validando dueño con un join: una actividad de otro usuario
// se comporta como inexistente (no filtramos su existencia).
export async function getCardioFitFileBytes(db: Db, activityId: string, userId: string): Promise<Buffer | null> {
  const rows = await db.select({ bytes: cardioFitFile.bytes })
    .from(cardioFitFile)
    .innerJoin(cardioActivity, eq(cardioActivity.id, cardioFitFile.activityId))
    .where(and(eq(cardioFitFile.activityId, activityId), eq(cardioActivity.userId, userId)));
  return rows[0]?.bytes ?? null;
}

// Ids del usuario que TIENEN archivo guardado — los únicos reprocesables. Sin traer binarios.
export async function listReprocessableIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ id: cardioActivity.id })
    .from(cardioActivity)
    .innerJoin(cardioFitFile, eq(cardioFitFile.activityId, cardioActivity.id))
    .where(eq(cardioActivity.userId, userId));
  return rows.map((r) => r.id);
}

// Campos que el reproceso REFRESCA desde el archivo. Deliberadamente NO incluye los que el
// formulario de edición puede tocar (type, durationMs, distanceM, avgHr, notes): una corrección
// manual del usuario no debe perderse al reprocesar. Es la misma costura que sobreescribe
// buildFitActivity en el móvil.
export type FitDerived = Pick<CardioActivity,
  "maxHr" | "elevationGainM" | "kcal" | "totalCycles" | "trainingLoad"
  | "trainingEffectAerobic" | "trainingEffectAnaerobic" | "avgCadence" | "maxCadence"
  | "avgFractionalCadence" | "avgRespiration" | "maxRespiration" | "minRespiration"
  | "metabolicKcal" | "sportProfileName" | "tzOffsetMinutes" | "samples" | "fitExtras">;

export async function updateCardioFromFit(db: Db, id: string, userId: string, d: FitDerived): Promise<void> {
  await db.update(cardioActivity).set({
    maxHr: d.maxHr ?? null, elevationGainM: d.elevationGainM ?? null, kcal: d.kcal ?? null,
    totalCycles: d.totalCycles ?? null, trainingLoad: d.trainingLoad ?? null,
    trainingEffectAerobic: d.trainingEffectAerobic ?? null,
    trainingEffectAnaerobic: d.trainingEffectAnaerobic ?? null,
    avgCadence: d.avgCadence ?? null, maxCadence: d.maxCadence ?? null,
    avgFractionalCadence: d.avgFractionalCadence ?? null,
    avgRespiration: d.avgRespiration ?? null, maxRespiration: d.maxRespiration ?? null,
    minRespiration: d.minRespiration ?? null, metabolicKcal: d.metabolicKcal ?? null,
    sportProfileName: d.sportProfileName ?? null, tzOffsetMinutes: d.tzOffsetMinutes ?? null,
    samples: d.samples ?? null, fitExtras: d.fitExtras ?? null,
    updatedAt: new Date(),
  }).where(and(eq(cardioActivity.id, id), eq(cardioActivity.userId, userId)));
}
```

- [ ] **2.4** Tests PASS + typecheck 0. Commit: `feat(fit): repositorio para reprocesar (bytes, derivados, listado)`

---

## Task 3 — El núcleo `reprocessActivity`

**Files:** crear `backend/src/cardio/reprocess.ts` + `backend/src/cardio/reprocess.test.ts`

- [ ] **3.1** Tests primero, contra el fixture SINTÉTICO:
```ts
import { test, expect } from "bun:test";
import { reprocessActivity } from "./reprocess";
import { buildFitFixture } from "./fitFixture";

const AID = "22222222-2222-4222-8222-222222222222";
const UID = "33333333-3333-4333-8333-333333333333";

function dbWith(bytes: Buffer | null) {
  const updates: any[] = [];
  const db: any = {
    _updates: updates,
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => (bytes ? [{ bytes }] : []) }) }) }),
    update: () => ({ set: (s: any) => { updates.push(s); return { where: async () => {} }; } }),
  };
  return db;
}

test("reprocessActivity rellena los derivados desde el archivo guardado", async () => {
  const db = dbWith(Buffer.from(buildFitFixture({ sport: "walking", totalCalories: 150 })));
  const res = await reprocessActivity(db, AID, UID);
  expect(res.status).toBe("ok");
  expect(db._updates).toHaveLength(1);
  expect(db._updates[0].samples).toBeDefined();
  expect(db._updates[0].kcal).toBe(150);
});

test("reprocessActivity NO toca los campos editables del formulario", async () => {
  const db = dbWith(Buffer.from(buildFitFixture({ sport: "walking" })));
  await reprocessActivity(db, AID, UID);
  const patch = db._updates[0];
  for (const k of ["type", "durationMs", "distanceM", "avgHr", "notes"]) {
    expect(patch).not.toHaveProperty(k);
  }
});

test("sin archivo guardado devuelve no-file y no actualiza nada", async () => {
  const db = dbWith(null);
  expect((await reprocessActivity(db, AID, UID)).status).toBe("no-file");
  expect(db._updates).toHaveLength(0);
});

test("un archivo que no parsea devuelve parse-error y deja la fila intacta", async () => {
  const db = dbWith(Buffer.from("esto no es un .FIT"));
  const res = await reprocessActivity(db, AID, UID);
  expect(res.status).toBe("parse-error");
  expect(res.message).toBeTruthy();
  expect(db._updates).toHaveLength(0);
});
```

- [ ] **3.2** Correr → FAIL.

- [ ] **3.3** Implementar `backend/src/cardio/reprocess.ts`:
```ts
import type { Db } from "../db/client";
import { parseFit } from "./parseFit";
import { getCardioFitFileBytes, updateCardioFromFit } from "./repository";

export type ReprocessResult =
  | { status: "ok" }
  | { status: "no-file" }
  | { status: "parse-error"; message: string };

// Rellena los datos ricos de una actividad releyendo el .FIT que ya está guardado. Existe porque
// el archivo crudo se persiste (Fase 1): lo que hoy no sabemos leer se puede extraer después sin
// pedirle al usuario que reimporte nada.
// NUNCA toca lo que el usuario pudo editar a mano (ver FitDerived en repository.ts).
export async function reprocessActivity(db: Db, id: string, userId: string): Promise<ReprocessResult> {
  const bytes = await getCardioFitFileBytes(db, id, userId);
  if (!bytes) return { status: "no-file" };
  let preview;
  try {
    preview = parseFit(bytes);
  } catch (e) {
    // El archivo guardado ya no parsea (corrupto, o un cambio del parser): la actividad queda
    // INTACTA. Un reproceso fallido nunca debe empeorar lo que ya había.
    return { status: "parse-error", message: (e as Error).message || "no se pudo leer el .FIT guardado" };
  }
  await updateCardioFromFit(db, id, userId, {
    maxHr: preview.maxHr, elevationGainM: preview.elevationGainM, kcal: preview.kcal,
    totalCycles: preview.totalCycles, trainingLoad: preview.trainingLoad,
    trainingEffectAerobic: preview.trainingEffectAerobic,
    trainingEffectAnaerobic: preview.trainingEffectAnaerobic,
    avgCadence: preview.avgCadence, maxCadence: preview.maxCadence,
    avgFractionalCadence: preview.avgFractionalCadence,
    avgRespiration: preview.avgRespiration, maxRespiration: preview.maxRespiration,
    minRespiration: preview.minRespiration, metabolicKcal: preview.metabolicKcal,
    sportProfileName: preview.sportProfileName, tzOffsetMinutes: preview.tzOffsetMinutes,
    samples: preview.samples, fitExtras: preview.fitExtras,
  });
  return { status: "ok" };
}
```

- [ ] **3.4** Tests PASS + typecheck 0. Commit: `feat(fit): reprocessActivity — releer el .FIT guardado`

---

## Task 4 — Rutas

**Files:** `backend/src/routes/cardio.ts`, `backend/src/routes/cardio.test.ts`

- [ ] **4.1** Tests primero, con la fake-db del archivo (mirar cómo la arma, `fakeDb`):
```ts
test("POST /cardio/:id/reprocess devuelve 200 cuando hay archivo", async () => {
  const db = fakeDbReprocess(Buffer.from(buildFitFixture({ sport: "walking" })));
  const app = createApp(deps(db) as any);
  const res = await app.request(`/cardio/${AID}/reprocess`, { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("POST /cardio/:id/reprocess sin archivo → 404 legible", async () => {
  const app = createApp(deps(fakeDbReprocess(null)) as any);
  const res = await app.request(`/cardio/${AID}/reprocess`, { method: "POST" });
  expect(res.status).toBe(404);
});

test("POST /cardio/:id/reprocess con archivo corrupto → 400", async () => {
  const app = createApp(deps(fakeDbReprocess(Buffer.from("no es fit"))) as any);
  const res = await app.request(`/cardio/${AID}/reprocess`, { method: "POST" });
  expect(res.status).toBe(400);
});

test("POST /cardio/reprocess-all cuenta las reprocesadas", async () => {
  const app = createApp(deps(fakeDbReprocessAll([AID], Buffer.from(buildFitFixture({ sport: "walking" })))) as any);
  const res = await app.request("/cardio/reprocess-all", { method: "POST" });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ reprocesadas: 1, sinArchivo: 0, fallidas: 0 });
});
```
Escribir `fakeDbReprocess(bytes)` y `fakeDbReprocessAll(ids, bytes)` como helpers locales del test,
siguiendo el estilo de `fakeDb` existente: `select()` sin proyección → filas de actividad;
`select({bytes})` con `.innerJoin().where()` → `bytes ? [{bytes}] : []`; `select({id})` con
`.innerJoin().where()` → los ids; `update().set().where()` → registra.

- [ ] **4.2** Correr → FAIL (404 por ruta inexistente).

- [ ] **4.3** En `routes/cardio.ts`, importar `reprocessActivity` y `listReprocessableIds`, y
  registrar **ANTES de `r.get("/:id")`** (el masivo es literal y no debe ser capturado como id):
```ts
  // Reproceso masivo: la herramienta para después de mejorar el parser. Acotado al usuario del
  // token. Una actividad que falla NO aborta el lote: se cuenta y se sigue.
  r.post("/reprocess-all", async (c) => {
    const userId = c.get("userId");
    const ids = await listReprocessableIds(deps.db, userId);
    let reprocesadas = 0, sinArchivo = 0, fallidas = 0;
    for (const id of ids) {
      const res = await reprocessActivity(deps.db, id, userId);
      if (res.status === "ok") reprocesadas++;
      else if (res.status === "no-file") sinArchivo++;
      else fallidas++;
    }
    return c.json({ reprocesadas, sinArchivo, fallidas });
  });

  r.post("/:id/reprocess", async (c) => {
    const res = await reprocessActivity(deps.db, c.req.param("id"), c.get("userId"));
    if (res.status === "no-file") return c.json({ error: "esta actividad no tiene archivo guardado" }, 404);
    if (res.status === "parse-error") return c.json({ error: res.message }, 400);
    return c.json({ status: "ok" });
  });
```

- [ ] **4.4** Tests PASS + `bun run test` (shared+backend) → 0 fail + typecheck 0.
  Commit: `feat(fit): endpoints de reproceso (por actividad y masivo)`

---

## Task 5 — Móvil: clientes + botón en el detalle

**Files:** `mobile/src/api/cardio.ts`, `mobile/app/actividad.tsx`, `mobile/__tests__/cardio-api.test.ts`, `mobile/__tests__/actividad.test.tsx`

- [ ] **5.1** Clientes en `mobile/src/api/cardio.ts`:
```ts
// Rellena los datos de una actividad releyendo el .FIT guardado en el server. Propaga el mensaje
// del backend (404 "no tiene archivo guardado" / 400 archivo ilegible) para mostrarlo tal cual.
export async function reprocessCardio(baseUrl: string, id: string): Promise<void> {
  const res = await apiFetch(baseUrl, `/cardio/${id}/reprocess`, { method: "POST" });
  if (!res.ok) {
    const msg = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new Error(msg || "No se pudo reprocesar la actividad");
  }
}

export async function reprocessAllCardio(baseUrl: string): Promise<{ reprocesadas: number; sinArchivo: number; fallidas: number }> {
  const res = await apiFetch(baseUrl, "/cardio/reprocess-all", { method: "POST" });
  if (!res.ok) throw new Error("No se pudieron reprocesar las actividades");
  return await res.json();
}
```
Test en `mobile/__tests__/cardio-api.test.ts` (mismo estilo de fetch mockeado del archivo): que
`reprocessCardio` pegue a `/cardio/<id>/reprocess` con `POST`, y que propague el mensaje de error
del backend.

- [ ] **5.2** En `mobile/app/actividad.tsx`, agregar el botón. Estado local
  `const [reproc, setReproc] = useState(false)` y una función:
```tsx
  async function onReprocess() {
    const url = baseUrl.current;
    if (!url) return;
    setReproc(true);
    setError(null);
    try {
      await reprocessCardio(url, id);
      // Recargar para que aparezcan tiles, gráficos y zonas.
      setActivity(await getCardioById(url, id));
    } catch (e) {
      setError((e as Error).message || "No se pudo reprocesar");
    } finally {
      setReproc(false);
    }
  }
```
  Y renderizarlo **solo** cuando haya archivo y falten datos, arriba del botón "Editar":
```tsx
      {a.source === "fit" && a.hasFitFile && !a.samples ? (
        <View style={{ gap: spacing.xs }}>
          <Pressable testID="reprocesar" onPress={onReprocess} disabled={reproc}
            style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: reproc ? 0.6 : 1 }}>
            {reproc ? <ActivityIndicator color={colors.accent} /> : (
              <Text style={{ color: colors.accentText, fontWeight: "600" }}>Reprocesar desde el archivo</Text>
            )}
          </Pressable>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Esta actividad se importó antes de que se guardara todo el detalle. El archivo original está
            guardado, así que se puede completar sin reimportar.
          </Text>
        </View>
      ) : null}
```

- [ ] **5.3** Tests en `mobile/__tests__/actividad.test.tsx`:
  - actividad con `hasFitFile: true`, `source: "fit"`, sin `samples` → el testID `reprocesar` aparece.
  - actividad con `samples` presente → NO aparece.
  - actividad `source: "manual"` → NO aparece.
  Fixtures inventados.

- [ ] **5.4** `bun run --filter @pulsia/mobile test` (suite completa) → 0 fail; typecheck 0.
  Commit: `feat(fit): botón para reprocesar la actividad desde el archivo`

---

## Task 6 — Configuración: reproceso masivo

**Files:** `mobile/app/configuracion.tsx`

- [ ] **6.1** LEER `mobile/app/configuracion.tsx` para copiar el patrón de sus acciones existentes
  (cómo arma cada bloque, cómo maneja loading y cómo muestra resultados).

- [ ] **6.2** Agregar una acción **"Reprocesar actividades de Garmin"** que llame a
  `reprocessAllCardio(url)` y muestre el resumen: `"N reprocesadas · M sin archivo · K fallidas"`.
  Spinner mientras corre; error legible si falla. Usar los tokens de tema que ya usa ese archivo.

- [ ] **6.3** `bun run --filter @pulsia/mobile test` → 0 fail; typecheck 0.
  Commit: `feat(fit): reproceso masivo desde Configuración`

---

## Task 7 — Verificación final

- [ ] `bun run typecheck` → 0
- [ ] `bun run test` → 0 fail (OJO: `bun run test`, NO `bun test`)
- [ ] `bun run test:mobile` → 0 fail (hay flakiness conocida bajo carga: si falla algo no relacionado, re-correr y decirlo)
- [ ] `git status` limpio, sin `.fit` ni archivos temporales sin trackear.

## Self-review

- **Cobertura del spec:** núcleo `reprocessActivity` con los 4 estados (T3) ✓; preserva editables /
  refresca derivados (T2 `FitDerived` + T3, con test explícito) ✓; validación de dueño por join (T2) ✓;
  `hasFitFile` en el detalle sin traer binario (T1) ✓; endpoint por actividad (T4) ✓; masivo acotado al
  usuario y que no aborta por una fallida (T4) ✓; clientes móviles (T5.1) ✓; botón condicionado a
  `hasFitFile && !samples` (T5.2) ✓; masivo en Configuración (T6) ✓; errores legibles y fila intacta
  ante fallo (T3/T4) ✓; fixtures sintéticos ✓.
- **Placeholders:** ninguno. T1–T5 llevan código completo; T6 lleva la especificación exacta porque el
  estilo debe salir del archivo real, que el implementador tiene que leer.
- **Consistencia:** `FitDerived`/`updateCardioFromFit`/`getCardioFitFileBytes`/`listReprocessableIds`
  definidos en T2 y consumidos con la misma firma en T3/T4; `ReprocessResult` definido en T3 y mapeado
  en T4; `reprocessCardio`/`reprocessAllCardio` definidos en T5.1 y usados en T5.2/T6; `hasFitFile`
  definido en T1 y usado en T5.2.
