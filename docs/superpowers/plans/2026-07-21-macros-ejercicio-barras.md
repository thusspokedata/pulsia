# Barras en dos colores + ajuste de carbos por ejercicio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una barra excedida muestre turquesa hasta la meta y naranja el excedente, y que las kcal del ejercicio suban la meta de **carbos** (nunca proteína, grasa, ni ningún límite de salud).

**Architecture:** Una función pura nueva en `shared` (`exerciseAdjustedTargets`) que **no muta** el objeto `goal` — inflar `goal.kcal` subiría el techo de saturadas, que se deriva como 10% de esa cifra. Una función pura nueva en `mobile` (`barSegments`) que parte la barra en la línea de la meta. El componente `Bar` pasa de recibir `{ pct, over }` ya calculados a recibir `{ value, target, kind }` y derivar todo, para que el estado inconsistente (color y texto contradiciéndose) deje de ser representable.

**Tech Stack:** TypeScript, Bun (tests de `shared`), React Native + Expo, jest + `@testing-library/react-native` (tests de `mobile`).

**Spec:** `docs/superpowers/specs/2026-07-21-macros-ejercicio-barras-design.md`

**Convención del repo — leer antes de empezar:**
- **TDD estricto + verificación por mutación de cada test nuevo.** Después de que un test pase, rompé a propósito la línea de producción que cubre y confirmá que el test se pone en rojo. Un test que pasa con el código roto no prueba nada, y en este repo ya aparecieron 32 así.
- Commits firmados: `git commit -S`. **Nunca** atribución a Claude/Anthropic ni `Co-Authored-By`.
- Correr los tests de mobile con `--runInBand` (en paralelo dan timeouts flaky).

**Comandos:**
- `shared`: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
- `mobile`: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand`
- tsc de mobile: `cd /Users/kilo/desarrollo26/pulsia/mobile && npx tsc --noEmit`

---

## Mapa de archivos

| Archivo | Responsabilidad | Task |
|---|---|---|
| `shared/src/nutrition/goal.ts` | + `exerciseAdjustedTargets` (el reparto del bonus). `computeNutritionGoal` **no se toca**. | 1 |
| `shared/src/nutrition/goal.test.ts` | + tests del reparto y de la invariante de saturadas. | 1 |
| `mobile/src/nutrition/tabs/ui.tsx` | + `barSegments`; `Bar` cambia de API. | 2, 3 |
| `mobile/__tests__/barSegments.test.ts` | **Nuevo.** Tests de la función pura. | 2 |
| `mobile/src/nutrition/tabs/ResumenTab.tsx` | Migra a la `Bar` nueva; muestra el bonus de carbos. | 3, 5 |
| `mobile/src/nutrition/tabs/NutrientesTab.tsx` | Migra a la `Bar` nueva pasando `kind`. | 3 |
| `mobile/app/nutricion/nutriente.tsx` | Migra a la `Bar` nueva. | 3 |
| `mobile/app/(tabs)/nutricion.tsx` | Deja de duplicar la barra a mano; muestra el bonus. | 3, 5 |
| `mobile/src/nutrition/goalView.ts` | `MacroBar` gana `bonus`/`metaTotal`, pierde `pct`. | 4 |
| `mobile/__tests__/goalView.test.ts` | Tests del ajuste; se actualizan 2 que usan `pct`. | 4 |
| `mobile/__tests__/detalle.test.tsx` | Test de sal (cambia de significado) + fibra sin ámbar + fixture de macros + bonus. | 3, 4, 5 |

---

### Task 1: `exerciseAdjustedTargets` en shared

El bonus de energía va **entero a carbos**. Proteína y grasa devuelven `bonus: 0` (no se omiten: así los tres macros tienen la misma forma y la UI no necesita ramas por macro).

**Files:**
- Modify: `shared/src/nutrition/goal.ts`
- Test: `shared/src/nutrition/goal.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `shared/src/nutrition/goal.test.ts`:

