# Nutrientes completos — Plan 2: UI (mobile)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los 36 nutrientes que el backend ya calcula se **vean** en la app: lista agrupada con
barra y `X/Y · %` en el detalle de comida, en el detalle de alimento del catálogo y en la pestaña
del día, más la corrección del alta ("¿no es este?").

**Architecture:** Un solo componente de lista agrupada, alimentado por el **registro de nutrientes**
(`nutrientsByGroup()`) y por las **referencias EFSA personalizadas** (`referencesFor({sex, age})`),
usado en las tres superficies. Lo único que cambia entre ellas es contra qué referencia compara.

**Tech Stack:** Expo SDK 57, expo-router, TanStack Query, jest (`jest-expo`, `--runInBand`).

**Spec:** `docs/superpowers/specs/2026-07-22-nutrientes-completos-design.md`
**Plan 1 (backend, HECHO):** `docs/superpowers/plans/2026-07-22-nutrientes-completos-datos.md`

---

## Contexto obligatorio antes de empezar

**El Plan 1 ya está mergeado en esta misma rama (`feat/nutrientes-usda`) y NO se toca.** Dejó:

| Pieza | Dónde | Qué da |
|---|---|---|
| Registro de nutrientes | `shared/src/nutrition/nutrients.ts` | `NUTRIENTS`, `NUTRIENT_KEYS`, `nutrientsByGroup()` → `{grasas, carbohidratos, vitaminas, minerales}`, cada def con `{key, label, unit, group, decimals}` |
| Referencias EFSA | `shared/src/nutrition/references.efsa.ts` | `referenceFor(key, {sex, age})`, `referencesFor({sex, age})` → `Record<NutrientKey, {value, kind} \| null>` |
| Derivados | `shared/src/nutrition/derived.ts` | `netCarbsG(carbs, fiber)`, `saltGFromSodiumMg(sodiumMg)` |
| Suma con parcial | `shared/src/nutrition/macros.ts` | `sumNutrient(values)` → `{value, partial, withData, total}` |
| Endpoints | backend | `GET /nutrition/usda/search?q=`, y `assembleFoodExtraction` exportado |

**Cambios de contrato que rompen el mobile de hoy:**
- `source` **ya no existe** → `sourceMacros` (`label|ai|manual`) + `sourceMicros` (`usda|ai|null`).
- `salt_g` **ya no existe** → se persiste `sodium_mg`; la sal se **deriva** con `saltGFromSodiumMg`.
- `FoodSource` y `FoodSourceSchema` fueron eliminados de `@pulsia/shared`.

⚠️ **Por eso `mobile/` hoy NO compila: 25 errores de `tsc` en 8 archivos.** No es un bug suelto, es
el trabajo de la Task 1 de este plan.

## Convenciones obligatorias

- **TDD con verificación por mutación de cada test nuevo.** Escribir el test, verlo fallar,
  implementar, verlo pasar, y **después romper el código a propósito** y confirmar que se queja. En
  el Plan 1 aparecieron **~18 defectos**, casi todos tests que pasaban con la feature rota, y
  **todos se encontraron ejecutando, ninguno leyendo el diff**.
- Tests de mobile: `cd mobile && npm test -- --runInBand` (en paralelo dan timeouts flaky). Los
  tests van en `mobile/__tests__/`, **NUNCA** en `mobile/app/`.
