# Crear comida (recetas) — Diseño

> Fecha: 2026-08-13. Estado: aprobado por el owner, listo para plan de implementación.

## Problema / motivación

Hoy el dominio Nutrición tiene dos piezas:

- **`Food`** (catálogo): un alimento con macros/micros **por 100g/100ml** (alta por foto+IA, por
  nombre, match contra USDA, o "que la IA complete"). Compartido entre usuarios.
- **"Nueva comida"** (`mobile/app/nutricion/nueva-comida.tsx`): arma una **comida puntual** (un
  `Meal`) eligiendo alimentos del catálogo + cantidades, y snapshotea los totales. Se rearma **desde
  cero cada vez**; no hay dish reutilizable.

Falta el concepto de **receta / plato reutilizable**: el owner cocina una "cazuela de pollo" una vez,
define sus ingredientes y pesos, y después quiere **registrar porciones** de ese plato varios días
solo pesando la porción. Además, cuando cocina, pesa cada ingrediente crudo, pero el peso del plato
terminado **no** es la suma de los ingredientes: se agrega agua/caldo y parte se evapora.

## Decisiones tomadas (brainstorming con el owner)

1. **Agua / rendimiento — "ambas: rendimiento opcional".** El total de nutrientes = suma de los
   ingredientes. El peso total **por defecto** = suma de los pesos de los ingredientes (podés sumar
   agua/caldo como un ingrediente más si querés). **Opcionalmente**, si pesás el plato terminado,
   cargás ese **peso cocido** (`cookedWeightG`) y la app recalibra la densidad (nutrientes por gramo)
   sobre ese peso real. Nunca obliga a pesar el plato. El agua agregada y la evaporación quedan
   capturadas por el peso cocido; sin él, la suma de ingredientes es la mejor aproximación.

2. **La receta ES un `Food` del catálogo (Approach A).** Al terminar de construirla queda guardada
   como un `Food` normal con `basis: per_100g` y macros/micros **por 100g** derivados. Ventaja: el
   registro de porciones **reusa el flujo "+ nueva comida" existente** (buscar la receta + poner
   gramos), y la receta hereda gratis el **semáforo nutricional** y el desglose "qué alimentos aportan
   X". Se marca como receta para poder listarla/editarla aparte.

## Modelo de datos

### `Food` — nuevos campos

- **`recipe` (JSONB, nullable)** — presencia = "este Food es una receta". Autoridad única de "es
  receta". Estructura:
  ```
  {
    items: Array<{ foodId: string; quantity: number; unit: "g" | "ml" | "unit" }>,
    cookedWeightG: number | null   // peso del plato terminado; null = usar la suma de ingredientes
  }
  ```
  Guarda la **composición viva** (referencias + cantidades) para poder editar y **recalcular**. Los
  macros/micros per-100g del Food son un **snapshot** derivado al guardar (igual criterio que los
  `Meal`, que snapshotean al registrar).

- **`sourceMacros: "recipe"`** — nuevo valor del enum `SourceMacrosSchema`
  (`shared/src/schemas/nutrition.ts`), sumado como se hizo con `"usda"`. Los macros de una receta no
  son de etiqueta/USDA/IA/manual sino **compuestos**; el chip lo muestra como **"receta"**
  (`SourceChip`). `recipe != null` es la autoridad de "es receta"; `sourceMacros` se mantiene en sync
  para el display.

### Derivación (pura, testeable, en `shared`)

Al guardar la receta, por cada ingrediente:

```
scaled       = foodMacrosForQuantity(ingredientFood, quantity, unit)   // ya existe en shared
sumGrams     = Σ scaled.grams                                          // ml se cuenta como g 1:1, como hoy
pesoEfectivo = cookedWeightG ?? sumGrams
totalNutr    = Σ scaled[nutriente]   (respetando null: null si NINGÚN ingrediente lo tenía)
```

El `Food` resultante (por 100g):

```
kcal_100      = totalKcal    / pesoEfectivo * 100
protein_g_100 = totalProtein / pesoEfectivo * 100
... (idem carbs, fat, y los 30 nutrientes del registro)
```

- Un micro que **ningún** ingrediente tenía → `null` (nunca 0). Se reusa el criterio de
  `sumNullableMicro` / `sumNutrient` (ya en `shared/src/nutrition/macros.ts`).
- `basis: "per_100g"` (un plato cocido se pesa en gramos). `unitWeightG: null` en v1 (se loguea por
  gramos; ver "Fuera de alcance").

## UX

### 2.1 "Crear comida" (constructor)

- **Entrada nueva en `catalogo.tsx`** (el owner pidió explícitamente una sección "crear comida" en el
  catálogo) → pantalla constructor. Similar a "nueva comida" pero produce un `Food`, no un `Meal`.
