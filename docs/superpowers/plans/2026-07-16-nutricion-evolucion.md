# Evolución de nutrientes en el tiempo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla del nutriente muestre, arriba del ranking, la evolución diaria de ese nutriente con su referencia OMS dibujada, el promedio y la cobertura de registro.

**Architecture:** Una función pura `dailyNutrientSeries` en `mobile/` agrupa las comidas por día local; `LineChart` (que ya existe) recibe un prop opcional `refLine` para dibujar la referencia dentro del dominio del eje; y `nutriente.tsx` los junta. **Ningún componente de gráfico nuevo, sin backend, sin migraciones.**

**Tech Stack:** Bun workspaces, React Native / Expo SDK 57, `react-native-svg` (ya es dependencia), jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-07-16-nutricion-evolucion-design.md`

**Restricciones duras:**
- **Cero dependencias nuevas** — cambiarían el fingerprint del runtime y romperían el OTA a vc10.
- TDD siempre: test que falla primero. Cada test nuevo se verifica **por mutación**.
- Commits firmados (`git commit -S`), **nunca** con atribución a Claude/Anthropic.
- **No tocar `ONBOARDING.md`**: tiene una modificación del usuario sin commitear.
- Un solo agente escribiendo a la vez.

**La rama ya existe** (`feat/nutricion-evolucion-nutrientes`, con el spec commiteado). No crear otra ni cambiar de rama.

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `mobile/src/nutrition/nutrientSeries.ts` (crear) | Agrupa las comidas por día local → serie + promedio. |
| `mobile/__tests__/nutrientSeries.test.ts` (crear) | Sus tests. |
| `mobile/src/components/LineChart.tsx` (modificar) | Prop opcional `refLine`, dentro del dominio Y. |
| `mobile/__tests__/linechart.test.tsx` (modificar) | Tests del `refLine`. |
| `mobile/app/nutricion/nutriente.tsx` (modificar) | Renderiza el gráfico arriba del ranking. |
| `mobile/__tests__/nutriente.test.tsx` (modificar) | Tests de la pantalla. |

---

### Task 1: `dailyNutrientSeries`

**Files:**
- Create: `mobile/src/nutrition/nutrientSeries.ts`
- Test: `mobile/__tests__/nutrientSeries.test.ts`

**Contexto que necesitás leer antes:**
- `mobile/src/session/dateKey.ts` → `dateKey(ms)` da el día **local** `YYYY-MM-DD`.
- `mobile/src/session/chart.ts` → `export interface XY { x: number; y: number }`.
- `shared/src/nutrition/macros.ts` → `sumNullableMicro(values)`: devuelve `null` si TODOS son null/undefined; si no, suma tratando null como 0, a 1 decimal. **Es el mismo helper que usa `buildNutritionDaySummary` para el total del día** — usarlo acá es lo que garantiza que la curva y el número de la pestaña Nutrientes no se contradigan.
- `shared/src/nutrition/breakdown.ts` → el tipo `RankNutrient`.

- [ ] **Step 1: Write the failing tests**

Crear `mobile/__tests__/nutrientSeries.test.ts`:

```ts
import { dailyNutrientSeries } from "../src/nutrition/nutrientSeries";
import type { Meal } from "@pulsia/shared";

// Julio 2026, hora local. El mes es 0-indexado en Date.
const at = (day: number, hour: number) => new Date(2026, 6, day, hour).getTime();
const noon = (day: number) => new Date(2026, 6, day, 12).getTime();

const meal = (eatenAt: number, cholesterols: (number | null)[]): Meal =>
  ({
    id: "m",
    eatenAt,
    mealType: null,
    note: null,
    items: cholesterols.map((cholesterol_mg) => ({
      foodName: "x", grams: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
      cholesterol_mg, sugars_g: null, fiber_g: null, saturated_fat_g: null, salt_g: null, water_ml: null,
    })),
  }) as any;

