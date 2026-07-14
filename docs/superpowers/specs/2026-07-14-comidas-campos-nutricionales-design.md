# Comidas — campos nutricionales completos + naming original (enhancement de #1)

> Diseño. Fecha: 2026-07-14. **Enhancement** del sub-proyecto 1 (registro de comidas, ver `2026-07-13-comidas-registro-design.md`). Motivado por uso real (primer día con vc10): la IA tradujo el nombre del producto y no capturó saturadas/azúcares/fibra/sal que la etiqueta sí trae. **Sin APK nuevo** — todo backend (deploy) + JS (OTA a vc10).

## Objetivo

1. **Capturar los campos nutricionales completos de la etiqueta:** además de kcal + proteína + carbos + grasa, guardar **grasas saturadas, azúcares, fibra y sal** (los campos universales de cualquier etiqueta EU). El sodio se muestra derivado (sal ÷ 2,5), no se guarda.
2. **Naming del producto:** para alimentos **con etiqueta** (`source=label`), guardar el **nombre original impreso** (marca + producto, sin traducir) para que sea fácil de reconocer/encontrar; para alimentos **estimados** (`source=estimate`, sin envase) seguir con un nombre común en español.
3. Los campos nuevos llegan **hasta los totales del día**: se snapshotean por comida y el día muestra sus totales (no solo kcal + 3 macros), dejándolos listos para el balance (#2) y los consejos de la IA (#4).

**Norte:** más señal nutricional real acumulada → mejor base para patrones/consejos ([[athlete-ai-memory]], dominio "estado holístico"). El modelo ya se diseñó extensible; esto lo ejerce.

## No-objetivos (YAGNI)

- **No** vitaminas/minerales puntuales (hierro, calcio, etc.): casi ninguna etiqueta los lista completos y los alimentos estimados no los tienen → solo meterían ruido y nulls. El modelo queda extensible por si algún día se quieren.
- **No** grasas mono/poliinsaturadas ni polioles/almidón (campos EU voluntarios, rara vez presentes).
- **No** tamaño de porción como unidad de registro: el usuario **pesa y carga en gramos** (decisión de uso). El "peso por unidad" (`unitWeightG`) sigue solo para contables (banana, huevo).
- **No** recalcular comidas pasadas: los `meal_item` ya persistidos quedan con sus campos nuevos en null (comidas viejas no muestran micros). Snapshot inmutable, como en #1.
- **No** APK nuevo: no hay deps nativas; es backend + JS.

## Decisiones cerradas

- **4 campos nuevos, todos opcionales**, por 100g/100ml: `saturatedFatG`, `sugarsG`, `fiberG`, `saltG` (snake_case en DB: `saturated_fat_g`, `sugars_g`, `fiber_g`, `salt_g`).
- **Sodio derivado en display** (`saltG / 2.5`, en g o mg según se muestre), no se persiste.
- **Naming condicional por `source`** (regla en el prompt): `label` → nombre original impreso; `estimate` → español común.
- **Snapshot de los 4 campos por `meal_item`** (como kcal/macros) → totales del día. `foodMacrosForQuantity` los escala (null-safe).
- **Migración 0012** (la 0011 = índice `meal_item.meal_id`, ya en `main` vía #115).
- **Compatibilidad:** alimentos y comidas existentes tienen los campos en null → la UI muestra "—"; no se rompe nada.

## Diseño

### 1. Shared (`shared/src/schemas/nutrition.ts` + `shared/src/nutrition/macros.ts`)

- **`FoodExtractionSchema`** (y por extensión `FoodInputSchema`/`FoodSchema`): sumar 4 campos opcionales nullable:
  ```ts
  saturatedFatG: z.number().nonnegative().nullable().optional(),
  sugarsG: z.number().nonnegative().nullable().optional(),
  fiberG: z.number().nonnegative().nullable().optional(),
  saltG: z.number().nonnegative().nullable().optional(),
  ```
  (Optional + nullable: la IA puede omitirlos; el form puede mandarlos como null. Normalizar a `null` cuando no vienen.)
- **`MealItemSchema`** (persistido): sumar los mismos 4 campos, `.nullable()` (snapshot escalado o null).
- **`foodMacrosForQuantity`** (`macros.ts`): extender `MacroSource` y `ScaledMacros` con los 4 campos opcionales. Regla de escalado: si el campo del alimento es un número → escalar por el mismo `factor = grams/100` y redondear a 1 decimal; si es null/undefined → el resultado es `null`. kcal/protein/carbs/fat siguen igual (obligatorios).

### 2. Backend

- **Migración 0012:** `ALTER TABLE food ADD COLUMN saturated_fat_g real; ...` (4 cols nullable en `food`) + `ALTER TABLE meal_item ADD COLUMN saturated_fat_g real; ...` (4 cols nullable en `meal_item`). Generar con drizzle tras agregar las columnas al schema.
- **`backend/src/db/schema.ts`:** sumar `saturatedFatG: real("saturated_fat_g")`, etc. (nullable) a `food` y a `mealItem`.
- **`backend/src/nutrition/repository.ts`:**
  - `insertFood`: persistir los 4 campos nuevos (`input.saturatedFatG ?? null`, etc.).
  - `toFood`: mapear los 4 campos (null-safe: `row.saturatedFatG ?? null`).
  - `snapshotItems`: pasar los 4 campos del `food` a `foodMacrosForQuantity` y persistir el resultado escalado (null si el alimento no los tiene).
  - `toMeal`/`MealItem`: incluir los 4 campos.
- **`backend/src/ai/nutrition.ts` (`buildFoodPrompt`):**
  - Pedir los 4 campos nuevos: "si la etiqueta los muestra, extraé también grasas saturadas, azúcares, fibra y sal (por 100). Si no figuran o estás estimando sin certeza, dejalos en null."
  - **Naming:** reemplazar "un nombre corto y claro en español" por la regla condicional: "Si hay etiqueta/envase (`source: label`), usá el **nombre del producto tal como está impreso** (marca + variante, sin traducir), p.ej. `Bio Knusper Müsli Beeren`. Si estás estimando un alimento sin envase (`source: estimate`), usá un nombre común y claro en **español** (p.ej. `Banana`)."
- **`backend/src/ai/client.ts` (`extractFood`):** sin cambios de código — el tool usa `z.toJSONSchema(FoodExtractionSchema)`, así que los campos nuevos entran solos al schema del tool. (Modelo sigue `claude-opus-4-8`.)

### 3. Mobile (todo JS → OTA)

- **`mobile/src/api/nutrition.ts`:** sin cambios (tipos vienen de `@pulsia/shared`).
- **`mobile/app/nutricion/agregar-alimento.tsx`:** sumar 4 inputs opcionales al form (saturadas, azúcares, fibra, sal), con el mismo patrón `field(...)`. Pre-cargados desde la extracción cuando vienen; enviados como null cuando el input queda vacío. Bajo los macros, una línea de texto con el **sodio derivado** (`sal / 2.5`) si hay sal. Validación: si el usuario tipeó algo no numérico o negativo en esos campos → error (coherente con la validación de macros); vacío = null (permitido).
- **`mobile/app/nutricion/catalogo.tsx`:** en la línea de detalle de cada alimento, sumar los campos que tenga (compacto, omitir los null). P.ej. `... · azúc 14 · fibra 8.4 · sat 4.2 · sal 0.2`.
- **`mobile/src/nutrition/mealForm.ts` (`mealTotals`):** sumar los 4 campos nuevos (null-safe: tratar null como 0 en la suma, pero si TODOS los ítems son null para un campo, el total de ese campo es null → no mostrarlo). Redondeo una sola vez al final (como ya hace).
- **`mobile/app/nutricion/nueva-comida.tsx`:** el total de la comida suma una **segunda línea** con azúcar/fibra/saturadas/sal (los que no sean null). Preview por ítem sigue mostrando kcal (sin cambio).
- **`mobile/app/(tabs)/nutricion.tsx` (día):** los totales del día pasan a **dos líneas**: primaria kcal + P/C/G (como hoy), secundaria `azúcar Xg · fibra Xg · saturadas Xg · sal Xg` (suma de snapshots de todas las comidas del día; omitir los que den null).

### 4. Extensibilidad

- Los campos snapshotados por comida alimentan directo el **balance (#2)** y los **consejos/patrones (#4)** — un futuro `buildNutritionSummary` podrá reportar azúcar/fibra diarios sin tocar el modelo.
- Sumar vitaminas/minerales después = más columnas nullable + campos al schema, sin migración de las existentes.

## Testabilidad (TDD)

- **shared:**
  - `FoodExtractionSchema`/`MealItemSchema` parsean con y sin los 4 campos; rechazan negativos; aceptan null.
  - `foodMacrosForQuantity`: escala los 4 nuevos cuando el alimento los tiene (por g/ml/unit); devuelve null para los que el alimento no tiene; no rompe el caso legacy (alimento sin micros).
- **backend:**
  - `snapshotItems`: alimento con micros → ítem con micros escalados; alimento sin micros → ítem con esos campos null.
  - `toFood`/`toMeal`: mapean los 4 campos (null-safe).
  - `buildFoodPrompt`: menciona los 4 campos nuevos + la regla de naming condicional (label→original, estimate→español).
  - Rutas: `POST /nutrition/foods` acepta y persiste los 4 campos; `GET` los devuelve; `POST /nutrition/meals` snapshotea los micros.
- **mobile:**
  - `mealTotals`: suma los micros (null-safe: null tratado como 0; campo todo-null → total null). Los casos existentes siguen verdes.

## Entrega

- **Backend + shared:** deployan en el merge (migración 0012 auto-aplica; funciona con alimentos viejos = null).
- **Mobile:** OTA a vc10 (sin dep nativa). **Verificar** que el `eas update` reporte el runtime de vc10 y le llegue al teléfono ([[ota-fingerprint-gotcha]] — de paso queda CONFIRMADO el fingerprint de vc10, que estaba pendiente).
- Orden: shared → backend (deployable) → mobile → `eas update`.

## Riesgos

- **La IA no captura los micros aunque estén:** mitigado porque el usuario **revisa/corrige** el form antes de guardar; los campos que la IA deje en null se pueden completar a mano.
- **Naming original demasiado largo/ruidoso** (marca + variante en otro idioma): aceptable — el usuario lo puede editar en el form; es más findable que una traducción genérica (su pedido explícito).
- **Migración 0012 vs otras en vuelo:** #115 (0011) ya está en `main`; generar la 0012 tras sincronizar `main` para que drizzle numere bien.
