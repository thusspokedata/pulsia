# Barras de macro en dos colores + el ejercicio ajusta los carbos — Diseño

**Fecha:** 2026-07-21
**Rama:** `feat/macros-ejercicio-barras` (desde `main` tras #171)
**Dominio:** 2 — Nutrición

## Objetivo

Dos problemas de la card de Nutrición, que resultan ser el mismo problema visto desde dos lados.

1. **Pasarse de un macro borra la información de cuánto llevabas.** Hoy la barra se pinta ámbar
   y llena al 100%. Grasa 119 g contra una meta de 63 se ve igual que 200 g contra 63.
2. **El ejercicio no ajusta las metas de macros, solo las kcal.** El gasto entra únicamente al
   restante de kcal ([`goalView.ts:34`](../../../mobile/src/nutrition/goalView.ts)); las metas de
   macros salen de `computeNutritionGoal` y **no ven el ejercicio en absoluto**.

El (2) hace que la card se contradiga a sí misma por construcción. Con 1667 kcal de ejercicio:

```
2087 / 2112 kcal
te quedan 1692 kcal          ← hay margen de sobra
Gras 119 / 63 g · 56 de más  ← pero el macro ya está en rojo
```

No es un bug puntual: hay **dos presupuestos distintos** dibujados en la misma tarjeta.

## Principio rector

> **Las metas de energía escalan con el gasto. Los límites de salud no.**

Todo el diseño se deriva de esta frase. Es lo que decide qué se ajusta y qué no:

| Objetivo | ¿Escala con el ejercicio? | Por qué |
|---|---|---|
| kcal | **Sí** | Ya lo hace hoy. Es literalmente energía. |
| Carbohidratos | **Sí** | El glucógeno es el combustible del entrenamiento. La energía extra se repone con carbos. |
| Proteína | **No** | La meta está fijada **por peso corporal** (2.0 g/kg en déficit, 1.8 si no — `goal.ts`), no por gasto. Quemar 1667 kcal no duplica la necesidad proteica: es un piso diario, no un presupuesto. |
| Grasa | **No** | Tiene un piso por función hormonal, pero el ejercicio no "pide" más grasa. |
| Colesterol | **No** | No es un presupuesto de energía, es un **límite de salud**. El ejercicio mejora el perfil lipídico en sangre (HDL arriba, triglicéridos abajo), pero eso no habilita a comer más colesterol. 300 mg son 300 mg. |
| Saturadas | **No** | Mismo razonamiento. Ver la trampa de implementación abajo, porque acá el error es fácil de cometer. |
| Sal, azúcares | **No** | Límites de salud. |
| Fibra | N/A | Es un piso (`NUTRIENT_REFERENCE_KIND`), nunca se "pasa". |

**Decisión del owner (2026-07-21):** el bonus va **entero a carbos**, no repartido proporcionalmente
entre los tres macros. Repartir proporcional haría que la card "cierre" (nada quedaría en ámbar hoy)
pero a costa de afirmar que se necesitan 236 g de proteína, que es falso.

## Arquitectura

### 1. El ajuste NO muta el objeto `goal`

Ésta es la decisión estructural, y es lo que impide romper el colesterol.

La implementación obvia —inflar `goal.kcal` con el ejercicio y devolver el mismo tipo— **no se
puede hacer**. `saturatedFatRefG(goalKcal)` deriva el techo de saturadas como el 10% de esa cifra
([`references.ts:24`](../../../shared/src/nutrition/references.ts), consumido en
[`NutrientesTab.tsx:37`](../../../mobile/src/nutrition/tabs/NutrientesTab.tsx)). Inflar `goal.kcal`
subiría el límite de saturadas por haber salido a correr — exactamente el error que el principio
rector prohíbe.

Entonces `computeNutritionGoal` queda **intacta** y el ajuste vive en una función pura nueva, en
`shared/src/nutrition/goal.ts`:

```ts
export interface AdjustedTarget {
  base: number;
  bonus: number;   // 0 si no hubo ejercicio
  total: number;   // base + bonus
}

export interface ExerciseAdjustedTargets {
  kcal: AdjustedTarget;
  protein_g: AdjustedTarget;  // bonus siempre 0
  carbs_g: AdjustedTarget;    // bonus = round(exerciseKcal / 4)
  fat_g: AdjustedTarget;      // bonus siempre 0
}

export function exerciseAdjustedTargets(
  goal: Extract<NutritionGoalResult, { status: "ok" }>,
  exerciseKcal: number,
): ExerciseAdjustedTargets;
```

**Los límites de salud no aparecen en esta función.** No es un olvido, es la invariante — y va con
test de regresión que la fija, porque es justo el tipo de cosa que un refactor futuro "arregla" por
consistencia y rompe en silencio.

`protein_g` y `fat_g` devuelven `bonus: 0` en vez de omitirse, para que los tres macros tengan la
misma forma y la UI no necesite ramas por macro.

Casos borde: `exerciseKcal` no finito, negativo o 0 → todos los `bonus` en 0 (nunca un bonus
negativo, que restaría meta a quien no entrenó). 4 kcal/g de carbohidrato, consistente con
`macroSplit`.

### 2. La barra de dos segmentos

Helper puro nuevo, `barSegments(value, target) → { fillPct, overPct }`:

| caso | turquesa (`fillPct`) | naranja (`overPct`) |
|---|---|---|
| `value ≤ target` | `value / target` | `0` |
| `value > target` | `target / value` | `(value − target) / value` |
| `value > target`, `kind = "floor"` | `100` | `0` |
| `target ≤ 0` o no finito | `0` | `0` |

La barra representa siempre **lo consumido**, partida en la línea de la meta. Grasa 119/63 →
turquesa 53%, naranja 47%. Al doble de la meta, mitad y mitad. Los dos porcentajes suman 100 cuando
hay exceso, así que no queda track vacío.

**La fibra obliga a un tercer prop.** Es un piso (`NUTRIENT_REFERENCE_KIND.fiber_g === "min"`):
pasarse es bueno y nunca se pinta ámbar. Un `Bar` que solo mire `value` y `target` no puede saberlo
y le pintaría el exceso en naranja. Hoy no pasa porque el `over` se lo calcula `NutrientesTab`, que
sí conoce el `kind`. Entonces:

```ts
Bar({ value, target, kind = "limit" })   // kind: "limit" | "floor"
```

Con `kind="floor"` el exceso se absorbe en el segmento turquesa (`fillPct` clampeado a 100,
`overPct` siempre 0). `NutrientesTab` lo deriva de `NUTRIENT_REFERENCE_KIND`. El default es
`"limit"` porque es el caso mayoritario.

`Bar` pasa de `{ pct, over }` a `{ value, target, kind }` y deriva los segmentos sola. Hoy cada call-site
calcula su `pct` y su `over` por separado y los pasa como dos props independientes: es la forma que
permite que el color y el texto se contradigan, y esta app ya pagó ese tipo de bug. Con una sola
fuente el estado inconsistente deja de ser representable.

### 3. Unificar la barra duplicada

La card del tab en [`nutricion.tsx:115`](../../../mobile/app/(tabs)/nutricion.tsx) tiene la barra
copiada a mano en vez de usar `Bar`. El cambio toca las dos, así que se unifica: `Bar` gana un prop
opcional `height` (6px para el tab, 8px por defecto para el detalle). Sin esto hay que acordarse de
aplicar cada cambio futuro en dos lugares.

Call-sites a migrar: `ResumenTab.tsx` (×2), `NutrientesTab.tsx`, `nutriente.tsx`, `nutricion.tsx`.

### 4. Presentación

Con los números reales del reporte:

```
2087 / 2112 kcal          +1667 por ejercicio
te quedan 1692 kcal
Prot 65 / 132 g · faltan 67
Carb 198 / 254 g +417 ejercicio · faltan 473
Gras 119 / 63 g · 56 de más        ← turquesa 53% + naranja 47%
Colesterol 254 / 300 mg            ← sin cambios, entrene o no
```

- **Base + bonus explícito.** La fila muestra la meta base y el añadido etiquetado, nunca un total
  sin explicación: `254 g +417 ejercicio` en vez de `671 g` a secas. El usuario no pierde de vista
  su meta real de día de descanso.
- El sufijo `+N ejercicio` aparece **solo si hay ejercicio ese día**. Un día de descanso se ve
  exactamente igual que hoy.
- La barra y el restante miden contra el **total** (base + bonus); el `over` se sigue derivando del
  restante redondeado, como hoy, para que color y texto no se contradigan en el borde `.5`.
- El encabezado de kcal mantiene `2087 / 2112` con el bonus al lado. **No** pasa a `2087 / 3779`:
  sería coherente con la barra pero incoherente con las filas de macros, que muestran base.

## Alcance

Las dos barras de colores van en **todos los límites**, macros y micros por igual (sal 7/5 g →
turquesa hasta 5, naranja los 2 de más). Un solo lenguaje visual y un solo lugar donde tocar el
código. La fibra no cambia: es un piso.

El ajuste por ejercicio, en cambio, es **solo de macros**. Ningún micro se toca.

## Tests

Cada test nuevo se verifica **por mutación** antes de darlo por bueno (convención del repo).

**`shared/` — `exerciseAdjustedTargets`:**
- El bonus va entero a carbos: `bonus = round(kcal/4)`, y `protein_g.bonus === 0`, `fat_g.bonus === 0`.
- Sin ejercicio (0) → los tres `total` iguales a los `base` y todos los `bonus` en 0.
- Ejercicio negativo / `NaN` / `Infinity` → tratados como 0, nunca bonus negativo.
- **Regresión de la invariante:** con un ejercicio grande, `saturatedFatRefG` evaluado sobre la meta
  del usuario devuelve **el mismo valor** que sin ejercicio. Este test es el que protege el principio
  rector; si alguien inflara `goal.kcal`, éste es el que se pone en rojo.

**`mobile/` — `barSegments`** (vive junto a `Bar` en `mobile/src/nutrition/tabs/ui.tsx`, no en
`shared/`: es matemática de presentación, no una regla nutricional, y ningún consumidor de `shared`
la necesita):
- Bajo la meta: `overPct === 0` y `fillPct` proporcional.
- En la meta exacta: `fillPct === 100`, `overPct === 0` (no se pinta naranja al llegar justo).
- Pasado: los dos segmentos suman 100; grasa 119/63 → 53/47.
- `kind = "floor"` pasado de largo (fibra 45/30) → `fillPct 100`, `overPct 0`. Con `kind = "limit"`
  los mismos números dan dos segmentos: es la aserción que fija que el prop hace algo.
- `target = 0` y `target` negativo → ambos en 0, sin división por cero.

**Tests existentes cuyo significado cambia** (actualizarlos es parte del trabajo, no daño colateral):
`detalle.test.tsx:125` afirma hoy que la barra de sal excedida tiene `backgroundColor === warning`.
Con el diseño nuevo el segmento con ese `testID` es el **turquesa**, y el ámbar es el segmento
hermano. El test pasa a asertar sobre los dos. `nutriente.test.tsx:87-96` (barras de ranking) y
`detalle.test.tsx:139` (fibra al 100%) sobreviven sin cambios, y por eso son buenos canarios.

**`mobile/` — render:**
- Un macro excedido dibuja **dos** segmentos, y el turquesa **no** ocupa el 100%. La mutación a
  vigilar acá es la del §0-AHORA del ONBOARDING: un test que solo mire el color del segmento naranja
  pasaría también con el turquesa en 100% detrás. Hay que asertar sobre los **dos** anchos.
- Con ejercicio > 0, la fila de carbos muestra el sufijo `+N ejercicio`; con ejercicio 0, **no** lo
  muestra (las dos direcciones).
- La fila de colesterol es idéntica con y sin ejercicio.

## Riesgos

- **Todo descansa en que las kcal de ejercicio sean confiables.** Con "todo a carbos", 1667 kcal casi
  triplican la meta de carbos. Si el número viene de un `.FIT` con kcal del reloj (`kcalSource:
  device`), bien. Si es un estimado por MET/Keytel, un error del 30% mueve la meta de carbos ~125 g.
  No se toca la estimación en este trabajo, pero es donde el diseño se rompería.
- **La grasa excedida queda más visible, no menos.** Al dejar de pintarse ámbar los otros macros en
  días de entrenamiento, el que realmente se pasó queda solo en naranja. Es el comportamiento
  correcto y es deliberado.

## Fuera de alcance

- Cambiar la estimación de gasto (`estimateCardioBurn` / `dayExerciseBurn`).
- El encabezado con denominador ajustado (`2087 / 3779`).
- La paleta categórica de la torta de Calorías, que sigue pendiente de decisión del owner
  (§0-BACKLOG del ONBOARDING). Este trabajo no la toca ni la desbloquea.
- Los avisos sobre totales estimados (Pieza 2 del backlog).