test("un punto por día, anclado al MEDIODÍA local (no a la hora de la comida)", () => {
  const { points } = dailyNutrientSeries([meal(at(10, 8), [100])], "cholesterol_mg");
  expect(points).toEqual([{ x: noon(10), y: 100 }]);
});

test("varias comidas del mismo día se suman en un solo punto", () => {
  // Desayuno 8am y cena 22pm del día 10: un punto, no dos.
  const meals = [meal(at(10, 8), [100]), meal(at(10, 22), [50])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points).toEqual([{ x: noon(10), y: 150 }]);
});

test("los puntos salen ordenados por fecha, no por orden de llegada", () => {
  const meals = [meal(at(12, 8), [30]), meal(at(10, 8), [10]), meal(at(11, 8), [20])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points.map((p) => p.y)).toEqual([10, 20, 30]);
});

test("un día SIN el dato no genera punto (no es lo mismo 'comí 0' que 'no sé')", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [null])];
  const { points } = dailyNutrientSeries(meals, "cholesterol_mg");
  expect(points).toEqual([{ x: noon(10), y: 100 }]);
});

test("un día con el dato en 0 SÍ genera punto (es información real)", () => {
  const meals = [meal(at(10, 8), [100]), meal(at(11, 8), [0])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").points.map((p) => p.y)).toEqual([100, 0]);
});

test("un día mixto (un ítem con dato, otro sin) suma tratando el null como 0", () => {
  // Mismo criterio que sumNullableMicro y que el total del día en la pestaña Nutrientes.
  expect(dailyNutrientSeries([meal(at(10, 8), [100, null])], "cholesterol_mg").points).toEqual([
    { x: noon(10), y: 100 },
  ]);
});

test("el promedio es sobre los días CON registro, no sobre el rango", () => {
  // 3 días registrados de un rango que podría ser de 30: 300/3 = 100, no 300/30.
  const meals = [meal(at(10, 8), [50]), meal(at(11, 8), [100]), meal(at(12, 8), [150])];
  expect(dailyNutrientSeries(meals, "cholesterol_mg").average).toBe(100);
});

test("sin comidas, o sin ningún dato del nutriente: sin puntos y promedio null", () => {
  expect(dailyNutrientSeries([], "cholesterol_mg")).toEqual({ points: [], average: null });
  expect(dailyNutrientSeries([meal(at(10, 8), [null])], "cholesterol_mg")).toEqual({ points: [], average: null });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- nutrientSeries
```

Expected: FAIL — `Cannot find module '../src/nutrition/nutrientSeries'`.

- [ ] **Step 3: Write minimal implementation**

Crear `mobile/src/nutrition/nutrientSeries.ts`:

```ts
import { sumNullableMicro } from "@pulsia/shared";
import type { Meal, RankNutrient } from "@pulsia/shared";
import type { XY } from "../session/chart";
import { dateKey } from "../session/dateKey";

export interface NutrientSeries {
  points: XY[]; // x = mediodía del día, y = total del nutriente ese día
  average: number | null; // sobre los días CON registro, no sobre el rango
}

// Mediodía LOCAL del día `YYYY-MM-DD`. El eje X representa el día, no la hora en que se comió:
// si usáramos el `eatenAt`, dos días se separarían más o menos según a qué hora desayunaste.
// El mediodía además deja 12 h de margen contra el DST, mismo criterio que `dayAtNoon`.
function noonOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

// Total diario de un micro. Un día sin comidas, o con comidas pero sin NINGÚN ítem que declare el
// dato, no genera punto: no es lo mismo "comí 0" que "no sé", y dibujar un 0 mentiría a favor.
// Un 0 declarado sí es un punto. `sumNullableMicro` es el mismo helper que arma el total del día
// en la pestaña Nutrientes, así que la curva no puede contradecir ese número.
export function dailyNutrientSeries(meals: Meal[], nutrient: RankNutrient): NutrientSeries {
  const byDay = new Map<string, (number | null | undefined)[]>();
  for (const m of meals) {
    const key = dateKey(m.eatenAt);
    const acc = byDay.get(key) ?? [];
    for (const item of m.items) acc.push(item[nutrient]);
    byDay.set(key, acc);
  }

  const points: XY[] = [];
  for (const [key, values] of byDay) {
    const total = sumNullableMicro(values);
    if (total == null) continue;
    points.push({ x: noonOf(key), y: total });
  }
  points.sort((a, b) => a.x - b.x); // el backend no garantiza el orden de las comidas

  const average =
    points.length > 0 ? Math.round((points.reduce((a, p) => a + p.y, 0) / points.length) * 10) / 10 : null;
  return { points, average };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- nutrientSeries
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Verify the tests bite**

Corré estas dos mutaciones y confirmá que falla el test correcto. Restaurá después de cada una y verificá con `git diff` que no quedó nada sucio.

1. Sacá el `if (total == null) continue;`. Debería fallar el test del día sin dato.
2. Sacá el `points.sort(...)`. Debería fallar el test del orden.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/nutrition/nutrientSeries.ts mobile/__tests__/nutrientSeries.test.ts
git commit -S -m "feat(nutrición): dailyNutrientSeries — total diario de un micro para la curva"
```

---

### Task 2: `refLine` en `LineChart`

**Files:**
- Modify: `mobile/src/components/LineChart.tsx`
- Test: `mobile/__tests__/linechart.test.tsx`

**Contexto:** `LineChart` lo usan `mobile/app/(tabs)/progreso.tsx` y `mobile/src/components/SessionSummary.tsx`. El prop es **opcional y aditivo**: ninguno de los dos cambia. Leé el archivo entero antes de tocarlo; hay 5 tests que deben seguir verdes.

**El punto crítico:** hoy `minY`/`maxY` salen SOLO de los datos. Si el colesterol viene en 100 y la referencia es 300, la línea se dibujaría fuera del área del gráfico — inútil justo cuando estás yendo bien, que es cuando querés confirmarlo. La referencia tiene que entrar al dominio.

- [ ] **Step 1: Write the failing tests**

Agregar al final de `mobile/__tests__/linechart.test.tsx`:

```tsx
test("la referencia entra al dominio del eje Y: si está por encima de los datos, el máx es la referencia", async () => {
  // Colesterol 100/120 con ref 300: sin esto la línea caería fuera del gráfico.
  await render(<LineChart data={[{ x: 0, y: 100 }, { x: 1, y: 120 }]} unit="mg" refLine={{ value: 300, label: "máx 300 mg" }} />);
  expect(labelText("linechart-max")).toBe("300");
  expect(labelText("linechart-min")).toBe("100");
});

test("la referencia también estira el dominio hacia abajo (piso de fibra por debajo de lo comido)", async () => {
  await render(<LineChart data={[{ x: 0, y: 40 }, { x: 1, y: 50 }]} unit="g" refLine={{ value: 30, label: "mínimo 30 g" }} />);
  expect(labelText("linechart-min")).toBe("30");
  expect(labelText("linechart-max")).toBe("50");
});

test("dibuja la línea de referencia con su etiqueta", async () => {
  await render(<LineChart data={[{ x: 0, y: 100 }, { x: 1, y: 120 }]} refLine={{ value: 300, label: "máx 300 mg" }} />);
  expect(screen.getByTestId("linechart-refline")).toBeTruthy();
  expect(labelText("linechart-reflabel")).toBe("máx 300 mg");
});

test("sin refLine no dibuja nada de referencia (los gráficos de Progreso no cambian)", async () => {
  await render(<LineChart data={[{ x: 0, y: 100 }, { x: 1, y: 120 }]} />);
  expect(screen.queryByTestId("linechart-refline")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- linechart
```

Expected: FAIL — el primero da `"120"` en vez de `"300"` (la referencia no entra al dominio).

- [ ] **Step 3: Implement**

En `mobile/src/components/LineChart.tsx`:

1. Agregar el prop a la firma:

```tsx
export function LineChart({
  data,
  height = 176,
  unit = "",
  refLine,
}: {
  data: XY[];
  height?: number;
  unit?: string;
  refLine?: { value: number; label: string };
}) {
```

2. Meter la referencia en el dominio. Reemplazar:

```tsx
  const minY = Math.min(...ys), maxY = Math.max(...ys);
```

por:

```tsx
  // La referencia entra al dominio del eje: si los datos están muy por debajo (colesterol 100 vs
  // ref 300), sin esto la línea caería fuera del área dibujada, que es justo cuando más importa.
  const refY = refLine ? [refLine.value] : [];
  const minY = Math.min(...ys, ...refY), maxY = Math.max(...ys, ...refY);
```

3. Dibujar la línea. Agregarla **justo antes** del `<Path d={toPath(pts)} .../>` (así la marca de datos queda por encima de la referencia, no tapada por ella):

```tsx
        {refLine && (
          <G>
            <Line
              testID="linechart-refline"
              x1={GL}
              y1={yPix(refLine.value)}
              x2={W - GR}
              y2={yPix(refLine.value)}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <SvgText
              testID="linechart-reflabel"
              x={W - GR}
              y={yPix(refLine.value) - 3}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {refLine.label}
            </SvgText>
          </G>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- linechart
```

Expected: PASS — 9 tests (los 5 que ya estaban + 4 nuevos). **Si alguno de los 5 viejos se rompe, no lo ajustes**: significa que el cambio afectó a Progreso y hay que arreglar el componente.

- [ ] **Step 5: Verify the tests bite**

Mutación: volvé `minY`/`maxY` a calcularse solo desde `ys` (o sea, sacá la referencia del dominio). Confirmá que fallan los dos primeros tests nuevos. Restaurá y confirmá verde.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/components/LineChart.tsx mobile/__tests__/linechart.test.tsx
git commit -S -m "feat(nutrición): LineChart acepta una línea de referencia dentro del dominio Y"
```

---

### Task 3: el gráfico en la pantalla del nutriente

**Files:**
- Modify: `mobile/app/nutricion/nutriente.tsx`
- Test: `mobile/__tests__/nutriente.test.tsx`

**Contexto:** leé `mobile/app/nutricion/nutriente.tsx` entero. Ya tiene el `ChipGroup` de rango (`days`), el hook `useMealsRange`, el ranking y sus empty states.

**Dónde va el gate:** el gráfico se muestra cuando `days >= 7` **y** `ranked.length > 0`. Lo segundo evita que en un rango totalmente vacío aparezcan dos mensajes distintos diciendo lo mismo: ya está el empty state de "Ningún alimento registrado aporta X en este período".

- [ ] **Step 1: Write the failing tests**

En `mobile/__tests__/nutriente.test.tsx`, primero hacé que el helper `meal` acepte un `eatenAt` opcional, **sin romper las llamadas que ya existen**:

```tsx
const meal = (items: any[], eatenAt = 1) => ({ id: "m", eatenAt, mealType: null, note: null, items });
```

Después agregá al final:

```tsx
// Julio 2026, hora local.
const at = (day: number) => new Date(2026, 6, day, 10).getTime();

test("con 'Día' no hay gráfico: un solo punto no es una curva", async () => {
  await render(<NutrienteScreen />);
  await waitFor(() => expect(screen.getByText("Huevo")).toBeTruthy());
  expect(screen.queryByTestId("linechart-max")).toBeNull();
});

test("con 7 días aparece la curva, con la referencia y la cobertura de registro", async () => {
  (listMeals as jest.Mock).mockResolvedValue([
    meal([item("Huevo", 120, 200)], at(10)),
    meal([item("Queso", 60, 100)], at(11)),
  ]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByTestId("linechart-refline")).toBeTruthy());
  // Promedio sobre los días CON registro (2), no sobre 7: (200+100)/2 = 150.
  expect(screen.getByText("Promedio 150 mg · 2 de 7 días con registro")).toBeTruthy();
});

test("un solo día con registro: no dibuja curva, lo dice", async () => {
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Huevo", 120, 200)], at(10))]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByText(/al menos dos días/)).toBeTruthy());
  expect(screen.queryByTestId("linechart-refline")).toBeNull();
});

test("rango sin ningún dato: solo el empty state que ya existía, sin nota de evolución duplicada", async () => {
  (listMeals as jest.Mock).mockResolvedValue([meal([item("Lechuga", 50, null)], at(10))]);
  await render(<NutrienteScreen />);
  await fireEvent.press(screen.getByText("7 días"));
  await waitFor(() => expect(screen.getByText(/Ningún alimento registrado aporta/)).toBeTruthy());
  expect(screen.queryByText(/al menos dos días/)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- nutriente
```

Expected: FAIL — `Unable to find an element with testID: linechart-refline`.

- [ ] **Step 3: Implement**

En `mobile/app/nutricion/nutriente.tsx`:

1. Agregar los imports:

```tsx
import { NUTRIENT_REFERENCES, NUTRIENT_REFERENCE_KIND } from "@pulsia/shared";
import { LineChart } from "../../src/components/LineChart";
import { dailyNutrientSeries } from "../../src/nutrition/nutrientSeries";
```

(`foodsHighestIn` y `RankNutrient` ya se importan de `@pulsia/shared`; sumá los dos nuevos a esa línea.)

2. Debajo de donde ya se calcula `ranked` y `unit`, agregar:

```tsx
  const series = dailyNutrientSeries(meals, nutrient);
  // Las saturadas son el 10% de la energía, así que su referencia depende de la meta de kcal, que
  // esta pantalla no carga: van sin línea. El tipo de NUTRIENT_REFERENCES ya las excluye.
  const refValue = nutrient in NUTRIENT_REFERENCES
    ? NUTRIENT_REFERENCES[nutrient as keyof typeof NUTRIENT_REFERENCES]
    : null;
  const refLine = refValue != null
    ? { value: refValue, label: `${NUTRIENT_REFERENCE_KIND[nutrient] === "min" ? "mínimo" : "máx"} ${refValue} ${unit}` }
    : undefined;
```

3. Insertar la card **antes** de la del ranking (o sea, antes del bloque `{!loading && !error && ranked.length > 0 && (` que renderiza "De mayor a menor aporte"):

```tsx
      {/* Con "Día" el gráfico sería un solo punto. El gate por `ranked.length` evita que un rango
          vacío muestre dos mensajes distintos diciendo lo mismo: ya está el empty state de abajo. */}
      {!loading && !error && days >= 7 && ranked.length > 0 && (
        <Card>
          <SectionTitle>Evolución</SectionTitle>
          {series.points.length >= 2 ? (
            <>
              <LineChart data={series.points} unit={unit} refLine={refLine} />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Promedio {series.average} {unit} · {series.points.length} de {days} días con registro
              </Text>
            </>
          ) : (
            <EmptyState>Registrá al menos dos días para ver la evolución.</EmptyState>
          )}
        </Card>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && bun run test -- nutriente
```

Expected: PASS — 12 tests (los 8 que ya estaban + 4 nuevos).

- [ ] **Step 5: Verify the tests bite**

Corré estas dos mutaciones y reportá qué pasó en cada una:

1. Cambiá el gate `days >= 7` por `days >= 1`. Debería fallar el test de "con 'Día' no hay gráfico".
2. Cambiá el divisor del promedio: en `nutrientSeries.ts`, dividí por `7` fijo en vez de `points.length`. Debería fallar el test de la cobertura (esperaría 150 y daría ~43).

Restaurá después de cada una.

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/nutricion/nutriente.tsx mobile/__tests__/nutriente.test.tsx
git commit -S -m "feat(nutrición): curva de evolución del nutriente con su referencia"
```

---

### Task 4: Verificación final + PR

- [ ] **Step 1: Run everything**

```bash
cd /Users/kilo/desarrollo26/pulsia && bun run test
cd /Users/kilo/desarrollo26/pulsia && bun run test:mobile
cd /Users/kilo/desarrollo26/pulsia && bun run typecheck
```

Expected: todo verde. Prestá atención a los tests de `progreso` y `SessionSummary`: son los otros consumidores de `LineChart`.

- [ ] **Step 2: Verify no new dependencies**

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main..HEAD --stat -- '**/package.json' bun.lock
```

Expected: **salida vacía**.

- [ ] **Step 3: Verify `ONBOARDING.md` is not committed**

```bash
cd /Users/kilo/desarrollo26/pulsia && git diff main..HEAD --name-only | grep ONBOARDING
```

Expected: sin coincidencias. **Usá `main..HEAD`, no `main`** — `git diff main` compara contra el árbol de trabajo y arrastra la modificación local del usuario.

- [ ] **Step 4: Push and open the PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git push -u origin feat/nutricion-evolucion-nutrientes
gh pr create --title "feat(nutrición): evolución del nutriente en el tiempo, con su referencia" --body "$(cat <<'EOF'
## Qué hace

La pantalla del nutriente ahora muestra, arriba del ranking, **cómo viene ese nutriente día a día** en el rango elegido, con la referencia OMS dibujada.

Cierra la tercera pregunta del dominio: "¿cómo vengo hoy?" la responde la pestaña Nutrientes, "¿quién me lo sube?" el ranking, y **"¿estoy mejorando?"** no la respondía nada. Saber qué alimento dispara el colesterol sirve para tomar una decisión; ver la curva sirve para saber si esa decisión funcionó.

## Decisiones que vale la pena mirar

- **Los días sin registrar no son un punto.** Un día sin cargar no es un día en que comiste 0: dibujarlo como 0 mentiría justo en la dirección peligrosa (los días que te olvidaste te bajarían el promedio). Por eso al lado del promedio va **"N de 30 días con registro"**: sin ese número no se sabe cuánto vale la curva.
- **El promedio es sobre los días con registro**, no sobre el rango.
- **La referencia entra al dominio del eje Y.** `LineChart` calculaba la escala solo desde los datos, así que una referencia por encima de todo (colesterol 100 vs ref 300) habría quedado fuera del gráfico — inútil justo cuando vas bien.
- **La fibra no lleva color distinto** aunque su referencia sea un piso y no un techo: la diferencia va en el texto de la etiqueta ("mínimo 30 g" vs "máx 300 mg"). Un semáforo invertido para un solo nutriente confunde más de lo que aclara.
- **Las saturadas van sin línea**: su referencia es el 10% de la energía, que depende de la meta de kcal, y esta pantalla no la carga.

## Notas de implementación

- Sin componente de gráfico nuevo: `LineChart` recibe un prop `refLine` **opcional y aditivo**; `progreso.tsx` y `SessionSummary.tsx` no cambian.
- `dailyNutrientSeries` agrupa por día **local** (`dateKey`) y suma con `sumNullableMicro`, el mismo helper que arma el total del día en la pestaña Nutrientes — así la curva no puede contradecir ese número.
- Cada punto se ancla al **mediodía** del día, no al `eatenAt`: el eje X representa el día, y el mediodía deja margen contra el DST.
- **Cero dependencias nuevas**, sin backend, sin migraciones → OTA a vc10.

## Spec y plan

- Spec: `docs/superpowers/specs/2026-07-16-nutricion-evolucion-design.md`
- Plan: `docs/superpowers/plans/2026-07-16-nutricion-evolucion.md`
EOF
)"
```

- [ ] **Step 5: Trigger the review**

```bash
cd /Users/kilo/desarrollo26/pulsia && gh pr comment <NRO> --body "@claude review"
```

---

## Notas para quien ejecute

- Tests del móvil: `bun run test -- <patrón>` desde `mobile/`.
- El cwd del shell persiste: usá `cd /Users/kilo/desarrollo26/pulsia && ...` con rutas absolutas en los `git add`. **Stageá solo tus archivos**, nunca `git add -A`.
- Si un test del plan afirma un número equivocado, **decilo en vez de ajustar la implementación para que pase**. Verificá la aritmética a mano.
- Si una mutación plausible no rompe ningún test, **reportalo** en vez de taparlo.