```ts
import { exerciseAdjustedTargets } from "./goal";
import { saturatedFatRefG } from "./references";

const okGoal = {
  status: "ok" as const, source: "auto" as const,
  kcal: 2112, protein_g: 132, carbs_g: 254, fat_g: 63, bmr: 1700, tdee: 2100,
};

test("el bonus del ejercicio va entero a carbos", () => {
  const t = exerciseAdjustedTargets(okGoal, 1667);
  expect(t.carbs_g).toEqual({ base: 254, bonus: 417, total: 671 }); // 1667/4 = 416.75 → 417
  expect(t.kcal).toEqual({ base: 2112, bonus: 1667, total: 3779 });
});

test("proteína y grasa NO escalan con el ejercicio", () => {
  const t = exerciseAdjustedTargets(okGoal, 1667);
  expect(t.protein_g).toEqual({ base: 132, bonus: 0, total: 132 });
  expect(t.fat_g).toEqual({ base: 63, bonus: 0, total: 63 });
});

test("sin ejercicio todos los total son iguales a los base", () => {
  const t = exerciseAdjustedTargets(okGoal, 0);
  expect(t.kcal).toEqual({ base: 2112, bonus: 0, total: 2112 });
  expect(t.carbs_g).toEqual({ base: 254, bonus: 0, total: 254 });
});

test("ejercicio negativo o no finito se trata como 0, nunca resta meta", () => {
  for (const bad of [-500, NaN, Infinity]) {
    const t = exerciseAdjustedTargets(okGoal, bad);
    expect(t.carbs_g.bonus).toBe(0);
    expect(t.carbs_g.total).toBe(254);
    expect(t.kcal.bonus).toBe(0);
  }
});

// INVARIANTE DEL DISEÑO: los límites de salud no escalan con el gasto. Si alguien "arregla"
// exerciseAdjustedTargets para que infle goal.kcal, este test es el que se pone en rojo.
test("el techo de saturadas NO cambia por haber entrenado", () => {
  const sinEjercicio = saturatedFatRefG(okGoal.kcal);
  const t = exerciseAdjustedTargets(okGoal, 1667);
  expect(saturatedFatRefG(okGoal.kcal)).toBe(sinEjercicio);
  // el total ajustado existe y es mucho mayor, pero NO es lo que alimenta la referencia
  expect(t.kcal.total).toBeGreaterThan(okGoal.kcal);
  expect(saturatedFatRefG(okGoal.kcal)).not.toBe(saturatedFatRefG(t.kcal.total));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
Expected: FAIL — `exerciseAdjustedTargets is not a function` / error de import.

- [ ] **Step 3: Implementar**

Agregar al final de `shared/src/nutrition/goal.ts`:

```ts
export interface AdjustedTarget {
  base: number;
  bonus: number;
  total: number;
}

export interface ExerciseAdjustedTargets {
  kcal: AdjustedTarget;
  protein_g: AdjustedTarget;
  carbs_g: AdjustedTarget;
  fat_g: AdjustedTarget;
}

const fixed = (base: number): AdjustedTarget => ({ base, bonus: 0, total: base });

/**
 * Ajusta las metas de ENERGÍA por el gasto de ejercicio del día. El bonus va entero a carbos:
 * el glucógeno es el combustible del entrenamiento, mientras que la proteína se fija por peso
 * corporal y la grasa no la "pide" el ejercicio.
 *
 * NO devuelve ni ajusta ningún límite de salud (colesterol, saturadas, sal, azúcares): esos no
 * escalan con el gasto. Tampoco muta `goal` — saturatedFatRefG deriva su techo de `goal.kcal`,
 * así que inflarlo subiría un límite de salud por haber entrenado.
 */
