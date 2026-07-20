# Detalle de actividad de cardio — Fase 2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD por task. Commits firmados (`git commit -S`), SIN `Co-Authored-By`.

**Goal:** una pantalla de solo lectura que muestre lo que la Fase 1 ya captura del `.FIT`: tiles, gráficos multicanal, tiempo en zonas y detalles técnicos.

**Architecture:** **Cero backend nuevo.** `getCardioById` ya devuelve `samples` y `fitExtras`. La lógica que importa es **pura** (`cardioSeries`, `activityFormat`) y se testea sin renderizar; la pantalla solo compone.

**Tech Stack:** React Native / Expo Router, jest.

**Verify:** `bun run typecheck && bun run test && bun run test:mobile`

**⚠️ Worktree aislado:** trabajar SIEMPRE en `/tmp/pulsia-fase2`. Hay otras sesiones sobre `~/desarrollo26/pulsia`; no tocarlo. El worktree necesita `bun install` una vez.

**⚠️ Privacidad:** el repo es público. Fixtures **sintéticos**, nunca datos reales del usuario.

**Contexto de lo que ya existe:**
- `LineChart({ data: XY[], height?, unit?, refLine? })` donde `XY = {x, y}` (`mobile/src/session/chart`). **Ojo:** si `data` está vacío renderiza el texto "Sin datos todavía." → la pantalla **no debe montarlo** cuando no hay datos, en vez de dejar ese texto suelto.
- `mobile/src/cardio/hrPoints.ts` tiene `cardioHrPoints(a)` → `{t,bpm}[]`, escrito en la Fase 1 y **sin conectar** (no había consumidor). Se absorbe en `cardioSeries.ts`.
- `historial.tsx` → `onOpenCardio` hace `router.push('/cardio?id=…')` (el formulario).
- `CardioSamples` = `{ t: number[], hr?, cad?, fracCad?, resp?, cycleLen?: (number|null)[], unknown?: Record<string,(number|null)[]> }`.
- `CardioFitExtras` = `{ zones?: {secondsPerZone, highBoundary, maxHr, restingHr, thresholdHr, calcType}, athlete?, devices?, laps?, events? }`.

---

## Task 1 — `cardioSeries.ts` (lógica pura de canales)

**Files:** crear `mobile/src/cardio/cardioSeries.ts` + `mobile/__tests__/cardio-series.test.ts`; borrar `mobile/src/cardio/hrPoints.ts` y `mobile/__tests__/cardio-hr-points.test.ts`

- [ ] **1.1** Escribir el test primero:
```ts
import { channelPoints, CHANNELS } from "../src/cardio/cardioSeries";

const samples = {
  t: [0, 1000, 2000, 3000],
  hr: [100, 110, null, 120],
  cad: [50, 51, 52, 53],
  resp: [null, 15.5, null, 16.0],       // disperso, como en la realidad
  unknown: { "143": [60, 60, 59, 58] }, // Body Battery (inferido)
};

test("channelPoints descarta los huecos y mantiene el pareo t/valor", () => {
  expect(channelPoints({ samples }, "hr")).toEqual([
    { x: 0, y: 100 }, { x: 1000, y: 110 }, { x: 3000, y: 120 },
  ]);
});

test("channelPoints en un canal disperso solo devuelve lo medido (no interpola)", () => {
  expect(channelPoints({ samples }, "resp")).toEqual([{ x: 1000, y: 15.5 }, { x: 3000, y: 16.0 }]);
});

test("channelPoints lee Body Battery del campo desconocido 143", () => {
  expect(channelPoints({ samples }, "bodyBattery")).toEqual([
    { x: 0, y: 60 }, { x: 1000, y: 60 }, { x: 2000, y: 59 }, { x: 3000, y: 58 },
  ]);
});

test("canal ausente o todo-null → vacío (la pantalla no dibuja ese gráfico)", () => {
  expect(channelPoints({ samples: { t: [0, 1], hr: [null, null] } }, "hr")).toEqual([]);
  expect(channelPoints({ samples: { t: [0, 1] } }, "cad")).toEqual([]);
  expect(channelPoints({}, "resp")).toEqual([]);
});

test("hr cae a hrSeries si no hay samples (actividad vieja)", () => {
  expect(channelPoints({ hrSeries: [{ t: 0, bpm: 90 }, { t: 500, bpm: 95 }] }, "hr"))
    .toEqual([{ x: 0, y: 90 }, { x: 500, y: 95 }]);
});

test("el fallback a hrSeries NO aplica a los otros canales", () => {
  expect(channelPoints({ hrSeries: [{ t: 0, bpm: 90 }] }, "cad")).toEqual([]);
});

test("CHANNELS trae label y unidad de cada canal graficable", () => {
  expect(CHANNELS.map((c) => c.key)).toEqual(["hr", "cad", "resp", "bodyBattery"]);
  expect(CHANNELS.find((c) => c.key === "bodyBattery")?.label).toMatch(/inferido/i);
});
```

