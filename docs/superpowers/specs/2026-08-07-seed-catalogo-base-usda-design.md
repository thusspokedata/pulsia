# Seed del catálogo base de alimentos desde USDA

Fecha: 2026-08-07
Estado: aprobado (brainstorming)

## Problema

El catálogo de alimentos (`food`, compartido entre usuarios) tiene hoy ~132 filas que son casi
todas productos de marca y platos de restaurante que el owner fotografió. Falta la base: la lista
de **ingredientes canónicos** de un plan de alimentación por intercambios, organizada en las
imágenes del onboarding en cinco grupos (Proteínas, Carbohidratos, Grasas, Verdura, Fruta).

Queremos sembrar esos ingredientes que faltan, cada uno con su información nutricional completa
(4 macros + 30 micronutrientes) tomada de la copia local de USDA (`usda_food`).

## Alcance

- **Solo ingredientes simples.** Las 4 líneas combinadas de lácteos de la imagen de Proteínas
  ("Leche desnatada + 1 yogur 0 %", etc.) se **excluyen**.
- Objetivo ≈ 130 ítems de las imágenes; ya presentes ~12–15 (por nombre equivalente); a sembrar
  ≈ **110–115**.
- Owner de las filas sembradas: el dueño del catálogo compartido, pasado por `SEED_OWNER_ID` al
  correr el script (sin default en código: el repo es público, el UUID del dueño no vive acá).

## Decisiones

1. **Procedencia de los macros: se agrega `"usda"` al enum `SourceMacros`.**
   Hoy el enum es `label | ai | manual`. Estos alimentos derivan sus macros de USDA (no de una
   etiqueta, ni de la IA, ni tipeados a mano), así que etiquetarlos con cualquiera de los tres
   mentiría sobre la procedencia — algo que el código cuida explícitamente (`assemble.ts`,
   `nutrition.ts`). Se extiende el enum a `label | ai | manual | usda` y el chip de procedencia
   (`SourceChip`, móvil y web) muestra "USDA". `sourceMicros` sigue siendo `"usda"` (ya existe).

2. **fdcId curado a mano** (no auto-match ni pipeline de IA). Cada ingrediente se mapea a una fila
   concreta de `usda_food`, prefiriendo `foundation`/`sr_legacy` en su forma cruda/simple ("raw",
   "cooked" según corresponda) por sobre `survey`/marcas. Da exactitud y determinismo, sin pagar
   ~110 llamadas de IA.

3. **Script standalone, idempotente, revisable** (NO el `db:seed` de arranque, que es genérico y
   solo siembra ejercicios + usuario default). Es una población de datos de una sola vez.

## Arquitectura

Dos archivos nuevos en `backend/scripts/`:

- **`seed-food-catalog.data.ts`** — la lista curada. Por ítem:
  `{ name: string, basis: "per_100g", unitWeightG: number | null, fdcId: number }`,
  agrupada y comentada por grupo de macro. Los `fdcId` se resuelven consultando `usda_food` (vía
  `ssh nextcloud` → `psql`), eligiendo la fila cruda/simple de mejor tipo.
  - Todos `per_100g` (los pocos "líquidos" del set —aceites— USDA los reporta por 100 g).
  - `unitWeightG: null` para TODOS: el plan es por raciones/gramos, no por unidad, y no queremos
    inventar pesos medios por pieza. La app permite loguear en gramos.
  - Los ítems ya presentes con otro nombre (Plátano↔Banana, Almendras↔Almendra, etc.) simplemente
    no se incluyen en la lista, así no se duplican.

- **`seed-food-catalog.ts`** — el ejecutor. Para cada entrada:
  1. `getUsdaFood(db, fdcId)` → fila USDA (34 valores).
  2. Construye un `FoodInput`: **macros y micros salen ambos de la fila USDA** (los 4 macros +
     los 30 micronutrientes, mapeados por `nutrientColumn`/el registro `NUTRIENTS`),
     `sourceMacros: "usda"`, `sourceMicros: "usda"`, `usdaFdcId: fdcId`, `name`, `basis`,
     `unitWeightG`.
  3. `insertFood(db, OWNER_ID, input)`.
  - **Idempotente**: antes de insertar, trae los nombres existentes del catálogo y **saltea** los
    que ya existen (case-insensitive). Salvaguarda ante correr dos veces.
  - **`--dry-run`**: reporta qué insertaría / saltearía / no matcheó, sin escribir.
  - Loguea: insertados, salteados (ya existían), sin fila USDA (fdcId inválido).

### Función de construcción

Una función pura `foodInputFromUsdaRow(row, { name, basis, unitWeightG }): FoodInput` que reparte
las 34 columnas de la fila en los campos del `FoodInput`, reutilizando la partición de nutrientes
del registro (misma fuente que `assemble.ts`: macros = los 4 núcleo; el resto por `NUTRIENT_KEYS`).
Se testea aparte (fila USDA de fixture → FoodInput esperado).

## Cómo corre

La imagen del backend trae bun + el código fuente y `WORKDIR /app/backend`, así que corre en la Pi:

```bash
ssh nextcloud
export SEED_OWNER_ID=<uuid-del-dueño-del-catálogo>
docker compose -f ~/pulsia/deploy/docker-compose.yml exec -e SEED_OWNER_ID \
  backend bun scripts/seed-food-catalog.ts --dry-run
# revisar salida; luego sin --dry-run
```

El `data.ts` se revisa (nombre → descripción USDA elegida) **antes** de correr contra prod. Primero
dry-run.

## Testing

- `foodInputFromUsdaRow`: fixture de fila USDA → FoodInput (macros+micros presentes, sources y
  fdcId correctos, partición completa).
- `seed-food-catalog.data.ts`: invariantes de la lista — nombres únicos, `basis` válido,
  `fdcId` entero positivo, sin ítems del set excluido.
- Enum `SourceMacros`: el schema acepta `"usda"`; el `SourceChip` lo mapea a una etiqueta visible.
- La lógica de "saltear existentes" (case-insensitive) con un catálogo de fixture.

## Fuera de alcance

- Combos de lácteos y cualquier plato compuesto.
- Re-etiquetar / limpiar los 132 alimentos ya cargados.
- Unidades de porción del plan de intercambios (la app usa g/ml/unidad, no "raciones").