export function exerciseAdjustedTargets(
  goal: Extract<NutritionGoalResult, { status: "ok" }>,
  exerciseKcal: number,
): ExerciseAdjustedTargets {
  // Un gasto negativo o no finito se trata como 0: nunca un bonus negativo, que le restaría
  // meta a quien no entrenó.
  const kcalBonus = Number.isFinite(exerciseKcal) && exerciseKcal > 0 ? Math.round(exerciseKcal) : 0;
  const carbsBonus = Math.round(kcalBonus / 4); // 4 kcal por gramo de carbohidrato
  return {
    kcal: { base: goal.kcal, bonus: kcalBonus, total: goal.kcal + kcalBonus },
    protein_g: fixed(goal.protein_g),
    carbs_g: { base: goal.carbs_g, bonus: carbsBonus, total: goal.carbs_g + carbsBonus },
    fat_g: fixed(goal.fat_g),
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test shared`
Expected: PASS, toda la suite de `shared` verde.

- [ ] **Step 5: Verificación por mutación**

Probar una por una, confirmando que **cada** mutación pone algo en rojo, y revirtiendo después:
1. `carbsBonus` → `Math.round(kcalBonus / 9)` → debe fallar "el bonus del ejercicio va entero a carbos".
2. `protein_g: fixed(goal.protein_g)` → `{ base: goal.protein_g, bonus: carbsBonus, total: goal.protein_g + carbsBonus }` → debe fallar "proteína y grasa NO escalan".
3. `exerciseKcal > 0` → `exerciseKcal !== 0` → debe fallar el caso negativo.
4. En `references.ts`, `goalKcal * 0.1` → `goalKcal * 0.2` → debe fallar el test de saturadas (confirma que ese test mira de verdad la referencia).

Si alguna mutación **no** rompe nada, el test correspondiente es falso: arreglarlo antes de seguir.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add shared/src/nutrition/goal.ts shared/src/nutrition/goal.test.ts
git commit -S -m "feat(nutricion): exerciseAdjustedTargets — el gasto sube solo la meta de carbos"
```

---

### Task 2: `barSegments`

Función pura de presentación. Vive junto a `Bar` (no en `shared`): es matemática de dibujo, no una regla nutricional.

**Files:**
- Modify: `mobile/src/nutrition/tabs/ui.tsx`
- Create: `mobile/__tests__/barSegments.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `mobile/__tests__/barSegments.test.ts`:

```ts
import { barSegments } from "../src/nutrition/tabs/ui";

test("bajo la meta: solo turquesa, proporcional", () => {
  expect(barSegments(50, 200)).toEqual({ fillPct: 25, overPct: 0 });
});

test("justo en la meta: lleno y sin naranja", () => {
  expect(barSegments(200, 200)).toEqual({ fillPct: 100, overPct: 0 });
});

test("pasado: dos segmentos que suman 100", () => {
  // grasa 119 contra una meta de 63 → 63/119 = 52.9% turquesa, 47.1% naranja
  const s = barSegments(119, 63);
  expect(s.fillPct).toBe(53);
  expect(s.overPct).toBe(47);
  expect(s.fillPct + s.overPct).toBe(100);
});

test("al doble de la meta queda mitad y mitad", () => {
  expect(barSegments(120, 60)).toEqual({ fillPct: 50, overPct: 50 });
});

test("kind floor: pasarse del piso NO pinta naranja", () => {
  // la fibra es un piso: 45 g contra 30 es bueno, no una alerta
  expect(barSegments(45, 30, "floor")).toEqual({ fillPct: 100, overPct: 0 });
  // con los MISMOS números como límite sí hay dos segmentos (fija que el prop hace algo)
  expect(barSegments(45, 30, "limit").overPct).toBeGreaterThan(0);
});

test("target inválido no divide por cero", () => {
  for (const bad of [0, -10, NaN]) {
    expect(barSegments(50, bad)).toEqual({ fillPct: 0, overPct: 0 });
  }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand barSegments`
Expected: FAIL — `barSegments is not a function`.

- [ ] **Step 3: Implementar**

En `mobile/src/nutrition/tabs/ui.tsx`, agregar **antes** del componente `Bar`:

```ts
export type BarKind = "limit" | "floor";

export interface BarSegments {
  fillPct: number; // turquesa
  overPct: number; // naranja (el excedente)
}

/**
 * Parte la barra en la línea de la meta. La barra representa SIEMPRE lo consumido: al pasarse,
 * el turquesa es la porción que entra en la meta y el naranja el excedente, así que se sigue
 * viendo cuánto llevabas (antes se pintaba entera de ámbar y esa información se perdía).
 *
 * `kind: "floor"` es para los pisos como la fibra, donde pasarse es BUENO y nunca se avisa.
 */
export function barSegments(value: number, target: number, kind: BarKind = "limit"): BarSegments {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return { fillPct: 0, overPct: 0 };
  if (value <= target || kind === "floor") {
    return { fillPct: Math.min(100, Math.round((value / target) * 100)), overPct: 0 };
  }
  const fillPct = Math.round((target / value) * 100);
  return { fillPct, overPct: 100 - fillPct }; // se derivan uno del otro: siempre suman 100
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand barSegments`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verificación por mutación**

1. `target / value` → `value / target` → debe fallar "pasado: dos segmentos que suman 100".
2. `kind === "floor"` → `kind === "limit"` → debe fallar el test de la fibra.
3. `target <= 0` → `target < 0` → debe fallar el caso `target inválido` (el 0).
4. `100 - fillPct` → `0` → debe fallar el test de "al doble de la meta".

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/tabs/ui.tsx mobile/__tests__/barSegments.test.ts
git commit -S -m "feat(nutricion): barSegments — la barra se parte en la linea de la meta"
```

---

### Task 3: `Bar` con API nueva + migrar los 5 call-sites

Cambio atómico: la firma de `Bar` cambia, así que todos los consumidores se migran en el mismo commit o `tsc` queda roto. Incluye dejar de duplicar la barra a mano en el tab.

**Files:**
- Modify: `mobile/src/nutrition/tabs/ui.tsx`
- Modify: `mobile/src/nutrition/tabs/ResumenTab.tsx` (2 barras)
- Modify: `mobile/src/nutrition/tabs/NutrientesTab.tsx`
- Modify: `mobile/app/nutricion/nutriente.tsx`
- Modify: `mobile/app/(tabs)/nutricion.tsx`
- Test: `mobile/__tests__/detalle.test.tsx` (actualizar), `mobile/__tests__/nutricion-tab.test.tsx` (nuevo si no existe)

- [ ] **Step 1: Actualizar el test de sal, que cambia de significado**

`detalle.test.tsx:121-126` afirma hoy que la barra de sal excedida es ámbar. Con el diseño nuevo el
segmento con ese `testID` es el **turquesa** y el ámbar es su hermano. Reemplazar ese test entero por:

```tsx
test("sal por encima del límite: turquesa hasta la meta + ámbar el excedente", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, salt_g: 9 } } }); // ref = 5
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  const fill = screen.getByTestId("nutr-salt_g-bar");
  const over = screen.getByTestId("nutr-salt_g-bar-over");
  expect(fill.props.style.backgroundColor).toBe(colors.accent);
  expect(over.props.style.backgroundColor).toBe(colors.warning);
  // 5/9 = 56% turquesa, 44% ámbar. Asertar los DOS anchos no es redundante: si el turquesa
  // ocupara el 100%, el ámbar quedaría invisible detrás y un test que solo lo busque pasaría igual.
  expect(fill.props.style.width).toBe("56%");
  expect(over.props.style.width).toBe("44%");
});
```

- [ ] **Step 2: Escribir el test de que la fibra NO pinta naranja**

Agregar a `detalle.test.tsx` (mismo arrange que el test "fibra POR ENCIMA del piso" existente):

```tsx
test("fibra por encima del piso: llena de turquesa, sin segmento ámbar", async () => {
  mockDay({ summary: { ...summary, dayTotals: { ...summary.dayTotals, fiber_g: 45 } } }); // piso = 30
  await render(<DetalleDiaScreen />);
  await fireEvent.press(screen.getByTestId("seg-nutrientes"));
  expect(screen.getByTestId("nutr-fiber_g-bar").props.style.width).toBe("100%");
  expect(screen.queryByTestId("nutr-fiber_g-bar-over")).toBeNull();
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand detalle`
Expected: FAIL — no existe el testID `nutr-salt_g-bar-over`.

- [ ] **Step 4: Reemplazar el componente `Bar`**

En `mobile/src/nutrition/tabs/ui.tsx`, reemplazar el `Bar` actual por:

```tsx
// Barra de progreso de dos segmentos: turquesa hasta la meta, ámbar el excedente. Recibe los
// números crudos en vez de un `pct`/`over` ya calculados, para que el color no pueda contradecir
// al texto de la fila.
export function Bar({
  value, target, kind = "limit", height = 8, testID,
}: { value: number; target: number; kind?: BarKind; height?: number; testID?: string }) {
  const { fillPct, overPct } = barSegments(value, target, kind);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceMuted, overflow: "hidden", flexDirection: "row" }}>
      <View testID={testID} style={{ width: `${fillPct}%`, height, backgroundColor: colors.accent }} />
      {overPct > 0 && (
        <View testID={testID ? `${testID}-over` : undefined} style={{ width: `${overPct}%`, height, backgroundColor: colors.warning }} />
      )}
    </View>
  );
}
```

- [ ] **Step 5: Migrar los 5 call-sites**

`ResumenTab.tsx` — la barra de kcal (mide contra el presupuesto real del día):

```tsx
<Bar value={goalView.kcal!.comido} target={goalView.kcal!.meta + goalView.kcal!.exercise} />
```

`ResumenTab.tsx` — la barra de cada macro (por ahora contra `m.meta`; la Task 4 la pasa a `m.metaTotal`):

```tsx
<Bar value={m.comido} target={m.meta} />
```

`NutrientesTab.tsx` — pasando el `kind`, que es lo que salva a la fibra. Reemplazar la línea del `Bar`
y borrar el cálculo de `pct` de arriba (queda sin uso; **dejar** el de `over`, que lo usa el color del texto):

```tsx
{r.value != null && r.ref != null && (
  <Bar
    value={r.value}
    target={r.ref}
    kind={NUTRIENT_REFERENCE_KIND[r.key] === "min" ? "floor" : "limit"}
    testID={`nutr-${r.key}-bar`}
  />
)}
```

`nutriente.tsx` — barra de ranking relativo (nunca supera el máximo, así que el default alcanza):

```tsx
<Bar value={f.amount} target={maxAmount} testID={`rank-${f.name}-bar`} />
```

`nutricion.tsx` — **borrar** el `View`/`View` anidado de las líneas ~115-117 y usar el componente,
agregando el import `Bar` desde `../../src/nutrition/tabs/ui`:

```tsx
<Bar value={m.comido} target={m.meta} height={6} />
```

- [ ] **Step 6: Correr todo y verificar**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand && npx tsc --noEmit`
Expected: PASS y sin errores de tipos. `nutriente.test.tsx:87-96` y el test de fibra al 100% deben
seguir verdes **sin haberlos tocado**: son los canarios de que la migración no cambió lo que ya andaba.

- [ ] **Step 7: Verificación por mutación**

1. En `Bar`, `backgroundColor: colors.accent` → `colors.warning` → debe fallar el test de sal.
2. `{overPct > 0 && (...)}` → `{false && (...)}` → debe fallar el test de sal (falta el `-over`).
3. En `NutrientesTab`, `=== "min" ? "floor" : "limit"` → `"limit"` fijo → debe fallar el test de fibra.
4. `height = 8` → `height = 6` → **no** debería romper nada; es cosmético y no hay test que lo fije. Correcto.

- [ ] **Step 8: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/tabs/ui.tsx mobile/src/nutrition/tabs/ResumenTab.tsx \
  mobile/src/nutrition/tabs/NutrientesTab.tsx mobile/app/nutricion/nutriente.tsx \
  "mobile/app/(tabs)/nutricion.tsx" mobile/__tests__/detalle.test.tsx
git commit -S -m "feat(nutricion): barra de dos segmentos en todos los limites"
```

---

### Task 4: `buildGoalView` usa las metas ajustadas

`MacroBar` gana `bonus` y `metaTotal`, y pierde `pct` (ya no lo usa nadie: la `Bar` deriva sus segmentos).

**⚠️ `meta` sigue siendo la BASE.** `NutrientesTab.tsx:27` lee `goalView.kcal!.meta` para calcular el
techo de saturadas. Si `meta` pasara a incluir el ejercicio, las saturadas se inflarían — exactamente
lo que el diseño prohíbe.

**Files:**
- Modify: `mobile/src/nutrition/goalView.ts`
- Test: `mobile/__tests__/goalView.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `mobile/__tests__/goalView.test.ts`:

```ts
const g2112 = { status: "ok", source: "auto", kcal: 2112, protein_g: 132, carbs_g: 254, fat_g: 63, bmr: 1700, tdee: 2100 } as const;

test("con ejercicio, la meta de carbos sube y la de proteína/grasa no", () => {
  const v = bgv(g2112, { kcal: 2087, protein_g: 65, carbs_g: 198, fat_g: 119 }, 1667);
  const carbs = v.macros!.find((m) => m.key === "carbs")!;
  expect(carbs).toMatchObject({ meta: 254, bonus: 417, metaTotal: 671, restante: 473 });
  const prot = v.macros!.find((m) => m.key === "protein")!;
  expect(prot).toMatchObject({ meta: 132, bonus: 0, metaTotal: 132, restante: 67 });
  const fat = v.macros!.find((m) => m.key === "fat")!;
  expect(fat).toMatchObject({ meta: 63, bonus: 0, metaTotal: 63, restante: -56, over: true });
});

test("el ejercicio saca a los carbos de over: 198/254 con bonus ya no está excedido", () => {
  const conEjercicio = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 300, fat_g: 0 }, 1667);
  const sinEjercicio = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 300, fat_g: 0 }, 0);
  expect(conEjercicio.macros!.find((m) => m.key === "carbs")!.over).toBe(false); // 300 < 671
  expect(sinEjercicio.macros!.find((m) => m.key === "carbs")!.over).toBe(true);  // 300 > 254
});

test("kcal.meta sigue siendo la BASE (alimenta el techo de saturadas)", () => {
  const v = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, 1667);
  expect(v.kcal!.meta).toBe(2112); // NO 3779
  expect(v.kcal!.exercise).toBe(1667);
});