- [ ] **1.2** Correr → FAIL (no existe el módulo). `bun run --filter @pulsia/mobile test -- cardio-series`

- [ ] **1.3** Implementar `mobile/src/cardio/cardioSeries.ts`:
```ts
import type { CardioSamples } from "@pulsia/shared";
import type { XY } from "../session/chart";

export type ChannelKey = "hr" | "cad" | "resp" | "bodyBattery";
export type HrPoint = { t: number; bpm: number };

// El .FIT trae campos que el SDK no sabe nombrar, con clave numérica. El 143 decrece de forma
// monótona durante la sesión, patrón que coincide con Body Battery — pero Garmin no lo documenta,
// así que se muestra como INFERIDO y nunca como un hecho.
const BODY_BATTERY_FIELD = "143";

export const CHANNELS: { key: ChannelKey; label: string; unit: string }[] = [
  { key: "hr", label: "Frecuencia cardíaca", unit: "ppm" },
  { key: "cad", label: "Cadencia", unit: "rpm" },
  { key: "resp", label: "Respiración", unit: "rpm" },
  { key: "bodyBattery", label: "Body Battery (inferido)", unit: "" },
];

type Source = { samples?: CardioSamples; hrSeries?: HrPoint[] };

// Devuelve el array crudo del canal dentro de `samples`, o undefined.
function rawChannel(samples: CardioSamples | undefined, key: ChannelKey): (number | null)[] | undefined {
  if (!samples) return undefined;
  if (key === "bodyBattery") return samples.unknown?.[BODY_BATTERY_FIELD];
  return samples[key as "hr" | "cad" | "resp"];
}

// Puntos {x,y} de un canal. Los canales son DISPERSOS (la respiración aparece en ~1 de cada 3
// muestras), así que se descartan los huecos en vez de interpolar: dibujar valores que el reloj
// nunca midió sería inventar. Solo `hr` cae a `hrSeries` (actividades previas a la Fase 1).
export function channelPoints(a: Source, key: ChannelKey): XY[] {
  const t = a.samples?.t;
  const ch = rawChannel(a.samples, key);
  if (t && ch) {
    const points: XY[] = [];
    for (let i = 0; i < t.length; i++) {
      const v = ch[i];
      if (v != null) points.push({ x: t[i], y: v });
    }
    if (points.length > 0) return points;
  }
  if (key === "hr" && a.hrSeries?.length) return a.hrSeries.map((p) => ({ x: p.t, y: p.bpm }));
  return [];
}
```

- [ ] **1.4** Borrar `hrPoints.ts` y su test (`git rm`). Verificar que nada los importaba:
  `grep -rn "hrPoints\|cardioHrPoints" mobile` → sin resultados.

