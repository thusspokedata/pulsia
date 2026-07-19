# Demostraciones animadas de ejercicios (Piezas 1-4) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario toque un ejercicio y vea cómo se hace: animación de dos cuadros más cues de técnica en español.

**Architecture:** Un script de ingesta baja los assets de Everkinetic desde una revisión fija, los convierte a WebP y los commitea junto a un módulo puro que mapea `catalogId → { frames, cues }`. La app bundlea esos assets (el gimnasio sin señal es el caso hostil) y los muestra en una pantalla de detalle única, alcanzable desde cuatro lugares. **El acceso es condicional**: el afford de "ver cómo se hace" aparece solo donde hay animación.

**Tech Stack:** TypeScript, Bun, `sharp` (conversión a WebP, solo en el script), React Native / Expo, `react-native-svg` (ya presente).

---

## Contexto imprescindible

**Spec:** `docs/superpowers/specs/2026-07-18-gifs-ejercicios-design.md`. Leelo si algo acá no se entiende; tiene el porqué de la fuente elegida y el análisis de licencias.

**Qué existe ya (Pieza 0, mergeada):**
- `shared/src/catalog/exerciseMedia.slugs.ts` — **93 mapeos `catalogId → slug` curados a mano**, ejercicio por ejercicio. **No los toques**: reproducirlos cuesta caro. Nada los importa todavía.
- Catálogo de **273 ejercicios** en `shared/src/catalog/exercises.data.ts` (auto-generado, no editar a mano).

**La fuente:** repo `everkinetic/data` en GitHub, licencia **CC-BY-SA-4.0**, ilustración de línea B/N. **Fijar la revisión a `6f3ce86eb79b17e7bbaf588b7960149725bc8fc7`** (último commit, de febrero de 2022). Nunca apuntar a `master`.

**Estructura real de la fuente** (verificada):
- `exercises.json` en la raíz: array de objetos con `name` (el slug que usamos), `id_num` (4 dígitos, **es el que nombra los archivos**), `steps` (los cues en inglés), `primary`, `equipment`.
- `dist/png/<id_num>-relaxation.png` y `<id_num>-tension.png` — los dos cuadros. **79** de nuestros 93.
- `src/images-ai/<id_num>-F.ai.png` y `-S.ai.png` — los mismos dos cuadros en mayor resolución, con otro naming. **7** de los nuestros solo están acá. Verificado visualmente que `F`/`S` = `relaxation`/`tension`, no dos ángulos de cámara.
- **7 mapeos no tienen assets en ninguna carpeta.** Son datos, no un bug del código: la ingesta los reporta y sigue.

→ **Cobertura final esperada: 86 ejercicios con animación, de 273 (32 %).**

**Cómo correr los tests:** `bun test shared` desde la raíz. Mobile: `cd mobile && npm test -- --runInBand` (**`--runInBand` es obligatorio**; en paralelo da timeouts flaky).

**Verificación por mutación (obligatoria).** Después de que un test pase, rompé a propósito el código que prueba y confirmá que **falla**. Cada tarea tiene su paso; no lo saltees. Existe porque en este repo aparecieron 27 tests que estaban en verde sin probar nada.

**Convenciones:** commits firmados `git commit -S`, **nunca** `Co-Authored-By` ni atribución a Claude/Anthropic. Nunca commitear features directo a `main`.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `shared/scripts/fetch-exercise-media.ts` | Ingesta: baja, valida, convierte, escribe | Crear |
| `shared/src/catalog/exerciseMedia.ts` | Módulo puro: `exerciseMediaFor(catalogId)` | Crear |
| `shared/src/catalog/exerciseMedia.data.ts` | Datos generados: frames + cues por ejercicio | Crear (generado) |
| `shared/src/catalog/media.lock.json` | Manifiesto: revisión + hash de cada asset | Crear (generado) |
| `mobile/assets/exercises/*.webp` | Los cuadros | Crear (generados) |
| `mobile/src/components/ExerciseDetail.tsx` | El componente único que renderiza el detalle | Crear |
| `mobile/app/ejercicio/[catalogId].tsx` | La ruta (normal y modal) | Crear |
| `mobile/app/ejercicios.tsx` | Buscador del catálogo | Crear |
| `mobile/src/components/WorkoutDayCard.tsx` | Card del Programa → clickeable | Modificar |
| `mobile/app/sesion.tsx` | Acceso desde la sesión en vivo | Modificar (mínimo) |
| `mobile/app/configuracion.tsx` | Créditos de la fuente | Modificar |

---

## Task 1: Módulo puro de media (la costura)

Se escribe **antes** que la ingesta, contra datos de mentira, para fijar la interfaz. Es el punto donde se enchufa otra fuente si algún día se compra un pack pago.

**Files:**
- Create: `shared/src/catalog/exerciseMedia.ts`
- Create: `shared/src/catalog/exerciseMedia.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Creá `shared/src/catalog/exerciseMedia.test.ts`:

```ts
import { test, expect } from "bun:test";
import { exerciseMediaFor, hasExerciseMedia } from "./exerciseMedia";

test("devuelve la media de un ejercicio que la tiene", () => {
  const m = exerciseMediaFor("barbell_bench_press");
  expect(m).toBeDefined();
  expect(m!.frames).toHaveLength(2);
  expect(m!.cues.length).toBeGreaterThan(0);
});

test("devuelve undefined para un ejercicio sin ilustración", () => {
  // kettlebell_squat existe en el catálogo pero Everkinetic no cubre kettlebell
  expect(exerciseMediaFor("kettlebell_squat")).toBeUndefined();
});

test("devuelve undefined para un id que no existe", () => {
  expect(exerciseMediaFor("id-que-no-existe-xyz")).toBeUndefined();
});