- **`zod` no resuelve desde `mobile/`**: usar los schemas de `@pulsia/shared`, no `import { z }`.
- **Commits firmados `git commit -S`.** NUNCA `Co-Authored-By` ni atribución a Claude/Anthropic.
- Código y comentarios en español.
- **`bun test shared backend` tiene que seguir en 846 pass / 0 fail.** Si lo rompés, lo rompiste vos.

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `mobile/src/nutrition/nutrientRows.ts` | Puro: arma las filas agrupadas (valor, referencia, %, estado) para el componente |
| `mobile/src/nutrition/NutrientList.tsx` | El componente compartido: lista agrupada con barra y `X/Y · %` |
| `mobile/app/nutricion/comida.tsx` | Pantalla nueva: detalle de UNA comida |
| `mobile/app/nutricion/alimento.tsx` | Pantalla nueva: detalle de un alimento del catálogo |
| `mobile/__tests__/nutrientRows.test.ts` | |
| `mobile/__tests__/nutrientList.test.tsx` | |
| `mobile/__tests__/comidaDetalle.test.tsx` | |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `mobile/src/nutrition/SourceChip.tsx` | `FoodSource` → `sourceMacros` + chip de procedencia de micros |
| `mobile/src/nutrition/daySummary.ts` | `salt_g` derivado de `sodium_mg`; totales con marca de parcial |
| `mobile/src/nutrition/mealForm.ts` | lista de micros → registro; `salt_g` → `sodium_mg` |
| `mobile/src/nutrition/nutrientSeries.ts` | `RankNutrient` con sal derivada |
| `mobile/app/nutricion/agregar-alimento.tsx` | campos del form + "¿no es este?" |
| `mobile/app/nutricion/catalogo.tsx` | `food.source` → `food.sourceMacros`; navegar al detalle |
| `mobile/src/nutrition/tabs/NutrientesTab.tsx` | de 5 filas a los 36, vía `NutrientList` |
| `mobile/__tests__/mealForm.test.ts` | fixtures |
| `backend/src/routes/nutrition.ts` | `POST /nutrition/usda/assemble` (pendiente del Plan 1) |

---

## Task 1: Descongelar la compilación

**Nada de este plan se puede testear hasta que `mobile/` compile.** Esta tarea es mecánica pero
tiene una trampa real: **`salt_g` no se reemplaza por `sodium_mg` en la UI** — la app **sigue
mostrando sal** (la referencia OMS de 5 g es la que el usuario reconoce), solo que ahora la deriva.

**Files:** los 8 archivos de la tabla de errores.

- [ ] **Step 1: Ver el estado de partida**

Run: `cd mobile && bunx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `25`. Anotá los archivos; son tu checklist.

- [ ] **Step 2: `SourceChip` — el chip ahora dice dos cosas**

`sourceMacros` reemplaza a `source`, pero además existe `sourceMicros`. Semántica:

```tsx
// mobile/src/nutrition/SourceChip.tsx
import type { SourceMacros, SourceMicros } from "@pulsia/shared";

// Dos procedencias distintas y hay que decir las dos, porque un mismo alimento puede tener los
// macros de una etiqueta y las vitaminas de USDA.
//   sourceMacros: "label" = la IA leyó una tabla nutricional | "ai" = la estimó | "manual" = a mano
//   sourceMicros: "usda" = vitaminas/minerales de la base de composición | null = no hubo match
export function SourceChip({ sourceMacros, sourceMicros }: {
  sourceMacros: SourceMacros;
  sourceMicros?: SourceMicros;
}) { /* … */ }
```

⚠️ El comentario viejo del archivo explica por qué el chip decía "estimado" y no "lo estimó la IA":
la app no podía distinguir IA de carga manual. **Ahora sí puede** (`ai` vs `manual`), así que ese
razonamiento ya no aplica y el chip puede ser preciso. Reescribí el comentario, no lo dejes
mintiendo.

Etiquetas sugeridas: `etiqueta` / `estimado` / `a mano` para macros, y un segundo chip `USDA`
cuando `sourceMicros === "usda"`. Sin chip de micros si es `null`.

- [ ] **Step 3: Escribir el test de la sal derivada, y verlo fallar**

```ts
// mobile/__tests__/daySummary.test.ts  (agregar)
test("la sal del día se deriva del sodio de los ítems, no de un campo salt_g", () => {
  const meals = [mealCon({ sodium_mg: 400 }), mealCon({ sodium_mg: 400 })];
  const s = buildNutritionDaySummary(meals, []);
  // 800 mg de sodio = 2 g de sal
  expect(s.dayTotals.salt_g).toBe(2);
});