test("sin ejercicio, bonus 0 y metaTotal igual a meta en los tres macros", () => {
  const v = bgv(g2112, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, 0);
  for (const m of v.macros!) {
    expect(m.bonus).toBe(0);
    expect(m.metaTotal).toBe(m.meta);
  }
});
```

Actualizar los dos tests existentes que usan el `pct` que desaparece:
- línea ~12: `expect(prot).toMatchObject({ comido: 90, meta: 150, restante: 60, pct: 60 })` → sacar `pct: 60`.
- líneas ~15-20 (`"restante negativo si comido supera la meta; pct clamp a 100"`): renombrar a
  `"restante negativo si comido supera la meta"` y reemplazar la aserción del `pct` por
  `expect(v.macros!.find((m) => m.key === "protein")!.over).toBe(true);`.

- [ ] **Step 2: Actualizar el fixture de `detalle.test.tsx` — TRAMPA SILENCIOSA**

El `goalView` de `detalle.test.tsx:19-27` construye los macros a mano con `pct` y sin `metaTotal`, y
entra por `(useNutritionDay as jest.Mock).mockReturnValue(...)`, que es `any`. **`tsc` no va a
avisar de nada.** Lo que pasa en runtime es que `Bar` recibe `target={undefined}`, `barSegments`
devuelve `{0,0}` y la barra se dibuja **vacía** — sin que ningún test se ponga en rojo. Es
exactamente la clase de test verde que miente que este repo viene cazando.

En los tres macros del fixture: sacar `pct` y agregar `bonus: 0` y `metaTotal` igual a `meta`:

```tsx
macros: [
  { key: "protein", label: "Proteína", comido: 120, meta: 150, bonus: 0, metaTotal: 150, restante: 30, over: false },
  { key: "carbs", label: "Carbohidratos", comido: 180, meta: 220, bonus: 0, metaTotal: 220, restante: 40, over: false },
  { key: "fat", label: "Grasa", comido: 60, meta: 70, bonus: 0, metaTotal: 70, restante: 10, over: false },
],
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand goalView`
Expected: FAIL — `bonus` y `metaTotal` son `undefined`.

- [ ] **Step 4: Implementar**

En `mobile/src/nutrition/goalView.ts`, reemplazar la interfaz y el cuerpo de `buildGoalView`:

```ts
import { exerciseAdjustedTargets, type NutritionGoalResult } from "@pulsia/shared";

