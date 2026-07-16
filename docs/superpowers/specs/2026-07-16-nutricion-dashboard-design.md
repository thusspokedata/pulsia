# Dashboard de nutrición (pieza C) — diseño

Fecha: 2026-07-16
Estado: aprobado (pendiente de plan)

## Motivación

El **Detalle del día** (`mobile/app/nutricion/detalle.tsx`) hoy apila cinco cards en una
sola columna: calorías, macros, otros nutrientes, colesterol y líquido. Funciona, pero:

- **No hay lectura de composición.** Cuánto aportó cada comida al día, o qué % de las
  calorías vino de cada macro, solo se puede inferir sumando de a ojo.
- **Los micronutrientes no tienen contra qué compararse.** Se muestran los gramos crudos
  (`Azúcares 61 g`) sin referencia, así que el número no dice nada.
- **No se puede atribuir un exceso a un alimento.** Si el colesterol se fue a 400 mg, la
  pantalla no dice de dónde salió. El colesterol es el dato prioritario del usuario
  (colesterol alto + antecedentes familiares).

La referencia de producto es **MyFitnessPal**: pestañas Overview/Calories/Nutrients/Macros,
torta de calorías por comida, dona de macros con % real vs % meta, y "Foods Highest in X"
(que MFP cobra; acá es gratis).

## Alcance

**Entra:** las 4 pestañas dentro del Detalle del día, la torta de calorías por comida, la
dona de macros, las referencias fijas de la OMS para los micronutrientes, y "Alimentos con
más X" con selector Día/7 días/30 días.

**No entra:** gráficos de evolución de nutrientes en el tiempo (pieza aparte, decidido con
el usuario). Tampoco entra ningún cambio de backend, de schema o de dependencias.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
| --- | --- | --- |
| Dónde vive | Evoluciona el Detalle del día | El contenido actual se redistribuye entre las pestañas; no se duplica nada ni aparece una pantalla nueva que compita con la que ya existe. |
| Metas de micronutrientes | Referencias fijas OMS | No son metas personales calculadas; son referencias públicas. Se muestran como "ref", no como objetivo del usuario. |
| Alimentos con más X | Día por defecto + selector 7/30 | El día responde "¿qué comí hoy que me disparó esto?"; el rango responde "¿qué lo dispara siempre?". El backend ya acepta el rango. |
| Gráficos | Componentes SVG propios | El repo ya tiene 4 charts hechos a mano con `react-native-svg` y ninguna librería de charts. Cero dependencias nuevas = el fingerprint no cambia = sale por OTA a vc10 sin rebuild nativo. |
| Evolución en el tiempo | Fuera de alcance | Pieza aparte. |

## Arquitectura

### 1. `detalle.tsx` pasa a ser un shell

Hoy son 119 líneas con toda la UI inline. Queda como: título + nota explicativa +
`SegmentToggle` (`mobile/src/components/SegmentToggle.tsx`, ya existe, ya lo usan Perfil y
Objetivo) + el tab activo. Estado local `useState<TabKey>("resumen")`, sin persistir entre
visitas.

Cada tab es su propio componente en `mobile/src/nutrition/tabs/`, para que ningún archivo
crezca de más. Todos reciben lo que ya devuelve `useNutritionDay(offset)` — el hook **no
cambia**; se llama una sola vez en el shell y se pasa por props.

| Tab | Contenido |
| --- | --- |
| **Resumen** | Lo de hoy: calorías (comido/meta/restante + barra + línea de ejercicio), macros en barras, líquido. Es el landing. Nada se pierde. |
| **Calorías** | Torta de kcal por comida + lista con kcal y % de cada una. |
| **Nutrientes** | Tabla de azúcares/fibra/saturadas/sal/colesterol, cada uno con barra contra su referencia. Tap en una fila → "Alimentos con más X". |
| **Macros** | Dona de macros (% real vs % meta) + gramos. |

El `card` y el `bar` que hoy están inline en `detalle.tsx` los usan varios tabs, así que
salen a `mobile/src/nutrition/tabs/ui.tsx` como helpers compartidos.

### 2. Cálculos puros en `shared/`

**`shared/src/nutrition/references.ts`** — referencias OMS, con la fuente en comentarios:

```ts
export const NUTRIENT_REFERENCES = {
  fiber_g: 30,        // OMS/EFSA: ≥25–30 g/día
  salt_g: 5,          // OMS: <5 g/día de sal
  sugars_g: 50,       // OMS: azúcares libres <10% de la energía (~50 g en una dieta de 2000 kcal)
  cholesterol_mg: 300, // referencia clásica de 300 mg/día
} as const;

// Saturadas: la OMS las acota al 10% de la ENERGÍA, no a gramos fijos → depende de la meta.
export function saturatedFatRefG(goalKcal: number): number; // goalKcal * 0.10 / 9
```

El `300` hoy está hardcodeado en `detalle.tsx:101`; se muda acá y el magic number desaparece.
Las referencias son fijas y no dependen del perfil, salvo saturadas, que depende de la meta
de kcal (y por lo tanto no se muestra si la meta está incompleta).

**`shared/src/nutrition/breakdown.ts`** — tres funciones puras, cada una con su test:

- `caloriesByMeal(meals: Meal[]): MealSlice[]` — agrupa por `mealType` y suma kcal.
  `mealType` es **nullable** en el schema, así que hay un bucket **"Sin tipo"** al final.
  Orden canónico: desayuno, almuerzo, cena, snack, sin tipo. Devuelve `{key, label, kcal, pct}`,
  con `pct` sobre el total del día. Las comidas con 0 kcal se omiten.
- `macroSplit(totals, goal): MacroSlice[]` — kcal de cada macro (proteína 4, carbos 4, grasa 9),
  `pctActual` sobre las kcal **derivadas de los macros** (no sobre `dayTotals.kcal`: pueden
  diferir por redondeos de etiqueta, y una torta tiene que cerrar en 100%), y `pctTarget`
  desde la meta. Sin meta → `pctTarget: null`.
- `foodsHighestIn(meals, nutrient): FoodRank[]` — agrupa los ítems por nombre, suma el
  nutriente, ordena descendente. Los ítems sin el dato (`null`) se saltean. Devuelve
  `{name, amount, pctOfTotal}`.

Los valores salen del **snapshot por ítem** (`meal.items[].sugars_g` etc.), que ya está
congelado por comida: editar un alimento del catálogo no reescribe el histórico. Estas
funciones no consultan el catálogo.

### 3. Un solo componente de gráfico

**`mobile/src/components/PieChart.tsx`**, con `react-native-svg` (ya es dependencia; la usan
`LineChart`, `MultiLineChart` y `MuscleMap`):

```ts
interface Props {
  data: { label: string; value: number; color: string }[];
  size: number;
  innerRadius?: number;   // 0 (default) = torta; > 0 = dona
  center?: ReactNode;     // texto del centro de la dona
}
```

Un solo componente cubre los dos casos: la torta de Calorías (`innerRadius` por defecto) y
la dona de Macros (`innerRadius` > 0 + `center`). Un componente, un test, cero dependencias
nuevas. Arcos como `path` SVG calculados a mano, mismo patrón que los charts que ya existen.
La leyenda va aparte, en cada tab, porque el formato del valor cambia (kcal vs %).

Los colores los pasa el que llama, tomados de `mobile/src/theme/tokens.ts` — el componente no
elige paleta. Cada tab define la suya (una por comida, una por macro) y la reusa en la leyenda,
así el color de la porción y el de la etiqueta no se pueden desincronizar.

Casos borde del componente: `data` vacío o suma 0 → no renderiza arcos (el tab muestra su
empty state); una sola porción → círculo completo (un arco de 360° degenera en SVG, así que
se resuelve con un `circle`).

### 4. El selector Día/7/30

Vive **solo** dentro de "Alimentos con más X", no en toda la pantalla — el resto del Detalle
es del día por definición.

- **Día** reusa los `meals` que `useNutritionDay` ya tiene cargados. Sin fetch.
- **7/30 días** disparan un hook nuevo `mobile/src/nutrition/useMealsRange.ts`, que llama
  `listMeals(url, from, to)` (el backend ya acepta el rango) y devuelve `{meals, loading, error}`.
  Es **lazy**: no pide nada hasta que abrís un nutriente y elegís 7 o 30.

El rango se calcula desde el `offset` del día que estás mirando hacia atrás, con `dayBounds`,
respetando la convención del repo (offset positivo = pasado).

## Manejo de errores

- **Nutriente sin dato** (todos los ítems del día con `null`) → la fila muestra `—` y no es
  tappeable; queda fuera del ranking.
- **Día sin comidas** → cada tab muestra su empty state ("Todavía no registraste comidas").
  Ningún gráfico se renderiza con datos vacíos.
- **Meta incompleta** (`goalView.status === "incomplete"`) → Resumen mantiene el link actual
  a Objetivo; Macros muestra la dona solo con `pctActual` (sin comparación); la referencia de
  saturadas no se muestra.
- **Falla el fetch del rango** → error inline dentro de la vista del nutriente, con el ranking
  del día todavía visible. No rompe el tab ni la pantalla.

## Testing

- `shared/`: tests unitarios de `references` y `breakdown` con `bun test`. Casos:
  `mealType` null, día vacío, un solo alimento, nutrientes null salteados, `pctActual` cerrando
  en 100%, `saturatedFatRefG` contra un valor conocido.
- `mobile/`: tests de render con `jest-expo`. Cambiar de tab muestra el contenido esperado;
  `PieChart` renderiza tantos arcos como porciones; la fila de un nutriente sin dato no navega.
- TDD: test que falla primero, en cada tarea.

## Entrega

Dos PRs, ninguno con migración ni dependencias nuevas → los dos salen por **OTA a vc10**
(fingerprint `784872cb…`, hay que verificarlo en la salida de `eas update`).

- **PR1** — `shared/` (`references` + `breakdown` + tests), `PieChart`, y el refactor de
  `detalle.tsx` a shell con las 4 pestañas. Nutrientes queda como tabla con referencias, sin
  el ranking todavía.
- **PR2** — "Alimentos con más X" + el selector Día/7/30 (`useMealsRange`).

## Fuera de alcance / follow-ups

- Gráficos de evolución de nutrientes en el tiempo → pieza aparte.
- Indicador `~` cuando un total de micros es parcial (algún ítem sin el dato) — ya estaba
  anotado como opcional desde el PR de campos nutricionales; sigue pendiente.