- [ ] **1.5** `bun run --filter @pulsia/mobile test -- cardio-series` → PASS; `bun run --filter @pulsia/mobile typecheck` → 0.
  Commit: `feat(fit): cardioSeries — puntos por canal del stream`

---

## Task 2 — `activityFormat.ts` (qué mostrar y cómo)

**Files:** crear `mobile/src/cardio/activityFormat.ts` + `mobile/__tests__/activity-format.test.ts`

- [ ] **2.1** Test primero:
```ts
import { buildTiles, athleteLines, fmtDuration } from "../src/cardio/activityFormat";

test("fmtDuration formatea mm:ss", () => {
  expect(fmtDuration(1844446)).toBe("30:44");
  expect(fmtDuration(65000)).toBe("1:05");
  expect(fmtDuration(0)).toBe("0:00");
});

test("buildTiles solo incluye lo que la actividad tiene", () => {
  const manual = { durationMs: 600000, kcal: 120 };
  const tiles = buildTiles(manual as any);
  expect(tiles.map((t) => t.label)).toEqual(["Duración", "Calorías"]);
});

test("buildTiles arma los tiles del .FIT con su unidad", () => {
  const fit = {
    durationMs: 1844446, kcal: 327, avgHr: 156, maxHr: 169,
    avgCadence: 44, maxCadence: 74, totalCycles: 1680,
    trainingEffectAerobic: 3.7, trainingLoad: 103.9, avgRespiration: 34.6,
  };
  const tiles = buildTiles(fit as any);
  const byLabel = Object.fromEntries(tiles.map((t) => [t.label, t]));
  expect(byLabel["FC media"]).toMatchObject({ value: "156", unit: "ppm" });
  expect(byLabel["Ciclos totales"]).toMatchObject({ value: "1680" });
  expect(byLabel["Efecto aeróbico"]).toMatchObject({ value: "3.7", unit: "/5" });
  expect(tiles).toHaveLength(10);
});

test("un valor null NO genera tile (el reloj no lo reportó)", () => {
  const tiles = buildTiles({ durationMs: 1000, kcal: null, avgHr: null } as any);
  expect(tiles.map((t) => t.label)).toEqual(["Duración"]);
});

test("athleteLines NUNCA incluye el nombre", () => {
  const athlete = { "67": "Nombre Apellido", weight: 80, height: 1.8, restingHeartRate: 55, gender: "male" };
  const lines = athleteLines(athlete);
  const text = lines.map((l) => `${l.label} ${l.value}`).join(" | ");
  expect(text).not.toContain("Nombre");
  expect(text).not.toContain("Apellido");
  expect(text).toContain("80");
  expect(text).toContain("55");
});

test("athleteLines sin datos → vacío", () => {
  expect(athleteLines(undefined)).toEqual([]);
});
```

- [ ] **2.2** Correr → FAIL.

- [ ] **2.3** Implementar `mobile/src/cardio/activityFormat.ts`:
```ts
import type { CardioActivity } from "@pulsia/shared";

export type Tile = { label: string; value: string; unit?: string };
export type Line = { label: string; value: string };

// mm:ss (el detalle de una actividad se lee mejor así que en horas).
export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

// Un tile por dato PRESENTE. Una actividad manual solo tiene duración y quizá kcal: la pantalla
// no debe mostrar tiles vacíos ni "—" por todos lados.
export function buildTiles(a: CardioActivity): Tile[] {
  const t: Tile[] = [{ label: "Duración", value: fmtDuration(a.durationMs), unit: "min" }];
  const add = (label: string, v: number | null | undefined, unit: string, fmt: (n: number) => string = String) => {
    if (v != null) t.push({ label, value: fmt(v), unit });
  };
  add("Calorías", a.kcal, "kcal");
  add("FC media", a.avgHr, "ppm");
  add("FC máx", a.maxHr, "ppm");
  add("Cadencia media", a.avgCadence, "rpm", n1);
  add("Cadencia máx", a.maxCadence, "rpm", n1);
  add("Ciclos totales", a.totalCycles, "");
  add("Efecto aeróbico", a.trainingEffectAerobic, "/5", n1);
  add("Carga entren.", a.trainingLoad, "", n1);
  add("Frec. respirat.", a.avgRespiration, "rpm", n1);
  return t;
}

// Snapshot del atleta que guardó el reloj. El NOMBRE se omite a propósito: no le aporta nada al
// dueño del teléfono y evita que aparezca si comparte una captura de pantalla.
export function athleteLines(athlete: Record<string, unknown> | undefined): Line[] {
  if (!athlete) return [];
  const out: Line[] = [];
  const num = (k: string) => (typeof athlete[k] === "number" ? (athlete[k] as number) : null);
  const w = num("weight"), h = num("height"), rhr = num("restingHeartRate");
  if (w != null) out.push({ label: "Peso", value: `${n1(w)} kg` });
  if (h != null) out.push({ label: "Altura", value: `${h} m` });
  if (rhr != null) out.push({ label: "FC en reposo", value: `${rhr} ppm` });
  return out;
}
```

