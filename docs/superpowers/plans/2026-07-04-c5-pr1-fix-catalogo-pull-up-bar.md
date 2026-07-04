# C5 · PR1 — Fix catálogo: band-assisted pull-ups requieren barra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el equipamiento de los ejercicios "band assisted pull-up / chin-up / banded pull-ups" en el catálogo para que requieran también `pull_up_bar`, de modo que no se generen para un atleta que tiene banda pero no barra.

**Architecture:** El catálogo (`shared/src/catalog/exercises.data.ts`) es la fuente de verdad; `catalogForEquipment(available)` (`shared/src/catalog/exercises.ts:10-13`) devuelve los ejercicios cuyo `equipment` es subconjunto del disponible. Tres entradas de la categoría `PULL_UP` listan solo `["resistance_band"]` pero físicamente necesitan una barra donde anclar la banda. Se agrega `"pull_up_bar"` a su `equipment`. Cambio de datos puro, sin tocar backend ni mobile.

**Tech Stack:** TypeScript, Zod, `bun test` (workspace `shared/`).

---

## Task 1: band-assisted pull-ups requieren `pull_up_bar`

**Files:**
- Test: `shared/src/catalog/exercises.test.ts` (agregar un test)
- Modify: `shared/src/catalog/exercises.data.ts` (3 entradas: `banded_pull_ups` ~línea 1389, `band_assisted_chin_up` ~línea 1407, `band_assisted_pull_up` ~línea 1425)

Contexto de datos actual (las 3 mal):
```ts
{ id: "banded_pull_ups", ..., equipment: ["resistance_band"] },
{ id: "band_assisted_chin_up", ..., equipment: ["resistance_band"] },
{ id: "band_assisted_pull_up", ..., equipment: ["resistance_band"] },
```

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `shared/src/catalog/exercises.test.ts`:

```ts
test("las dominadas asistidas con banda requieren también barra (pull_up_bar)", () => {
  const bandOnly = catalogForEquipment(["resistance_band"]).map((e) => e.id);
  const bandPlusBar = catalogForEquipment(["resistance_band", "pull_up_bar"]).map((e) => e.id);

  for (const id of ["band_assisted_pull_up", "band_assisted_chin_up", "banded_pull_ups"]) {
    // Con solo banda NO deben aparecer (hace falta barra donde colgar la banda).
    expect(bandOnly).not.toContain(id);
    // Con banda + barra SÍ.
    expect(bandPlusBar).toContain(id);
  }
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd shared && bun test src/catalog/exercises.test.ts`
Expected: FAIL — el bloque `expect(bandOnly).not.toContain("band_assisted_pull_up")` falla porque hoy aparecen con solo `resistance_band`.

- [ ] **Step 3: Corregir el equipamiento de las 3 entradas**

En `shared/src/catalog/exercises.data.ts`, cambiar `equipment: ["resistance_band"]` → `equipment: ["resistance_band", "pull_up_bar"]` en exactamente estas 3 entradas (identificarlas por su `id`, no por número de línea):

```ts
// id: "banded_pull_ups"
    equipment: ["resistance_band", "pull_up_bar"],
// id: "band_assisted_chin_up"
    equipment: ["resistance_band", "pull_up_bar"],
// id: "band_assisted_pull_up"
    equipment: ["resistance_band", "pull_up_bar"],
```

No tocar otras entradas. `chin_up`, `hanging_hurdle` ya tienen `["pull_up_bar"]` (correctas). NO tocar `lat_pulldown` (tiene otro problema de datos distinto — fuera de alcance de este PR).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd shared && bun test src/catalog/exercises.test.ts`
Expected: PASS (incluye los tests existentes: schema válido, ids únicos, tamaño 150-250, etc.)

- [ ] **Step 5: Correr toda la suite de shared para no romper nada**

Run: `cd shared && bun test`
Expected: PASS — todos los tests de `shared` en verde.

- [ ] **Step 6: Commit**

```bash
git add shared/src/catalog/exercises.data.ts shared/src/catalog/exercises.test.ts
git commit -S -m "fix(catalog): band-assisted pull-ups requieren pull_up_bar

banded_pull_ups, band_assisted_chin_up y band_assisted_pull_up listaban
solo resistance_band; físicamente necesitan una barra donde anclar la
banda. Se agrega pull_up_bar para que no se generen sin barra."
```

---

## Notas de cierre del PR

- Rama: `feat/c5-notas-ia` ya existe (tiene el spec). Este PR1 puede ir en su **propia rama** desde `main`
  (`fix/catalogo-band-pull-up`) para mantenerlo chico e independiente, o sumarse a la rama de C5. Recomendado:
  rama propia desde `main` → PR chico → review (CodeRabbit) → merge.
- Tras merge, el usuario regenera el programa para que el fix aplique (los programas ya generados no cambian).