export interface MacroBar {
  key: "protein" | "carbs" | "fat";
  label: string;
  comido: number;
  meta: number;      // BASE — es lo que se muestra como referencia del día de descanso
  bonus: number;     // añadido por el ejercicio (solo carbos)
  metaTotal: number; // meta + bonus — contra esto miden la barra y el restante
  restante: number;
  over: boolean;
}
```

Y dentro de `buildGoalView`, después del guard de `incomplete`:

```ts
const targets = exerciseAdjustedTargets(goal, exercise);

// `over` se deriva SIEMPRE del restante redondeado (mismo criterio para macros y kcal): así
// el color/texto no se contradicen en el borde .5. El `|| 0` normaliza el -0 de Math.round(-0.5).
const bar = (key: MacroBar["key"], label: string, c: number, t: AdjustedTarget): MacroBar => {
  const restante = Math.round(t.total - c) || 0;
  return { key, label, comido: Math.round(c), meta: t.base, bonus: t.bonus, metaTotal: t.total, restante, over: restante < 0 };
};
const kcalRestante = Math.round(goal.kcal - comido.kcal + exercise) || 0;
return {
  status: "ok",
  // `meta` es la BASE a propósito: NutrientesTab la usa para el techo de saturadas, que no
  // escala con el ejercicio. El presupuesto real es meta + exercise.
  kcal: { meta: goal.kcal, comido: Math.round(comido.kcal), exercise: Math.round(exercise), restante: kcalRestante, over: kcalRestante < 0 },
  macros: [
    bar("protein", "Proteína", comido.protein_g, targets.protein_g),
    bar("carbs", "Carbohidratos", comido.carbs_g, targets.carbs_g),
    bar("fat", "Grasa", comido.fat_g, targets.fat_g),
  ],
};
```

Importar el tipo `AdjustedTarget` desde `@pulsia/shared` y **borrar** el helper `clampPct`, que queda sin uso.

- [ ] **Step 5: Actualizar `ResumenTab` y el tab para que la barra mida contra el total**

En `ResumenTab.tsx` y `mobile/app/(tabs)/nutricion.tsx`, la barra de macro pasa de `target={m.meta}` a:

```tsx
<Bar value={m.comido} target={m.metaTotal} />
```

(en `nutricion.tsx`, conservando `height={6}`)

- [ ] **Step 6: Correr todo y verificar**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand && npx tsc --noEmit`
Expected: PASS. El test existente `"exercise suma al restante de kcal y no toca los macros"` debe
seguir verde: solo mira la proteína, que efectivamente no cambia.