- [ ] **2.4** Test PASS + typecheck 0. Commit: `feat(fit): activityFormat — tiles y datos del atleta sin el nombre`

---

## Task 3 — Componentes de presentación

**Files:** crear `mobile/src/components/StatTile.tsx` y `mobile/src/components/HrZoneBar.tsx`

- [ ] **3.1** LEER `mobile/src/theme/tokens.ts` y algún componente existente (p. ej. `ChipGroup.tsx`) para copiar el estilo real. Usar SOLO tokens que existan.

- [ ] **3.2** `StatTile.tsx` — recibe `{ label, value, unit? }` y renderiza una tarjeta: label chico en `colors.textMuted` arriba, valor grande en `colors.text`, unidad chica al lado del valor. `testID={`tile-${label}`}`.

- [ ] **3.3** `HrZoneBar.tsx` — recibe `{ name, range, seconds, maxSeconds }` y renderiza una fila: nombre de zona, rango en ppm, y una barra cuyo ancho es `seconds / maxSeconds` (si `maxSeconds` es 0 → ancho 0, sin división por cero) con el tiempo formateado `m:ss` adentro. `testID={`zone-${name}`}`.

- [ ] **3.4** `bun run --filter @pulsia/mobile typecheck` → 0. Commit: `feat(fit): componentes StatTile y HrZoneBar`

---

## Task 4 — Pantalla de detalle + navegación

**Files:** crear `mobile/app/actividad.tsx`; modificar `mobile/app/(tabs)/historial.tsx`; crear `mobile/__tests__/actividad.test.tsx`

- [ ] **4.1** LEER `mobile/app/cardio.tsx` para copiar el patrón de pantalla: `useLocalSearchParams`, `getBackendUrl`, carga con estado + `ActivityIndicator`, `useScreenPadding`, manejo de error.