test("sin sodio en ningún ítem, la sal es null y no 0", () => {
  const s = buildNutritionDaySummary([mealCon({})], []);
  expect(s.dayTotals.salt_g).toBeNull();
});
```

- [ ] **Step 4: `daySummary.ts` — derivar la sal**

La sal sale de **sumar el sodio y convertir al final**, no de convertir por ítem y sumar (redondear
por ítem introduce deriva). En el backend ya se tomó esta misma decisión.

```ts
import { sumNullableMicro, saltGFromSodiumMg } from "@pulsia/shared";
// …
const sodiumMg = sumNullableMicro(items.map((it) => it.sodium_mg));
const dayTotals = {
  // …
  salt_g: saltGFromSodiumMg(sodiumMg),
};
```

- [ ] **Step 5: `mealForm.ts` y `nutrientSeries.ts`**

Los dos indexan ítems con una lista de claves que incluye `salt_g`. Cambiá la lista para que use
`sodium_mg` donde corresponde y derive la sal donde se muestra. En `nutrientSeries.ts`,
`RankNutrient` conserva la clave `"salt_g"` (es lo que el usuario ve), pero el `amount` se deriva
del `sodium_mg` del ítem — el backend hizo exactamente esto en `breakdown.ts`, **mirá cómo quedó y
seguí el mismo criterio**.

- [ ] **Step 6: `agregar-alimento.tsx` y `catalogo.tsx`**

- El form: el campo "Sal (g)" **se queda** de cara al usuario, pero al guardar convierte a
  `sodium_mg` (ya hay un helper visual que muestra "Sodio ≈ …", reusá esa cuenta). `source` del
  form → `sourceMacros: "manual"` cuando lo cargó el usuario a mano, `"label"`/`"ai"` cuando vino
  de la IA. `sourceMicros` va tal cual lo devolvió el backend (o `null` si es alta manual).
- `FoodFlagsInput` ahora quiere `sodium_mg` (el semáforo del Plan 1 ya razona así).
- `catalogo.tsx`: `food.source` → `food.sourceMacros`.

- [ ] **Step 7: fixtures de `__tests__/mealForm.test.ts`**

12 de los 25 errores son fixtures a los que les falta `sourceMacros`/`sourceMicros` y les sobra
`salt_g`. Actualizalos. **No cambies lo que el test asserta** — solo la forma del fixture.

- [ ] **Step 8: Verificar que compila y la suite pasa**

```bash
cd mobile && bunx tsc --noEmit && npm test -- --runInBand
```
Expected: `tsc` en **0 errores**, suite de mobile verde.

- [ ] **Step 9: Verificación por mutación**

Hacé que `saltGFromSodiumMg` se llame con el sodio **por ítem** en vez de con el total. Esperado:
el test de la sal del día se queja (2 ítems de 400 mg dan lo mismo, así que usá 2 ítems de 50 mg
donde el redondeo diverja: 0,1+0,1=0,2 vs 0,25→0,3). Restaurá.

- [ ] **Step 10: Commit**

```bash
git add mobile
git commit -S -m "fix(mobile): adapta la nutricion al schema de sodio y procedencia partida"
```

---

## Task 2: Las filas de nutrientes (puro)

**Files:** `mobile/src/nutrition/nutrientRows.ts` + `mobile/__tests__/nutrientRows.test.ts`

El cálculo va **separado del componente** para poder testearlo sin renderizar.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// mobile/__tests__/nutrientRows.test.ts
import { buildNutrientRows } from "../src/nutrition/nutrientRows";

const persona = { sex: "male" as const, age: 35 };

test("agrupa en el orden del registro: grasas, carbohidratos, vitaminas, minerales", () => {
  const g = buildNutrientRows({ iron_mg: 5 }, persona);
  expect(g.map((s) => s.group)).toEqual(["grasas", "carbohidratos", "vitaminas", "minerales"]);
});

test("un nutriente sin dato es 'sin dato': ni valor ni porcentaje", () => {
  const g = buildNutrientRows({}, persona);
  const fila = g.flatMap((s) => s.rows).find((r) => r.key === "zinc_mg")!;
  expect(fila.value).toBeNull();
  expect(fila.pct).toBeNull();
});

test("un nutriente en 0 NO es lo mismo que sin dato", () => {
  const g = buildNutrientRows({ zinc_mg: 0 }, persona);
  const fila = g.flatMap((s) => s.rows).find((r) => r.key === "zinc_mg")!;
  expect(fila.value).toBe(0);
  expect(fila.pct).toBe(0);
});

test("el porcentaje se calcula contra la referencia EFSA de esa persona", () => {
  // hierro: varón 11 mg → 5.5 mg es el 50%
  const g = buildNutrientRows({ iron_mg: 5.5 }, persona);
  const fila = g.flatMap((s) => s.rows).find((r) => r.key === "iron_mg")!;
  expect(fila.pct).toBe(50);
});

test("la MISMA cantidad da un porcentaje distinto para una mujer (hierro 16 mg)", () => {
  const varon = buildNutrientRows({ iron_mg: 5.5 }, persona);
  const mujer = buildNutrientRows({ iron_mg: 5.5 }, { sex: "female", age: 35 });
  const p = (g: ReturnType<typeof buildNutrientRows>) =>
    g.flatMap((s) => s.rows).find((r) => r.key === "iron_mg")!.pct;
  expect(p(mujer)).toBeLessThan(p(varon)!);
});

test("sin referencia (EFSA no lo cubre) hay valor pero no porcentaje", () => {
  const g = buildNutrientRows({ omega3_g: 1 }, persona);
  const fila = g.flatMap((s) => s.rows).find((r) => r.key === "omega3_g")!;
  expect(fila.value).toBe(1);
  expect(fila.pct).toBeNull();
});

test("sin referencia diaria (modo catálogo, por 100 g) ninguna fila tiene porcentaje", () => {
  const g = buildNutrientRows({ iron_mg: 5.5 }, null);
  expect(g.flatMap((s) => s.rows).every((r) => r.pct === null)).toBe(true);
});
```