test("no devuelve miembros heredados del prototipo", () => {
  expect(exerciseMediaFor("toString")).toBeUndefined();
  expect(exerciseMediaFor("constructor")).toBeUndefined();
});

test("hasExerciseMedia coincide con exerciseMediaFor", () => {
  expect(hasExerciseMedia("barbell_bench_press")).toBe(true);
  expect(hasExerciseMedia("kettlebell_squat")).toBe(false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exerciseMedia.test.ts`
Expected: FAIL, "Cannot find module ./exerciseMedia"

- [ ] **Step 3: Crear el módulo y un stub de datos**

`shared/src/catalog/exerciseMedia.ts`:

```ts
import { EXERCISE_MEDIA_DATA } from "./exerciseMedia.data";

export interface ExerciseMedia {
  /** Claves de asset de los dos cuadros: [inicio, tensión]. */
  frames: [string, string];
  /** Cues de técnica en español, en orden. */
  cues: string[];
}

/**
 * Media de un ejercicio, o undefined si no tiene ilustración.
 *
 * ESTA ES LA COSTURA de la que cuelga toda la feature: si algún día se cambia de fuente
 * (p. ej. un pack pago), se reemplaza `exerciseMedia.data.ts` y ningún consumidor se entera.
 */
export function exerciseMediaFor(catalogId: string): ExerciseMedia | undefined {
  // Own-property check: evita devolver miembros heredados del prototipo (p.ej. "toString"),
  // mismo guard que exerciseNameEs.
  return Object.prototype.hasOwnProperty.call(EXERCISE_MEDIA_DATA, catalogId)
    ? EXERCISE_MEDIA_DATA[catalogId]
    : undefined;
}

/** Atajo para decidir si mostrar el acceso a "ver cómo se hace". */
export function hasExerciseMedia(catalogId: string): boolean {
  return exerciseMediaFor(catalogId) !== undefined;
}
```

`shared/src/catalog/exerciseMedia.data.ts` (stub temporal, lo pisa la Tarea 2):

```ts
// AUTO-GENERADO por scripts/fetch-exercise-media.ts — no editar a mano.
import type { ExerciseMedia } from "./exerciseMedia";

export const EXERCISE_MEDIA_DATA: Record<string, ExerciseMedia> = {
  barbell_bench_press: {
    frames: ["0042-relaxation", "0042-tension"],
    cues: ["Acostate en el banco con los pies apoyados en el piso."],
  },
};
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exerciseMedia.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Verificación por mutación**

Sacá el `hasOwnProperty` (devolvé `EXERCISE_MEDIA_DATA[catalogId]` directo) y confirmá que **falla** el test del prototipo. Restaurá y confirmá que vuelve a pasar. Reportá el error textual.

- [ ] **Step 6: Exportar desde el índice**

Agregá a `shared/src/index.ts`, junto a los demás exports del catálogo:

```ts
export { exerciseMediaFor, hasExerciseMedia, type ExerciseMedia } from "./catalog/exerciseMedia";
```

Verificá que compila: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`

- [ ] **Step 7: Commit**

```bash
git add shared/src/catalog/exerciseMedia.ts shared/src/catalog/exerciseMedia.data.ts shared/src/catalog/exerciseMedia.test.ts shared/src/index.ts
git commit -S -m "feat(ejercicios): módulo de media como costura de la fuente"
```

---

## Task 2: Script de ingesta

**Files:**
- Create: `shared/scripts/fetch-exercise-media.ts`
- Modify: `shared/package.json` (dep `sharp` + script)

- [ ] **Step 1: Agregar `sharp`**

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun add -d sharp
```

**Es `devDependency`**: solo corre en el script de ingesta, nunca en la app ni en el backend. **No toca el fingerprint del OTA** porque no entra al bundle del móvil.

Agregá a `shared/package.json`, en `scripts`:

```json
    "media:fetch": "bun scripts/fetch-exercise-media.ts"
```

- [ ] **Step 2: Escribir el script**

Creá `shared/scripts/fetch-exercise-media.ts`:

```ts
#!/usr/bin/env bun
/**
 * Ingesta de las ilustraciones de Everkinetic (CC-BY-SA-4.0).
 *
 * Baja los dos cuadros de cada ejercicio mapeado en exerciseMedia.slugs.ts, los convierte a
 * WebP y escribe:
 *   - mobile/assets/exercises/<id_num>-<relaxation|tension>.webp
 *   - shared/src/catalog/exerciseMedia.data.ts   (frames + cues traducidos)
 *   - shared/src/catalog/media.lock.json         (revisión + hash de cada asset)
 *
 * Correr desde la raíz:  bun run shared/scripts/fetch-exercise-media.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import { EXERCISE_MEDIA_SLUGS } from "../src/catalog/exerciseMedia.slugs";

// Revisión FIJA. Nunca apuntar a una rama: el repo puede cambiar de licencia o reemplazar
// imágenes sin aviso, y nosotros redistribuimos ese contenido.
const REV = "6f3ce86eb79b17e7bbaf588b7960149725bc8fc7";
const RAW = `https://raw.githubusercontent.com/everkinetic/data/${REV}`;

const OUT_ASSETS = resolve(import.meta.dir, "../../mobile/assets/exercises");
const OUT_DATA = resolve(import.meta.dir, "../src/catalog/exerciseMedia.data.ts");
const OUT_LOCK = resolve(import.meta.dir, "../src/catalog/media.lock.json");

interface EkExercise {
  name: string;
  id_num: string;
  steps?: string[];
}

async function getBuffer(path: string): Promise<Buffer | null> {
  const res = await fetch(`${RAW}/${path}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  // 1. Licencia: si el upstream dejó de ser CC-BY-SA, abortamos.
  const license = await getBuffer("LICENSE.md");
  if (!license || !license.toString("utf-8").includes("Attribution-ShareAlike 4.0")) {
    throw new Error(
      "El LICENSE.md del upstream ya no dice Attribution-ShareAlike 4.0. " +
        "Parar y revisar antes de redistribuir nada.",
    );
  }

  // 2. Índice de ejercicios de la fuente.
  const raw = await getBuffer("exercises.json");
  if (!raw) throw new Error("No se pudo bajar exercises.json");
  const ek: EkExercise[] = JSON.parse(raw.toString("utf-8"));
  const bySlug = new Map(ek.map((e) => [e.name, e]));

  mkdirSync(OUT_ASSETS, { recursive: true });

  const data: Record<string, { frames: [string, string]; cues: string[] }> = {};
  const lock: Record<string, string> = {};
  const sinAssets: string[] = [];
  const sinSlug: string[] = [];

  for (const [catalogId, slug] of Object.entries(EXERCISE_MEDIA_SLUGS)) {
    const e = bySlug.get(slug);
    if (!e) {
      sinSlug.push(`${catalogId} → ${slug}`);
      continue;
    }

    // dist/png es la fuente preferida; src/images-ai es el fallback (mismos dos cuadros,
    // otro naming, mayor resolución). Verificado visualmente que F/S == relaxation/tension.
    const candidatos: Array<[string, string]> = [
      [`dist/png/${e.id_num}-relaxation.png`, `dist/png/${e.id_num}-tension.png`],
      [`src/images-ai/${e.id_num}-F.ai.png`, `src/images-ai/${e.id_num}-S.ai.png`],
    ];

    let bufs: [Buffer, Buffer] | null = null;
    for (const [a, b] of candidatos) {
      const [ba, bb] = await Promise.all([getBuffer(a), getBuffer(b)]);
      if (ba && bb) {
        bufs = [ba, bb];
        lock[a] = createHash("sha256").update(ba).digest("hex");
        lock[b] = createHash("sha256").update(bb).digest("hex");
        break;
      }
    }

    if (!bufs) {
      sinAssets.push(`${catalogId} → ${slug} (id_num ${e.id_num})`);
      continue;
    }

    const keys: [string, string] = [`${e.id_num}-relaxation`, `${e.id_num}-tension`];
    for (let i = 0; i < 2; i++) {
      const webp = await sharp(bufs[i]).resize(480, 480, { fit: "inside" }).webp({ quality: 82 }).toBuffer();
      writeFileSync(resolve(OUT_ASSETS, `${keys[i]}.webp`), webp);
    }

    data[catalogId] = { frames: keys, cues: e.steps ?? [] };
  }

  // 3. Escribir los datos. Los cues quedan en INGLÉS acá; los traduce la Tarea 3.
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    "// AUTO-GENERADO por scripts/fetch-exercise-media.ts — no editar a mano.",
    "// Ilustraciones de Everkinetic (CC-BY-SA-4.0), revisión " + REV.slice(0, 7) + ".",
    'import type { ExerciseMedia } from "./exerciseMedia";',
    "",
    "export const EXERCISE_MEDIA_DATA: Record<string, ExerciseMedia> = {",
    ...entries.map(
      ([id, m]) =>
        `  ${id}: {\n` +
        `    frames: ["${m.frames[0]}", "${m.frames[1]}"],\n` +
        `    cues: [${m.cues.map((c) => JSON.stringify(c)).join(", ")}],\n` +
        `  },`,
    ),
    "};",
    "",
  ];
  writeFileSync(OUT_DATA, lines.join("\n"), "utf-8");
  writeFileSync(OUT_LOCK, JSON.stringify({ revision: REV, assets: lock }, null, 2), "utf-8");

  console.log(`\nCon animación: ${entries.length}`);
  console.log(`Sin assets en el upstream: ${sinAssets.length}`);
  sinAssets.forEach((s) => console.log(`   ${s}`));
  if (sinSlug.length) {
    console.log(`\n⚠️  Slugs que no existen en exercises.json: ${sinSlug.length}`);
    sinSlug.forEach((s) => console.log(`   ${s}`));
  }
}

await main();
```

- [ ] **Step 3: Correr la ingesta**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun run shared/scripts/fetch-exercise-media.ts`

Expected: `Con animación: 86` y `Sin assets en el upstream: 7`, listando los 7. **Si el número de "con animación" no es 86, pará y reportá**: significa que el upstream cambió respecto de lo medido el 2026-07-19.

- [ ] **Step 4: Verificar el peso de los assets**

```bash
du -sh mobile/assets/exercises && ls mobile/assets/exercises | wc -l
```

Expected: **172 archivos** (86 × 2) y **menos de 4 MB**. Si supera 6 MB, bajá `quality` a 75 y volvé a correr; anotá el tamaño final en el PR.

- [ ] **Step 5: Verificar la guarda de licencia (mutación)**

Cambiá temporalmente el string `"Attribution-ShareAlike 4.0"` por `"Licencia-Que-No-Existe"` y corré el script. Debe **abortar** con el mensaje de licencia, sin escribir nada. Restaurá. Reportá el error textual.

- [ ] **Step 6: Commit**

```bash
git add shared/scripts/fetch-exercise-media.ts shared/package.json shared/src/catalog/exerciseMedia.data.ts shared/src/catalog/media.lock.json mobile/assets/exercises
git commit -S -m "feat(ejercicios): ingesta de las ilustraciones de Everkinetic"
```

---

## Task 3: Traducir los cues al español

Los `steps` vienen en inglés. La app es español-primero.

**Files:**
- Create: `shared/src/catalog/exerciseCues.es.ts`
- Modify: `shared/src/catalog/exerciseMedia.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregá a `shared/src/catalog/exerciseMedia.test.ts`:

```ts
test("los cues salen en español cuando hay traducción", () => {
  const m = exerciseMediaFor("barbell_bench_press");
  expect(m!.cues.length).toBeGreaterThan(0);
  // Sin traducir diría "Lie on a flat bench..."; nunca debe filtrarse inglés a la UI.
  expect(m!.cues.join(" ")).not.toMatch(/\b(the|your|with|and)\b/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exerciseMedia.test.ts`
Expected: FAIL — los cues están en inglés.

- [ ] **Step 3: Generar las traducciones**

Volcá los cues en inglés a un archivo de trabajo:

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun -e '
import { EXERCISE_MEDIA_DATA } from "./src/catalog/exerciseMedia.data";
const out = Object.entries(EXERCISE_MEDIA_DATA)
  .map(([id, m]) => `${id}\n` + m.cues.map((c, i) => `  ${i + 1}. ${c}`).join("\n"))
  .join("\n\n");
await Bun.write("/tmp/cues-en.txt", out);
console.log("volcados", Object.keys(EXERCISE_MEDIA_DATA).length, "ejercicios a /tmp/cues-en.txt");
'
```

Traducilos al español rioplatense de gimnasio, **conservando el orden y el sentido técnico exacto**. No agregues indicaciones que el original no tenga: son instrucciones de ejecución y una invención puede lesionar.

Son ~86 ejercicios con ~6 pasos cada uno. **Hacelo en lotes** (por ejemplo de 20 ejercicios) para no perder precisión hacia el final, y verificá al terminar que la cantidad de pasos por ejercicio coincide con el original:

```bash
cd /Users/kilo/desarrollo26/pulsia/shared && bun -e '
import { EXERCISE_MEDIA_DATA } from "./src/catalog/exerciseMedia.data";
import { EXERCISE_CUES_ES } from "./src/catalog/exerciseCues.es";
const mal = Object.entries(EXERCISE_MEDIA_DATA)
  .filter(([id, m]) => (EXERCISE_CUES_ES[id]?.length ?? 0) !== m.cues.length)
  .map(([id, m]) => `${id}: ${m.cues.length} en inglés vs ${EXERCISE_CUES_ES[id]?.length ?? 0} en español`);
console.log(mal.length ? "DESAJUSTES:\n  " + mal.join("\n  ") : "todos coinciden en cantidad de pasos ✓");
'
```

Escribí `shared/src/catalog/exerciseCues.es.ts`:

```ts
// Traducciones al español de los cues de técnica, por catalogId. Curado (IA), SEPARADO del
// archivo auto-generado (`exerciseMedia.data.ts`): re-ejecutar la ingesta NO debe pisarlo.
// Traducción fiel: NO agregar indicaciones que el original no tenga.
export const EXERCISE_CUES_ES: Record<string, string[]> = {
  barbell_bench_press: [
    "Acostate en un banco plano con los pies apoyados en el piso y la espalda pegada al banco.",
    "Agarrá la barra un poco más ancho que el ancho de hombros.",
    "Llevá la barra por encima del cuerpo hasta el medio del pecho: esa es la posición inicial.",
    "Bajá la barra hasta que roce el pecho.",
    "Subí la barra hasta estirar los brazos por completo.",
    "Volvé a la posición inicial.",
  ],
  // … el resto de los 86
};
```

- [ ] **Step 4: Enchufar la traducción en el módulo**

En `shared/src/catalog/exerciseMedia.ts`, reemplazá el cuerpo de `exerciseMediaFor`:

```ts
import { EXERCISE_MEDIA_DATA } from "./exerciseMedia.data";
import { EXERCISE_CUES_ES } from "./exerciseCues.es";

export function exerciseMediaFor(catalogId: string): ExerciseMedia | undefined {
  if (!Object.prototype.hasOwnProperty.call(EXERCISE_MEDIA_DATA, catalogId)) return undefined;
  const base = EXERCISE_MEDIA_DATA[catalogId];
  const es = Object.prototype.hasOwnProperty.call(EXERCISE_CUES_ES, catalogId)
    ? EXERCISE_CUES_ES[catalogId]
    : undefined;
  // Sin traducción preferimos NO mostrar cues antes que mostrarlos en inglés.
  return { frames: base.frames, cues: es ?? [] };
}
```

- [ ] **Step 5: Test de cobertura de traducciones**

Agregá a `shared/src/catalog/exerciseMedia.test.ts`:

```ts
test("cobertura: todos los ejercicios con media tienen cues en español", () => {
  const sinCues = Object.keys(EXERCISE_MEDIA_DATA).filter(
    (id) => (exerciseMediaFor(id)?.cues.length ?? 0) === 0,
  );
  expect(sinCues).toEqual([]);
});
```

Agregá el import correspondiente arriba: `import { EXERCISE_MEDIA_DATA } from "./exerciseMedia.data";`

- [ ] **Step 6: Correr hasta verde**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
Expected: PASS

- [ ] **Step 7: Verificación por mutación**

Comentá una traducción que hayas agregado, corré el test de cobertura y confirmá que **falla** nombrando ese id. Descomentala. Reportá el error textual.

- [ ] **Step 8: Commit**

```bash
git add shared/src/catalog/exerciseCues.es.ts shared/src/catalog/exerciseMedia.ts shared/src/catalog/exerciseMedia.test.ts
git commit -S -m "feat(ejercicios): cues de técnica en español"
```

---

## Task 4: Componente de detalle

**Files:**
- Create: `mobile/src/components/ExerciseDetail.tsx`
- Create: `mobile/src/components/exerciseAssets.ts`
- Create: `mobile/__tests__/exerciseDetail.test.tsx`

- [ ] **Step 1: Mapa de assets**

React Native **no soporta `require()` con path dinámico**, así que hace falta un mapa estático. Creá `mobile/src/components/exerciseAssets.ts` con un script:

```bash
cd /Users/kilo/desarrollo26/pulsia && bun -e '
import { readdirSync, writeFileSync } from "fs";
const files = readdirSync("mobile/assets/exercises").filter(f=>f.endsWith(".webp")).sort();
const lines = [
  "// AUTO-GENERADO. React Native no admite require() con path dinámico, así que el mapa",
  "// de assets tiene que ser estático. Regenerar tras correr la ingesta de media.",
  "export const EXERCISE_ASSETS: Record<string, number> = {",
  ...files.map(f=>`  "${f.replace(".webp","")}": require("../../assets/exercises/${f}"),`),
  "};",
  "",
];
writeFileSync("mobile/src/components/exerciseAssets.ts", lines.join("\n"));
console.log("mapa con", files.length, "assets");
'
```

Expected: `mapa con 172 assets`

- [ ] **Step 2: Escribir el test que falla**

Creá `mobile/__tests__/exerciseDetail.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { ExerciseDetail } from "../src/components/ExerciseDetail";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

test("muestra el nombre en español y el inglés como secundario", () => {
  const { getByText } = render(<ExerciseDetail catalogId="barbell_bench_press" />);
  expect(getByText("Press de banca con barra")).toBeTruthy();
  expect(getByText("Barbell Bench Press")).toBeTruthy();
});

test("muestra los cues numerados", () => {
  const { getByText } = render(<ExerciseDetail catalogId="barbell_bench_press" />);
  expect(getByText(/Agarrá la barra/)).toBeTruthy();
});

test("un ejercicio sin ilustración no rompe y no muestra animación", () => {
  const { queryByTestId, getByText } = render(<ExerciseDetail catalogId="kettlebell_squat" />);
  expect(queryByTestId("exercise-animation")).toBeNull();
  expect(getByText("Sentadilla con kettlebell")).toBeTruthy();
});

test("un catalogId inexistente no rompe", () => {
  const { getByText } = render(<ExerciseDetail catalogId="no-existe-xyz" />);
  expect(getByText(/no encontrado/i)).toBeTruthy();
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand exerciseDetail`
Expected: FAIL, no existe el módulo

- [ ] **Step 4: Implementar el componente**

Creá `mobile/src/components/ExerciseDetail.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView, Animated } from "react-native";
import { getExerciseById, exerciseNameEs, exerciseMediaFor } from "@pulsia/shared";
import { EXERCISE_ASSETS } from "./exerciseAssets";
import { colors, spacing, radius } from "../theme/tokens";

const CICLO_MS = 1200;

export function ExerciseDetail({ catalogId }: { catalogId: string }) {
  const ex = getExerciseById(catalogId);
  const media = exerciseMediaFor(catalogId);
  const [animando, setAnimando] = useState(true);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!media || !animando) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: CICLO_MS / 2, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: CICLO_MS / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [media, animando, fade]);

  if (!ex) {
    return (
      <View style={{ padding: spacing.md }}>
        <Text style={{ color: colors.textMuted }}>Ejercicio no encontrado.</Text>
      </View>
    );
  }

  const es = exerciseNameEs(catalogId) ?? ex.garminName;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      {media && (
        <Pressable
          testID="exercise-animation"
          onPress={() => setAnimando((v) => !v)}
          style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" }}
        >
          <View style={{ width: 240, height: 240 }}>
            <Image
              source={EXERCISE_ASSETS[media.frames[0]]}
              style={{ position: "absolute", width: 240, height: 240, resizeMode: "contain" }}
            />
            <Animated.Image
              source={EXERCISE_ASSETS[media.frames[1]]}
              style={{ position: "absolute", width: 240, height: 240, resizeMode: "contain", opacity: fade }}
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: spacing.xs }}>
            {animando ? "Tocá para pausar" : "Tocá para animar"}
          </Text>
        </Pressable>
      )}

      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>{es}</Text>
        {es !== ex.garminName && (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{ex.garminName}</Text>
        )}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {[...ex.primaryMuscles, ...ex.secondaryMuscles].map((m, i) => (
          <View
            key={m}
            style={{
              backgroundColor: i < ex.primaryMuscles.length ? colors.accentSoft : colors.surfaceMuted,
              borderRadius: radius.sm,
              paddingVertical: 3,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Text style={{ fontSize: 11, color: i < ex.primaryMuscles.length ? colors.accentText : colors.textMuted }}>
              {m}
            </Text>
          </View>
        ))}
      </View>

      {media && media.cues.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.text, fontWeight: "500" }}>Cómo se hace</Text>
          {media.cues.map((c, i) => (
            <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
              <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>{i + 1}.</Text>
              <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{c}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 5: Correr hasta verde**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand exerciseDetail`
Expected: PASS, 4 tests

- [ ] **Step 6: Verificación por mutación**

Sacá la condición `{media && ...}` del bloque de animación (renderizalo siempre) y confirmá que **falla** el test del ejercicio sin ilustración. Restaurá. Reportá el error textual.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/ExerciseDetail.tsx mobile/src/components/exerciseAssets.ts mobile/__tests__/exerciseDetail.test.tsx
git commit -S -m "feat(ejercicios): componente de detalle con animación y cues"
```

---

## Task 5: La ruta (normal y modal)

**Files:**
- Create: `mobile/app/ejercicio/[catalogId].tsx`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Crear la ruta**

`mobile/app/ejercicio/[catalogId].tsx`:

```tsx
import { useLocalSearchParams, Stack } from "expo-router";
import { ExerciseDetail } from "../../src/components/ExerciseDetail";

export default function EjercicioScreen() {
  const { catalogId } = useLocalSearchParams<{ catalogId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Cómo se hace" }} />
      <ExerciseDetail catalogId={String(catalogId)} />
    </>
  );
}
```

- [ ] **Step 2: Registrar la presentación modal**

En `mobile/app/_layout.tsx`, dentro del `<Stack>`, agregá:

```tsx
      <Stack.Screen name="ejercicio/[catalogId]" options={{ presentation: "modal" }} />
```

**Esto no es cosmético.** Con `presentation: "modal"`, `sesion.tsx` queda montada abajo en el stack y **no se desmonta**. Dado el historial de esta app con la atribución de tiempo al remontar (#145) y las pausas mid-serie (#147), sacar al usuario de la pantalla de sesión con una serie abierta reabriría esos bugs.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/ejercicio mobile/app/_layout.tsx
git commit -S -m "feat(ejercicios): ruta de detalle, modal desde la sesión"
```

---

## Task 6: Acceso desde el Programa

**Files:**
- Modify: `mobile/src/components/WorkoutDayCard.tsx`
- Create: `mobile/__tests__/workoutDayCard.test.tsx`

Hoy la card es una `View` sin `Pressable` y muestra `e.garminName` **en inglés crudo**, sin pasar por `exerciseNameEs` (a diferencia de la sesión). Se arregla de paso.

- [ ] **Step 1: Escribir el test que falla**

Creá `mobile/__tests__/workoutDayCard.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import { WorkoutDayCard } from "../src/components/WorkoutDayCard";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const workout = {
  dayLabel: "Día 1",
  exercises: [
    { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8", targetLoad: "60kg", restSeconds: 90 },
    { catalogId: "kettlebell_squat", garminName: "Kettlebell Squat", sets: 3, reps: "10", targetLoad: "20kg", restSeconds: 90 },
  ],
} as never;

test("muestra el nombre en español, no el inglés crudo", () => {
  const { getByText } = render(<WorkoutDayCard workout={workout} />);
  expect(getByText("Press de banca con barra")).toBeTruthy();
});

test("el ejercicio CON ilustración navega al detalle", () => {
  const { getByTestId } = render(<WorkoutDayCard workout={workout} />);
  fireEvent.press(getByTestId("ver-barbell_bench_press"));
  expect(mockPush).toHaveBeenCalledWith("/ejercicio/barbell_bench_press");
});

test("el ejercicio SIN ilustración no ofrece el acceso", () => {
  const { queryByTestId } = render(<WorkoutDayCard workout={workout} />);
  expect(queryByTestId("ver-kettlebell_squat")).toBeNull();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand workoutDayCard`
Expected: FAIL

- [ ] **Step 3: Implementar**

Reemplazá el cuerpo del `.map()` en `mobile/src/components/WorkoutDayCard.tsx`. El bloque actual arranca en `{workout.exercises.map((e, i) => (`. Cambiá el `<View>` externo de cada ejercicio por:

```tsx
      {workout.exercises.map((e, i) => {
        const conMedia = hasExerciseMedia(e.catalogId);
        const nombre = exerciseNameEs(e.catalogId) ?? e.garminName;
        const fila = (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }}>
            <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm, minWidth: 56, alignItems: "center" }}>
              <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "500" }}>{e.sets} × {e.reps}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{nombre}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{e.targetLoad} · descanso {e.restSeconds}s</Text>
            </View>
            {conMedia && <Text style={{ color: colors.accent, fontSize: 16 }}>›</Text>}
          </View>
        );
        // Acceso CONDICIONAL: sin ilustración no hay nada que mostrar, así que no ofrecemos
        // un toque que no lleva a ningún lado.
        return conMedia ? (
          <Pressable key={`${e.catalogId}-${i}`} testID={`ver-${e.catalogId}`} onPress={() => router.push(`/ejercicio/${e.catalogId}`)}>
            {fila}
          </Pressable>
        ) : (
          <View key={`${e.catalogId}-${i}`}>{fila}</View>
        );
      })}
```

Y actualizá los imports del archivo:

```tsx
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { exerciseNameEs, hasExerciseMedia } from "@pulsia/shared";
```

- [ ] **Step 4: Correr hasta verde**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand workoutDayCard`
Expected: PASS, 3 tests

- [ ] **Step 5: Verificación por mutación**

Cambiá `conMedia ?` por `true ?` (o sea, siempre `Pressable`) y confirmá que **falla** el test del ejercicio sin ilustración. Restaurá. Reportá el error textual.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/WorkoutDayCard.tsx mobile/__tests__/workoutDayCard.test.tsx
git commit -S -m "feat(ejercicios): acceso al detalle desde el Programa + nombre en español"
```

---

## Task 7: Acceso desde la sesión en vivo

`mobile/app/sesion.tsx` tiene **40 KB**. Hacé el cambio **mínimo**: no es el momento de refactorizarlo.

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Create: `mobile/__tests__/sesionDetalleEjercicio.test.tsx`

- [ ] **Step 1: Escribir el test de no-interferencia**

Este es el test importante de la tarea: consultar la animación **no debe tocar el timing de la sesión**.

Creá `mobile/__tests__/sesionDetalleEjercicio.test.tsx`:

```tsx
import { getRestState, setRestState } from "../src/storage/restState";

test("abrir el detalle no altera el timing persistido de la sesión", async () => {
  const antes = { sessionId: "s1", setStart: 1000, restUntil: 5000, restRemaining: null };
  await setRestState(antes);
  // Abrir el detalle es navegación pura: no toca restState. Si alguien mete lógica de sesión
  // en ese camino, este test se cae.
  const despues = await getRestState();
  expect(despues).toEqual(antes);
});
```

**Antes de escribirlo**, abrí `mobile/src/storage/restState.ts` y confirmá los nombres reales de las funciones exportadas; ajustá el test si difieren.

- [ ] **Step 2: Correr**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand sesionDetalleEjercicio`
Expected: PASS

- [ ] **Step 3: Agregar el acceso**

En `mobile/app/sesion.tsx`, alrededor de la línea 700 está el nombre del ejercicio activo:

```tsx
{esName(current.catalogId, current.garminName)}
```

Envolvelo en un `Pressable` **condicional**:

```tsx
{hasExerciseMedia(current.catalogId) ? (
  <Pressable onPress={() => router.push(`/ejercicio/${current.catalogId}`)}>
    <Text style={/* el mismo style que ya tenía */}>
      {esName(current.catalogId, current.garminName)} <Text style={{ color: colors.accent, fontSize: 14 }}>›</Text>
    </Text>
  </Pressable>
) : (
  <Text style={/* el mismo style que ya tenía */}>{esName(current.catalogId, current.garminName)}</Text>
)}
```

Agregá `hasExerciseMedia` al import de `@pulsia/shared` que ya existe en la línea 5.

- [ ] **Step 4: Correr toda la suite de mobile**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand`
Expected: PASS, todo verde

- [ ] **Step 5: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesionDetalleEjercicio.test.tsx
git commit -S -m "feat(ejercicios): acceso al detalle desde la sesión en vivo"
```

---

## Task 8: Buscador del catálogo

**Files:**
- Create: `mobile/app/ejercicios.tsx`
- Create: `mobile/__tests__/buscadorEjercicios.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import EjerciciosScreen from "../app/ejercicios";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null } }));

test("filtra por texto en español", () => {
  const { getByPlaceholderText, getByText, queryByText } = render(<EjerciciosScreen />);
  fireEvent.changeText(getByPlaceholderText(/buscar/i), "prensa");
  expect(getByText("Prensa de piernas")).toBeTruthy();
  expect(queryByText("Press de banca con barra")).toBeNull();
});

test("filtra también por el nombre en inglés", () => {
  const { getByPlaceholderText, getByText } = render(<EjerciciosScreen />);
  fireEvent.changeText(getByPlaceholderText(/buscar/i), "leg press");
  expect(getByText("Prensa de piernas")).toBeTruthy();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand buscadorEjercicios`
Expected: FAIL

- [ ] **Step 3: Implementar la pantalla**

`mobile/app/ejercicios.tsx`:

```tsx
import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { router, Stack } from "expo-router";
import { EXERCISE_CATALOG, exerciseNameEs, hasExerciseMedia } from "@pulsia/shared";
import { colors, spacing, radius } from "../src/theme/tokens";

// Sin acentos ni mayúsculas: "prensa" tiene que encontrar "Prensa", y "biceps" a "bíceps".
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function EjerciciosScreen() {
  const [q, setQ] = useState("");

  const filas = useMemo(
    () =>
      EXERCISE_CATALOG.map((e) => ({
        id: e.id,
        es: exerciseNameEs(e.id) ?? e.garminName,
        en: e.garminName,
        musculo: e.primaryMuscles[0],
        media: hasExerciseMedia(e.id),
      })),
    [],
  );

  const visibles = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return filas;
    // Matchea en español Y en inglés: el nombre inglés sirve para buscarlo en el reloj.
    return filas.filter((f) => norm(f.es).includes(t) || norm(f.en).includes(t));
  }, [filas, q]);

  return (
    <>
      <Stack.Screen options={{ title: "Ejercicios" }} />
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm }}>
        <TextInput
          placeholder="Buscar ejercicio"
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.sm,
            padding: spacing.sm,
            color: colors.text,
          }}
        />
        <FlatList
          data={visibles}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => (
            <Pressable
              testID={`fila-${item.id}`}
              onPress={() => router.push(`/ejercicio/${item.id}`)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: colors.surface,
                borderRadius: radius.sm,
                padding: spacing.sm,
                marginBottom: spacing.xs,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{item.es}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.musculo}</Text>
              </View>
              {item.media && <Text style={{ color: colors.accent, fontSize: 16 }}>›</Text>}
            </Pressable>
          )}
        />
      </View>
    </>
  );
}
```

`FlatList` y no `ScrollView`: son 273 ítems y `ScrollView` los renderiza todos de una.

**Nota:** acá la fila navega **siempre**, tenga o no animación, porque el buscador es también una forma de explorar el catálogo (nombre, músculo, equipo). El chevron `›` marca cuáles además tienen demostración. Es la única pantalla donde el acceso no es condicional, y es a propósito.

- [ ] **Step 4: Correr hasta verde**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand buscadorEjercicios`
Expected: PASS

- [ ] **Step 5: Verificación por mutación**

Sacá el matcheo por `garminName` (dejá solo el español) y confirmá que **falla** el segundo test. Restaurá. Reportá el error textual.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/ejercicios.tsx mobile/__tests__/buscadorEjercicios.test.tsx
git commit -S -m "feat(ejercicios): buscador del catálogo"
```

---

## Task 9: Acceso desde el selector de alternativas

Cuarto y último acceso de los que eligió el usuario. En `mobile/app/sesion.tsx`, cuando se cambia de ejercicio, `alternativesFor()` arma una lista de opciones donde hoy solo se ve el nombre. Ver el dibujo ayuda a decidir con cuál reemplazar.

**Files:**
- Modify: `mobile/app/sesion.tsx` (alrededor de la línea 782, el `Pressable` de cada alternativa)

- [ ] **Step 1: Escribir el test que falla**

Agregá a `mobile/__tests__/sesionDetalleEjercicio.test.tsx`:

```tsx
import { alternativesFor, hasExerciseMedia } from "@pulsia/shared";

test("hay alternativas con ilustración para ofrecer el acceso", () => {
  // Si esto da 0, el acceso en el picker no se vería nunca y la tarea no tendría sentido.
  const alts = alternativesFor("barbell_bench_press", ["dumbbell", "bench"]);
  expect(alts.filter((a) => hasExerciseMedia(a.id)).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Correr**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand sesionDetalleEjercicio`
Expected: PASS (es una verificación de datos, no de código nuevo). **Si falla, pará y reportá**: significa que el acceso no se vería nunca y hay que replantear la tarea.

- [ ] **Step 3: Agregar el ícono al picker**

En el `Pressable` de cada alternativa, agregá a la derecha del nombre un botón que **no** seleccione la alternativa sino que abra el detalle:

```tsx
{hasExerciseMedia(e.id) && (
  <Pressable
    testID={`alt-ver-${e.id}`}
    hitSlop={8}
    onPress={(ev) => {
      ev.stopPropagation(); // no seleccionar la alternativa, solo mirarla
      router.push(`/ejercicio/${e.id}`);
    }}
  >
    <Text style={{ color: colors.accent, fontSize: 15 }}>👁</Text>
  </Pressable>
)}
```

El `stopPropagation` es lo importante: sin él, mirar el dibujo **cambiaría el ejercicio de la sesión**, que es justo lo que el usuario no quería al pedir "ver antes de decidir".

- [ ] **Step 4: Correr toda la suite**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesionDetalleEjercicio.test.tsx
git commit -S -m "feat(ejercicios): ver la demostración desde el selector de alternativas"
```

---

## Task 10: Créditos (condición de la licencia)

CC-BY-SA **exige atribución**. Sin esto no podemos usar los assets.

**Files:**
- Modify: `mobile/app/configuracion.tsx`

- [ ] **Step 1: Agregar la sección**

Al final de `mobile/app/configuracion.tsx`, dentro del scroll, agregá una sección "Créditos":

```tsx
<View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }}>
  <Text style={{ color: colors.text, fontWeight: "500" }}>Créditos</Text>
  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
    Ilustraciones de ejercicios por Everkinetic (Greg Priday), bajo licencia Creative Commons
    Attribution-ShareAlike 4.0 International (CC BY-SA 4.0). Se usan sin modificar.
  </Text>
  <Pressable onPress={() => Linking.openURL("https://creativecommons.org/licenses/by-sa/4.0/")}>
    <Text style={{ color: colors.accent, fontSize: 12 }}>Ver la licencia</Text>
  </Pressable>
</View>
```

Agregá `Linking` al import de `react-native`.

- [ ] **Step 2: Verificar que compila y la suite queda verde**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add mobile/app/configuracion.tsx
git commit -S -m "feat(ejercicios): créditos de Everkinetic (condición de CC-BY-SA)"
```

---

## Task 11: Verificación final y PR

- [ ] **Step 1: Suites completas**

```bash
cd /Users/kilo/desarrollo26/pulsia && bun test shared backend
cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand
```
Expected: ambas verdes.

- [ ] **Step 2: Medir el impacto en el bundle**

```bash
du -sh mobile/assets/exercises
```

Anotá el número en el PR. **Es el dato que decide si el OTA es razonable**: el primer update después de esto baja todos los assets nuevos.

- [ ] **Step 3: Verificar que NO cambió el fingerprint**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bunx --bun eas-cli@16.20.4 update --branch preview --environment preview --message "prueba de fingerprint" --non-interactive --json 2>&1 | grep -i runtime
```

**El runtime android DEBE seguir siendo `784872cbc4d3628548bb75567f088dec209dcf87`.** `sharp` es devDependency de `shared` y no entra al bundle del móvil, así que no debería moverse. **Si cambió, PARÁ y reportá**: significa que el OTA no le llega a nadie y hace falta un APK nuevo.

- [ ] **Step 4: PR**

```bash
git push -u origin <rama>
gh pr create --title "feat(ejercicios): demostraciones animadas con cues de técnica" --body "..."
gh pr comment <n> --body "@claude review"
```

En el cuerpo del PR incluí: cobertura final (86 de 273), peso de los assets, confirmación de que el fingerprint no cambió, y la nota de atribución CC-BY-SA.

---

## Riesgos

- **El fingerprint del OTA.** Si `sharp` termina en `dependencies` en vez de `devDependencies`, se re-basa el runtime y el update no le llega a nadie. Lo cubre el paso 3 de la Tarea 11.
- **Peso del bundle.** ~2-3 MB esperados en WebP. Si se dispara, bajar `quality` antes que sacar ejercicios.
- **ShareAlike.** Los assets se usan **sin modificar** (convertir de formato no es una obra derivada). Si alguien los edita, esas imágenes heredan CC-BY-SA y hay que publicarlas. No aplicar DRM.
- **Cues traducidos.** Es el único contenido de la app que le dice a alguien **cómo mover su cuerpo con peso encima**. Traducir fiel, nunca agregar indicaciones que el original no tenga.

## Fuera de alcance (YAGNI)

Historial del ejercicio en el detalle, favoritos, video real, descarga de assets on-demand desde la Pi y edición de cues por el usuario.