- [ ] **4.2** Crear `mobile/app/actividad.tsx`. Estructura:
  - `const { id } = useLocalSearchParams<{ id: string }>()`; carga con `getCardioById(url, id)`.
  - Estados: cargando (spinner), error (texto legible), cargado.
  - **Encabezado**: `CARDIO_LABELS[a.type]` + fecha; debajo, hora de inicio–fin y, si hay, `a.sportProfileName`.
  - **Tiles**: `buildTiles(a).map(t => <StatTile …/>)` en un contenedor `flexDirection:"row"`, `flexWrap:"wrap"`, `gap`.
  - **Gráficos**: por cada `c` de `CHANNELS`, calcular `pts = channelPoints(a, c.key)` y **renderizar el bloque solo si `pts.length > 0`** (título + `<LineChart data={pts} unit={c.unit} />`). Nunca montar `LineChart` con datos vacíos: ya muestra "Sin datos todavía." y quedaría un texto suelto.
    Debajo del gráfico de Body Battery, una nota en `colors.textMuted`, tamaño 12: *"Campo sin nombre en el .FIT (143); el patrón coincide con Body Battery."*
  - **Zonas**: solo si `a.fitExtras?.zones`. Construir las filas desde `secondsPerZone` y `highBoundary`: la zona `i` va de `highBoundary[i-1] ?? 0` a `highBoundary[i]`. `maxSeconds = Math.max(...secondsPerZone)`. Omitir las zonas cuyo `seconds` sea 0 **solo si TODAS las demás también lo son** — si hay al menos una con tiempo, mostrar todas (Z5 en 0:00 es información).
  - **Detalles técnicos**: dispositivo y sensor desde `a.fitExtras?.devices` (buscar el que tenga `garminProduct` para el reloj y el que tenga `antplusDeviceType === "heartRate"` para la banda, mostrando `batteryLevel` si está), `athleteLines(a.fitExtras?.athlete)`, nº de muestras (`a.samples?.t.length`), y `a.distanceM`.
  - **Botón "Editar"** → `router.push(`/cardio?id=${id}`)`.
  - Todo bloque opcional se omite entero si no hay dato: nada de secciones vacías.

- [ ] **4.3** En `mobile/app/(tabs)/historial.tsx`, cambiar `onOpenCardio`:
```tsx
  function onOpenCardio(activity: CardioActivity) {
    router.push(`/actividad?id=${activity.id}`);
  }
```

- [ ] **4.4** Test de render `mobile/__tests__/actividad.test.tsx`. Mockear `../src/api/cardio` y `expo-router` siguiendo el patrón de los tests de pantalla existentes (mirar `mobile/__tests__/historial.test.tsx`). Dos casos:
  - **Actividad manual** (solo `id`, `type`, `startedAt`, `durationMs`, `kcalSource`, `source:"manual"`, `notes`): monta sin romperse, muestra el tile "Duración", y **NO** aparecen los textos "Tiempo en zonas" ni "Body Battery".
  - **Actividad de `.FIT`** (con `samples`, `fitExtras.zones` y escalares): aparecen los tiles de FC y cadencia, el texto "Tiempo en zonas" y la nota de Body Battery.
  Datos del fixture: **inventados**.

- [ ] **4.5** `bun run --filter @pulsia/mobile test` (suite completa) → 0 fail; `typecheck` → 0.
  Commit: `feat(fit): pantalla de detalle de actividad`

---

## Task 5 — Verificación final

- [ ] `bun run typecheck` → 0
- [ ] `bun run test` → 0 fail (OJO: `bun run test`, NO `bun test`)
- [ ] `bun run test:mobile` → 0 fail (si falla algo no relacionado, re-correr: hay flakiness conocida bajo carga)
- [ ] `git status` limpio; `grep -rn "hrPoints" mobile` sin resultados.

## Self-review

- **Cobertura del spec:** navegación al detalle (T4.3) ✓; encabezado/tiles/gráficos/zonas/técnicos (T4.2) ✓; `143` como inferido con nota (T1.3 label + T4.2 nota) ✓; respiración filtrada sin interpolar (T1.3) ✓; nombre del atleta omitido (T2.3 + test explícito T2.1) ✓; degradación de la actividad manual (T4.4, caso de test principal) ✓; `hrPoints.ts` absorbido (T1.4) ✓; cero backend nuevo ✓.
- **Placeholders:** ninguno. T1 y T2 llevan el código completo; T3 y T4 llevan la especificación exacta de comportamiento porque el estilo debe salir de los tokens reales del repo, que el implementador tiene que leer.
- **Consistencia:** `channelPoints`/`CHANNELS`/`ChannelKey` definidos en T1 y usados igual en T4; `buildTiles`/`athleteLines`/`fmtDuration` definidos en T2 y usados igual en T4; `StatTile`/`HrZoneBar` con las props de T3 consumidas en T4.