⚠️ El test del 0 vs sin-dato es el que protege la regla central del spec. El del sexo es el que
demuestra que la personalización llega hasta la pantalla — **sin él, una tabla que ignore el perfil
pasa en verde**.

- [ ] **Step 2:** correr, verificar que falla.

- [ ] **Step 3: Implementar**

```ts
// mobile/src/nutrition/nutrientRows.ts
import { nutrientsByGroup, referencesFor, type NutrientKey, type NutrientGroup } from "@pulsia/shared";

export interface NutrientRow {
  key: NutrientKey;
  label: string;
  unit: string;
  value: number | null;      // null = SIN DATO (distinto de 0)
  ref: number | null;        // null = EFSA no lo cubre, o modo "por 100 g"
  pct: number | null;        // null si no hay valor o no hay referencia
  kind: "min" | "max" | null;
}
export interface NutrientSection { group: NutrientGroup; label: string; rows: NutrientRow[] }

// `persona` en null = modo catálogo (valores por 100 g, sin comparar contra nada).
export function buildNutrientRows(
  values: Partial<Record<NutrientKey, number | null>>,
  persona: { sex?: string; age?: number } | null,
): NutrientSection[] { /* … recorre nutrientsByGroup() … */ }
```

- [ ] **Step 4:** correr, verificar que pasa.

- [ ] **Step 5: Verificación por mutación**

Hacé que `buildNutrientRows` ignore `persona` y use siempre la tabla masculina → tiene que fallar
el test del sexo. Hacé que trate `null` como 0 → tiene que fallar el de sin-dato. Restaurá.

- [ ] **Step 6: Commit** — `feat(mobile): filas de nutrientes agrupadas con referencia personal`

---

## Task 3: El componente compartido