- [ ] **Step 7: Verificación por mutación**

1. `bar("carbs", ..., targets.carbs_g)` → `targets.protein_g` → debe fallar el test de carbos.
2. `meta: t.base` → `meta: t.total` → debe fallar "kcal.meta sigue siendo la BASE"… **ojo**: ese test
   mira `kcal.meta`, no el de los macros. Verificar que además falla el test de carbos por `meta: 254`.
   Si no falla ninguno, falta una aserción sobre `m.meta`.
3. `Math.round(t.total - c)` → `Math.round(t.base - c)` → debe fallar "el ejercicio saca a los carbos de over".

- [ ] **Step 8: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/goalView.ts mobile/__tests__/goalView.test.ts \
  mobile/src/nutrition/tabs/ResumenTab.tsx "mobile/app/(tabs)/nutricion.tsx"
git commit -S -m "feat(nutricion): el gasto de ejercicio sube la meta de carbos en la card"
```

---

### Task 5: Mostrar el bonus en la fila de carbos

Base + bonus explícito: `Carb 198 / 254 g +417 ejercicio · faltan 473`. Nunca un total sin explicación.

**Files:**
- Modify: `mobile/src/nutrition/tabs/ResumenTab.tsx`
- Modify: `mobile/app/(tabs)/nutricion.tsx`
- Modify: `mobile/src/nutrition/goalView.ts` (helper de texto)
- Test: `mobile/__tests__/goalView.test.ts`, `mobile/__tests__/detalle.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