- Campos: **nombre** de la receta; lista de **ingredientes** (buscar en el catálogo, agregar con peso
  en **g** — o ml/unidad según el `basis` del alimento, con `allowedUnits` como hoy); campo
  **opcional "peso cocido"** ("pesá la olla/fuente terminada").
- **Ingrediente que no está en el catálogo** → afordance "agregar con foto / por nombre" que reusa
  `agregar-alimento` (match USDA + botón "que la IA complete") y **vuelve al constructor** con el
  alimento nuevo ya agregado. Cubre el pedido del owner: "los que no están, la IA los busca y los
  agrega".
- **Preview en vivo**: kcal/macros totales + los mismos **por 100g** (para que el owner vea la
  densidad resultante).
- Guardar → crea (o edita) el `Food`-receta con su `recipe` JSONB + snapshot per-100g.

### 2.2 Registrar una porción — **sin UI nueva**

El flujo **"+ nueva comida" (`nueva-comida.tsx`) queda igual**. La receta aparece en su buscador de
catálogo como un alimento más ("Cazuela de pollo"); el owner pone los **gramos de su porción** y
escala solo (`foodMacrosForQuantity` sobre el per-100g). No se construye ninguna pantalla de registro
de porciones.

### 2.3 Editar una receta

Abrir una receta desde el catálogo reabre el **constructor** (no el editor de alimento común), con sus
ingredientes y peso cocido precargados. Guardar **recalcula** el snapshot.

## Bordes / casos

- **Ingrediente borrado o cambiado de unidad/formato**: mismo criterio que los `Meal` hoy — el
  constructor detecta el ítem irreconstruible (`allowedUnits` ya no lo admite, o el food ya no existe)
  y pide recargarlo. El `Food`-receta ya guardado sigue **válido** (snapshot), no se rompe.
- **Staleness**: si un ingrediente cambia sus valores después, la receta conserva el snapshot viejo
  hasta que la reabrís y guardás (botón "recalcular"). Consistente con cómo los `Meal` snapshotean.
- **Semáforo + desglose gratis**: como la receta es un `Food` per-100g, el semáforo nutricional
  (`nutrientLevel`) y "qué alimentos aportan X" funcionan sin código nuevo. El desglose atribuye a la
  receta como un único alimento (esperado).
- **ml ≈ g**: la suma de `grams` trata ml como g 1:1 (comportamiento actual de `foodMacrosForQuantity`).
  Para densidad exacta con muchos líquidos, el owner pesa el plato (`cookedWeightG`).
- **Catálogo compartido**: la receta se crea como Food del owner (`mine`); sigue las mismas reglas de
  visibilidad/compartición que cualquier alimento (fuera de alcance cambiarlas acá).

## Fuera de alcance (v1)

- **"Porciones" con número** (definir "esta olla = 4 porciones" y loguear "1 porción" en vez de
  gramos). El owner **pesa cada porción**, así que v1 es solo gramos. Idea futura: `unitWeightG =
  pesoEfectivo / nServings` para habilitar unidad "porción".
- **Recetas anidadas como ingrediente**: técnicamente funciona (una receta es un Food), pero no se
  promociona ni se testea como caso de primera clase en v1.
- **Tabla relacional para ingredientes**: se elige **JSONB** (`recipe`) por simplicidad y consistencia
  con `components` de suplementos; se acepta el mismo tradeoff de integridad referencial que los
  `MealItem` (que ya toleran `foodId` de un alimento borrado).

## Testing (qué cubrir)

- **Puro (`shared`)**: la derivación receta→per-100g. Casos: `cookedWeightG` presente vs. ausente;
  micro que ningún ingrediente tiene → `null`; mezcla de ingredientes g/ml/unidad; un solo
  ingrediente; recalibración de densidad (mismo total de nutrientes, distinto peso cocido → distinta
  densidad).
- **Backend**: alta/edición de un Food con `recipe` JSONB; `sourceMacros: "recipe"` persiste;
  re-derivación al editar; el snapshot per-100g coincide con el cálculo puro.
- **Móvil**: el constructor arma el `recipe` correcto; el ingrediente faltante enruta a
  `agregar-alimento` y vuelve; registrar una porción de la receta desde "+ nueva comida" escala bien
  (testear **la costura**, no solo las piezas).

## Archivos que probablemente se tocan (orientativo, no vinculante)

- `shared/src/schemas/nutrition.ts` — `SourceMacrosSchema` + `recipe` en `FoodSchema`/`FoodInputSchema`.
- `shared/src/nutrition/` — nueva función pura de derivación receta→per-100g (+ tests).
- `backend/src/nutrition/` — persistencia del `recipe` JSONB, migración, alta/edición, re-derivación.
- `mobile/app/nutricion/` — pantalla constructor "crear comida"; entrada en `catalogo.tsx`; ruteo de
  edición.
- `mobile/src/nutrition/` — helper del constructor (hermano de `mealForm.ts`); `SourceChip` chip
  "receta".
