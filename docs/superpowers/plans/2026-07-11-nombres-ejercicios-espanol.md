# Nombres de ejercicios en español — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar el nombre de cada ejercicio en español (principal) + inglés (secundario) en la pantalla de sesión.

**Architecture:** Un mapa curado `EXERCISE_NAMES_ES` (catalogId → español) en `shared/`, separado del catálogo auto-generado, con helper `exerciseNameEs`. El display en `mobile/app/sesion.tsx` resuelve el español por `catalogId` con fallback al inglés (`garminName`). Sin cambios de schema de programa/sesión. JS/data-only → OTA.

**Tech Stack:** `shared` (TS, `bun test`), `mobile` (Expo/React Native, jest `--runInBand`).

**Rama:** `feat/nombres-ejercicios-espanol` (ya creada; el spec ya está commiteado ahí). TDD, commits firmados (`git commit -S`, sin atribución a Claude).

---

## Task 1: Generar el mapa de traducciones `EXERCISE_NAMES_ES`

Generar el español para los 230 ejercicios a partir de sus `garminName` reales. Español **natural de gimnasio** (no traducción literal): nombres como los diría un entrenador argentino/neutro.

**Files:**
- Create: `shared/src/catalog/exercises.es.ts`

- [ ] **Step 1: Leer los 230 ejercicios (id + garminName)**

Run: `cd /Users/kilo/desarrollo26/pulsia && grep -E '^\s+(id|garminName):' shared/src/catalog/exercises.data.ts`
Esto lista los 230 `id` y `garminName`. Usarlos como fuente para traducir.

- [ ] **Step 2: Escribir `shared/src/catalog/exercises.es.ts`**

Estructura EXACTA:
```ts
// Traducciones al español de los nombres de ejercicios, por catalogId. Curado (IA), SEPARADO del
// catálogo auto-generado (`exercises.data.ts`): regenerar el catálogo NO debe pisar este archivo.
// Español natural de gimnasio; si se agrega un ejercicio nuevo al catálogo, sumar su traducción acá
// (el test de cobertura obliga a que estén todas).
export const EXERCISE_NAMES_ES: Record<string, string> = {
  partial_lockout: "Bloqueo parcial (lockout)",
  dumbbell_bench_press: "Press de banca con mancuernas",
  barbell_bench_press: "Press de banca con barra",
  dumbbell_biceps_curl: "Curl de bíceps con mancuernas",
  dumbbell_hammer_curl: "Curl martillo con mancuernas",
  chin_up: "Dominadas supinas (chin-up)",
  barbell_row: "Remo con barra",
  // ... TODAS las 230 entradas, una por cada `id` del catálogo ...
};
```
Reglas de traducción:
- Traducir los **230** ids del catálogo (ni uno menos — el test de Task 2 lo verifica).
- Equipo: "Dumbbell" → "con mancuernas", "Barbell" → "con barra", "Cable" → "en polea", "Machine" → "en máquina", "Kettlebell" → "con kettlebell", "Band"/"Resistance Band" → "con banda", "Smith" → "en multipower (Smith)", "TRX"/"Suspension" → "en TRX/suspensión", "Bodyweight" → "peso corporal".
- Movimientos comunes: Bench Press → Press de banca; Row → Remo; Curl → Curl; Squat → Sentadilla; Deadlift → Peso muerto; Lunge → Estocada/Zancada; Press (overhead/shoulder) → Press militar/de hombros; Pulldown → Jalón; Pull-up → Dominadas; Push-up → Flexiones; Raise → Elevación; Extension → Extensión; Fly → Aperturas; Plank → Plancha; Crunch → Abdominal/Crunch.
- Cuando el nombre inglés es técnico/propio (p.ej. "Partial Lockout", "Zercher", "Pendlay Row"), dejar el término entre paréntesis: "Remo Pendlay", "Sentadilla Zercher".
- Sin comillas dobles raras; usar acentos correctos (UTF-8).

- [ ] **Step 3: Verificar que compila y tiene 230 entradas**

Run:
```bash
cd /Users/kilo/desarrollo26/pulsia
bunx tsc --noEmit -p shared 2>/dev/null || (cd shared && bunx tsc --noEmit)
# Cuenta las keys (incluye ids que empiezan con dígito → van entre comillas). Portable a BSD grep (macOS): [[:space:]], no \s.
grep -cE '^[[:space:]]+"?[A-Za-z0-9_]+"?:' shared/src/catalog/exercises.es.ts
```
Expected: el `grep -c` debe dar **230** (una línea por entrada). Typecheck limpio.

- [ ] **Step 4: Commit**

```bash
git add shared/src/catalog/exercises.es.ts
git commit -S -m "feat(shared): traducciones al español de los 230 ejercicios del catálogo"
```

---

## Task 2: Helper `exerciseNameEs` + tests de cobertura (TDD)

**Files:**
- Modify: `shared/src/catalog/exercises.ts`
- Test: `shared/src/catalog/exercises.es.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`shared/src/catalog/exercises.es.test.ts`:
```ts
import { test, expect } from "bun:test";
import { EXERCISE_CATALOG, exerciseNameEs } from "./exercises";
import { EXERCISE_NAMES_ES } from "./exercises.es";

test("cobertura: TODOS los ids del catálogo tienen traducción no vacía", () => {
  const faltantes = EXERCISE_CATALOG.filter(
    (e) => !EXERCISE_NAMES_ES[e.id] || EXERCISE_NAMES_ES[e.id].trim() === "",
  ).map((e) => e.id);
  expect(faltantes).toEqual([]);
});