En `mobile/__tests__/goalView.test.ts`:

```ts
import { macroTargetLabel } from "../src/nutrition/goalView";

test("macroTargetLabel muestra el bonus solo cuando hay ejercicio", () => {
  expect(macroTargetLabel({ meta: 254, bonus: 417 })).toBe("254 g +417 ejercicio");
  expect(macroTargetLabel({ meta: 254, bonus: 0 })).toBe("254 g");
});
```

(sin casts: `macroTargetLabel` recibe un `Pick<MacroBar, "meta" | "bonus">`, así que el objeto
literal tipa solo.)

En `mobile/__tests__/detalle.test.tsx` — el fixture ya se mockea entero, así que alcanza con darle
un `bonus` al macro de carbos, sin tocar `useNutritionDay` ni los endpoints:

```tsx
test("con ejercicio, la fila de carbos muestra el bonus etiquetado", async () => {
  mockDay({
    goalView: {
      ...goalView,
      macros: goalView.macros.map((m) =>
        m.key === "carbs" ? { ...m, bonus: 417, metaTotal: 637, restante: 457 } : m,
      ),
    },
  });
  await render(<DetalleDiaScreen />);
  expect(screen.getByText(/220 g \+417 ejercicio/)).toBeTruthy();
});

test("sin ejercicio, ninguna fila muestra el sufijo", async () => {
  await render(<DetalleDiaScreen />); // el fixture base tiene bonus 0 en los tres
  expect(screen.queryByText(/ejercicio/)).toBeNull();
});
```