**Files:** `mobile/src/nutrition/NutrientList.tsx` + `mobile/__tests__/nutrientList.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Casos: renderiza los 4 encabezados de grupo; una fila con dato muestra `X / Y unidad` y su barra;
una fila sin dato muestra **"sin dato"** y **no** renderiza barra; en modo catálogo muestra el valor
sin `/ Y`.

⚠️ **`toHaveTextContent` con string exige match exacto en este repo, no substring** (lección del
Plan 1). Usá `getByText` con regex o el `testID` de cada fila.

- [ ] **Step 2-4:** correr → implementar → correr.

El componente recibe `sections: NutrientSection[]` y nada más — no sabe si es una comida, un
alimento o un día. Es lo que lo hace servible en las tres superficies.

Reusá `Bar` de `mobile/src/nutrition/tabs/ui.tsx` (ya maneja `kind: "floor" | "limit"`).

- [ ] **Step 5: Verificación por mutación.** Hacé que las filas sin dato rendericen `0` → el test
de "sin dato" tiene que fallar.

- [ ] **Step 6: Commit** — `feat(mobile): componente de lista de nutrientes agrupada`

---

## Task 4: Detalle de comida

**Files:** `mobile/app/nutricion/comida.tsx` + `mobile/__tests__/comidaDetalle.test.tsx`

Es la pantalla de las capturas. Secciones, de arriba a abajo:

1. **Título** de la comida (tipo + hora).
2. **Aporte a los objetivos del día**: kcal / proteínas / grasas / carbos de ESA comida contra la
   meta diaria (`X / Y`), reusando el `goalView` que ya existe.
3. **`NutrientList`** con los nutrientes de la comida contra la referencia diaria personal.
4. **Ingredientes**: los `items` con su gramaje y sus kcal/P/G/C — el modelo ya los tiene, es solo
   presentación.

- [ ] **Step 1: Escribir los tests que fallan**

```tsx
test("muestra los ingredientes con su gramaje", () => { /* 2 ítems → sus nombres y gramos */ });
test("los nutrientes de la comida se comparan contra la referencia diaria", () => { /* … */ });
test("una comida sin micros muestra 'sin dato', no ceros", () => { /* … */ });
```

- [ ] **Step 2-4:** correr → implementar → correr.

⚠️ **Fuera de alcance (spec §6.2):** el rediseño visual de la card (chip de foto, estrellas, menú de
tres puntos). Entra el **contenido**, no la identidad visual — hay una decisión de paleta abierta en
el backlog.

- [ ] **Step 5:** mutación → **Step 6:** commit `feat(mobile): detalle de comida con nutrientes e ingredientes`

---

## Task 5: Detalle de alimento del catálogo

**Files:** `mobile/app/nutricion/alimento.tsx`, y `catalogo.tsx` para navegar.

Igual que la Task 4 pero **sin referencia diaria**: `buildNutrientRows(food, null)` → valores por
100 g/ml. Más los chips de procedencia (`SourceChip`) y, si `usdaFdcId != null`, de qué entrada de
USDA salieron los micros.

- [ ] Tests: navega desde el catálogo; muestra "por 100 g" y **ningún** `/ Y`; muestra el chip USDA
  cuando corresponde y no lo muestra cuando `sourceMicros` es `null`.
- [ ] Mutación, commit: `feat(mobile): detalle de alimento del catalogo`

---

## Task 6: La pestaña del día pasa de 5 nutrientes a 36

**Files:** `mobile/src/nutrition/tabs/NutrientesTab.tsx`, `mobile/src/nutrition/daySummary.ts`

Hoy arma 5 filas a mano contra `NUTRIENT_REFERENCES`. Pasa a `NutrientList`.

⚠️ **Dos referencias distintas para el mismo nutriente sería un bug de cara al usuario.** El Plan 1
dejó explícito que fibra, azúcares, colesterol, saturadas y sal **siguen saliendo de
`references.ts`** (OMS) y están en `null` en la tabla EFSA justamente para no duplicar. Al unificar
en `NutrientList`, esas 5 filas tienen que **conservar su referencia OMS**, no perderla. Verificalo
con un test explícito por cada una de las 5.

- [ ] **Step 1:** test que falla: las 5 filas viejas conservan su referencia y su comportamiento
  (fibra = piso, el resto = techo), y ahora además aparecen las vitaminas y minerales.
- [ ] **Step 2: El total del día lleva marca de parcial.** `daySummary` pasa a usar `sumNutrient` y
  expone `partial` por nutriente; la fila lo muestra (por ejemplo `≥` o un "parcial" discreto).
  Test: un día con un ítem con zinc y otro sin zinc → la fila de zinc sale **parcial**.
- [ ] **Step 3-5:** implementar → correr → mutación (hacé que `partial` sea siempre `false` → el
  test se queja).
- [ ] **Step 6:** commit `feat(mobile): la pestaña del dia muestra los 36 nutrientes`

---

## Task 7: "¿No es este?" — corregir el match

**Files:** `backend/src/routes/nutrition.ts` (+test), `mobile/app/nutricion/agregar-alimento.tsx`

El backend ya devuelve `candidates` en el alta. Falta poder **elegir otro**.

- [ ] **Step 1: El endpoint que quedó pendiente del Plan 1**

```
POST /nutrition/usda/assemble   body: { identification, fdcId }
→ assembleFoodExtraction(identification, await getUsdaFood(db, fdcId))
```

Validá `identification` con `FoodIdentificationSchema`. `fdcId` inexistente → 404.
Tests: re-mezcla con otro `fdcId` cambia los micros y el `usdaFdcId`; `fdcId` inexistente → 404.

- [ ] **Step 2: La UI.** Bajo el nombre del alimento, un chip `USDA · <description>` y un
  **"¿no es este?"** que despliega los `candidates`; al tocar uno, llama al endpoint y **recarga los
  valores del form**. Si no está el que buscás, un campo de búsqueda que pega a
  `GET /nutrition/usda/search?q=`.

- [ ] **Step 3:** tests de la UI (elegir otro candidato actualiza los valores mostrados).
- [ ] **Step 4:** mutación → **Step 5:** commit `feat(nutricion): corregir el alimento de USDA elegido`

---

## Cierre del plan

- [ ] `bun test shared backend` en **846 pass / 0 fail** (no lo rompiste).
- [ ] `cd mobile && bunx tsc --noEmit` en **0 errores** y `npm test -- --runInBand` verde.
- [ ] Actualizar el PR [#183](https://github.com/thusspokedata/pulsia/pull/183) (misma rama) y
      disparar `@claude review`.
- [ ] ⚠️ **El review de `@claude` es estático: no corre Bash.** En este mismo PR reportó como
      faltante una guarda que **ya existía**. Los tests de mutación son la defensa real.

## Al mergear (el paso peligroso)

⚠️ **Backend y mobile tienen que llegar juntos** — es la razón por la que el #183 se dejó sin
mergear. Orden:

1. Mergear el PR → el backend auto-deploya a la Pi (**con supervisión del usuario**: la migración
   0022/0023 reescribe `salt_g`→`sodium_mg` sobre datos reales).
2. Verificar `/health` y que el dataset de USDA cargó (log `usda: cargadas 13694 filas`). **Ojo: la
   primera carga tarda ~14,5 s medidos en Mac, más en la Pi** — el arranque queda bloqueado ese rato.
3. **Publicar el OTA** a vc10 y **verificar el fingerprint `784872cb`** en la salida del
   `eas update` ([[ota-fingerprint-gotcha]]).

Entre el paso 1 y el 3 hay una ventana en la que la app instalada no puede dar de alta alimentos.
**Que sea corta.**

## Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Las 5 filas OMS pierden su referencia al unificar en `NutrientList` | Task 6 Step 1: un test por cada una de las 5 |
| Una lista de 36 filas es ilegible en un teléfono | Grupos colapsables; el spec no lo exige, evaluar en device |
| El perfil sin sexo/edad hace que todas las referencias caigan al fallback | Es el comportamiento correcto (valor conservador), pero conviene un aviso: "completá tu perfil para referencias más precisas" |
| `toHaveTextContent` con string exige match exacto en este repo | Usar regex o `testID` (lección del Plan 1) |