test("exerciseNameEs devuelve el español de un id conocido", () => {
  const first = EXERCISE_CATALOG[0];
  expect(exerciseNameEs(first.id)).toBe(EXERCISE_NAMES_ES[first.id]);
  expect(typeof exerciseNameEs(first.id)).toBe("string");
});

test("exerciseNameEs devuelve undefined para un id inexistente", () => {
  expect(exerciseNameEs("id-que-no-existe-xyz")).toBeUndefined();
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exercises.es.test.ts`
Expected: FAIL — `exerciseNameEs` no existe todavía (import error).

- [ ] **Step 3: Agregar el helper en `shared/src/catalog/exercises.ts`**

Agregar el import arriba y el helper (junto a los otros helpers):
```ts
import { EXERCISE_NAMES_ES } from "./exercises.es";
```
```ts
// Nombre en español del ejercicio por catalogId; undefined si no hay traducción (el caller cae al inglés).
export function exerciseNameEs(catalogId: string): string | undefined {
  return EXERCISE_NAMES_ES[catalogId];
}
```
(`exercises.ts` ya se re-exporta desde `shared/src/index.ts` vía `export * from "./catalog/exercises"`, así que `exerciseNameEs` queda disponible como `@pulsia/shared`.)

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared/src/catalog/exercises.es.test.ts`
Expected: PASS (3 tests). Si el test de cobertura falla, completar las traducciones faltantes en `exercises.es.ts` (Task 1) hasta que pase.

- [ ] **Step 5: Correr toda la suite de shared**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add shared/src/catalog/exercises.ts shared/src/catalog/exercises.es.test.ts
git commit -S -m "feat(shared): helper exerciseNameEs + test de cobertura de traducciones"
```

---

## Task 3: Display español + inglés en la sesión (TDD)

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Test: `mobile/__tests__/sesion.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

En `mobile/__tests__/sesion.test.tsx`, agregar un caso que reutilice el patrón de montaje existente del archivo (hay tests que renderizan la sesión con un programa). El programa de prueba usa el ejercicio `barbell_bench_press` (garminName "Barbell Bench Press"); su traducción es "Press de banca con barra". El test: renderizar la sesión y verificar que el **ejercicio activo** muestra el nombre en español como principal y el inglés como secundario.
```ts
test("el ejercicio activo muestra el nombre en español + el inglés como secundario", async () => {
  // ...montaje como en los otros tests del archivo (baseProgram con barbell_bench_press)...
  expect(await screen.findByText("Press de banca con barra")).toBeTruthy();
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
});
```
> Nota: usar el `baseProgram`/helper de montaje ya presentes en el archivo. Si el programa base usa otro catalogId, ajustar el texto español esperado al que corresponda según `EXERCISE_NAMES_ES` (o cambiar el programa de prueba a `barbell_bench_press`). El catalogId del ejercicio activo debe tener traducción.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: FAIL — hoy solo se muestra el inglés (`current.garminName`).

- [ ] **Step 3: Implementar el display**

En `mobile/app/sesion.tsx`:

1. Import (junto a los otros de `@pulsia/shared`, p.ej. donde se importa `alternativesFor`):
```ts
import { alternativesFor, exerciseNameEs } from "@pulsia/shared";
```
(si `alternativesFor` ya se importa de `@pulsia/shared`, sumar `exerciseNameEs` a ese import).

2. Un helper local dentro del componente (cerca del inicio del render, después de `const sess = session;`):
```ts
  // Nombre en español (principal) con fallback al inglés.
  const esName = (catalogId: string, en: string) => exerciseNameEs(catalogId) ?? en;
```

3. **Ejercicio activo** — reemplazar la línea del título (hoy `<Text ...>{current.garminName}</Text>`, ~línea 602) por español principal + inglés secundario (el inglés solo si hay traducción y difiere):
```tsx
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>
            {esName(current.catalogId, current.garminName)}
          </Text>
          {exerciseNameEs(current.catalogId) != null && (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{current.garminName}</Text>
          )}
```

4. **Lista de ejercicios** — la row muestra hoy `{e.garminName}` (~línea 578). Cambiar a:
```tsx
                  {esName(e.catalogId, e.garminName)}
```
(`e` es un `SessionExercise` con `catalogId`.)

5. **Picker "Cambiar ejercicio"** — la alternativa muestra hoy `{e.garminName}` (~línea 684). Cambiar a:
```tsx
                      {esName(e.id, e.garminName)}
```
(`e` acá es un `CatalogExercise` con `.id`.)

NO tocar `pickChoice`/`newGarminName`/`setPickChoice` (siguen guardando `garminName` para la sustitución en el programa — solo cambia lo que se MUESTRA).

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS (incluido el caso nuevo, sin romper los existentes).

- [ ] **Step 5: Correr toda la suite del móvil + typecheck**

Run: `cd mobile && npm test -- --runInBand && bunx tsc --noEmit`
Expected: verde, typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): nombres de ejercicios en español + inglés en la sesión"
```

---

## Self-review — cobertura del spec

- Mapa `EXERCISE_NAMES_ES` separado del catálogo, 230 traducciones → Task 1. ✓
- Helper `exerciseNameEs` + fallback al inglés → Task 2. ✓
- Test de cobertura (todos los ids traducidos) → Task 2. ✓
- Display: activo (español principal + inglés secundario), lista y picker (español, fallback inglés) → Task 3. ✓
- Sin tocar schemas de programa/sesión ni la sustitución → Task 3 (solo display). ✓
- JS/data-only → OTA (se entrega junto con los fixes de sesión pendientes). ✓