**Nota de cobertura:** estos tests cubren `ResumenTab` (la pantalla de detalle). La card del tab
—que es la de la captura que disparó el trabajo— **no tiene test de render en el repo**, y montar
uno nuevo excede este plan. Lo que la protege es que consume el mismo `macroTargetLabel`, que sí
está testeado como unidad. Si en el futuro se agrega `mobile/__tests__/nutricion-tab.test.tsx`,
este es el primer caso que debería cubrir.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand goalView detalle`
Expected: FAIL — `macroTargetLabel is not a function`.

- [ ] **Step 3: Implementar el helper**

Al final de `mobile/src/nutrition/goalView.ts`:

```ts
// La meta se muestra como base + bonus etiquetado, nunca como un total pelado: un "671 g" sin
// explicación parece un error, y además esconde la meta real de un día de descanso.
export function macroTargetLabel(m: Pick<MacroBar, "meta" | "bonus">): string {
  return m.bonus > 0 ? `${m.meta} g +${m.bonus} ejercicio` : `${m.meta} g`;
}
```

- [ ] **Step 4: Usarlo en las dos pantallas**

`ResumenTab.tsx`, la fila del macro:

```tsx
<Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 13 }}>
  {m.comido} / {macroTargetLabel(m)} · {remainingLabel(m.restante)}
</Text>
```

`mobile/app/(tabs)/nutricion.tsx`, la fila del macro (importar `macroTargetLabel` junto a `remainingLabel`):

```tsx
<Text style={{ color: m.over ? colors.warning : colors.textMuted, fontSize: 12 }}>
  {SHORT[m.key]} {m.comido} / {macroTargetLabel(m)} · {remainingLabel(m.restante)}
</Text>
```

- [ ] **Step 5: Correr todo y verificar**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand && npx tsc --noEmit`
Expected: PASS, suite completa verde.

- [ ] **Step 6: Verificación por mutación**

1. `m.bonus > 0` → `m.bonus >= 0` → debe fallar el caso sin ejercicio de `macroTargetLabel`.
2. Sacar `macroTargetLabel(m)` de `ResumenTab` y volver a `{m.meta} g` → debe fallar el test de render.

- [ ] **Step 7: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/goalView.ts mobile/src/nutrition/tabs/ResumenTab.tsx \
  "mobile/app/(tabs)/nutricion.tsx" mobile/__tests__/goalView.test.ts mobile/__tests__/detalle.test.tsx
git commit -S -m "feat(nutricion): la fila de carbos muestra el bonus del ejercicio"
```

---

### Task 6: Verificación final y PR

- [ ] **Step 1: Suite completa de los tres workspaces**

```bash
cd /Users/kilo/desarrollo26/pulsia && bun test shared backend
cd /Users/kilo/desarrollo26/pulsia/mobile && npm test -- --runInBand && npx tsc --noEmit
```

Expected: todo verde. Anotar los números reales de tests (van al cuerpo del PR).

- [ ] **Step 2: Chequeo del fingerprint del OTA**

Este trabajo es **JS + shared, sin dependencias nuevas**, así que el `runtimeVersion` no debe moverse.
Confirmar que ni `mobile/package.json` ni `shared/package.json` cambiaron:

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main --stat -- '**/package.json' bun.lock
```

Expected: sin salida. Si aparece algo, el OTA no le llegaría a nadie (ver `ota-fingerprint-gotcha`).

- [ ] **Step 3: Abrir el PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/macros-ejercicio-barras
gh pr create --title "feat(nutricion): barras en dos colores + el ejercicio sube la meta de carbos" --body "..."
```

El cuerpo debe explicar el principio rector (**las metas de energía escalan con el gasto, los
límites de salud no**), porque es lo que hace que el diseño se entienda, y mencionar que
`exerciseAdjustedTargets` **no** devuelve límites de salud a propósito.

- [ ] **Step 4: Disparar el review**

Comentar `@claude review` en el PR (automático, sin pedir confirmación).

**⚠️ El `@claude review` es estático — no corre Bash.** Ya aprobó un PR con 3 bugs de runtime adentro.
No sustituye haber corrido la suite ni la verificación por mutación.

---

## Pendiente del owner (no lo puede cerrar un agente)

- **Ver la card en el teléfono un día de entrenamiento fuerte.** La proporción 53/47 de la barra y el
  texto `254 g +417 ejercicio` solo se juzgan de verdad en pantalla, y en 320 px esa fila es la más
  larga de la card. Esta app ya tuvo un bug de texto cortándose.
- **Decidir si el bonus completo es el correcto.** Hoy se acredita el 100% del gasto estimado. Si con
  el uso la meta de carbos queda inflada, el ajuste es acreditar una fracción, y el lugar donde
  tocarlo es una sola línea de `exerciseAdjustedTargets`.
