# Comidas — colesterol + agua (quick win)

> Diseño. Fecha: 2026-07-14. Sub-proyecto del dominio Nutrición inspirado en MyFitnessPal (ver memoria `nutrition-mfp-direction`). Es el **quick win** previo al sub-proyecto #2 (balance energético). Motivación: el usuario tiene **colesterol alto + antecedentes familiares** y quiere trackearlo; y quiere un **total de líquido del día** (aporte de agua de los alimentos + agua tomada). Colesterol es casi calcado al patrón de micros ya hecho (#117); el agua suma un store nuevo chico.

## Objetivo

1. **Colesterol** (`cholesterol_mg`) y **aporte de agua** (`water_ml`) como campos opcionales por 100g/ml en el alimento y en el snapshot de cada ítem de comida — mismo patrón que saturadas/azúcares/fibra/sal.
2. En el tab Nutrición: **colesterol del día** como línea propia con **referencia fija 300 mg** (color ámbar/rojo si se pasa), y una **tarjeta "Líquido"** con el total del día = agua tomada + aporte de alimentos, con **botón +1 vaso (250 ml)**, **campo de ml libre** y **"deshacer último"**.
3. Store nuevo para el agua tomada: tabla `water_log` + endpoints `POST/GET/DELETE /nutrition/water`.

## No-objetivos (YAGNI)

- **No** metas personalizadas de colesterol ni de agua: la referencia 300 mg es **hardcodeada**; la meta real (por perfil) llega con el sub-proyecto #2 (balance energético).
- **No** vitaminas / potasio / otros nutrientes nuevos (solo colesterol + agua ahora).
- **No** tamaño de vaso configurable (fijo 250 ml; se revisa si hace falta).
- **No** histórico/charts de colesterol ni de líquido (eso es la fase de dashboard, después).
- **No** recordatorios/notificaciones de hidratación.

## Diseño

### Campos nuevos (shared)

En `shared/src/schemas/nutrition.ts`, agregar al grupo `microsPer100` (que ya se spreadea en `FoodExtractionSchema` y `MealItemSchema`):

```ts
const microsPer100 = {
  saturated_fat_g: z.number().nonnegative().nullable().optional(),
  sugars_g: z.number().nonnegative().nullable().optional(),
  fiber_g: z.number().nonnegative().nullable().optional(),
  salt_g: z.number().nonnegative().nullable().optional(),
  cholesterol_mg: z.number().nonnegative().nullable().optional(), // NUEVO — en mg
  water_ml: z.number().nonnegative().nullable().optional(),        // NUEVO — aporte de agua por 100g/ml
};
```

Nota: `water_ml` no es un "micro de etiqueta" estricto, pero comparte forma (opcional + nullable, por 100, escala igual) → reutilizamos el mismo grupo y la misma máquina de escalado por DRY. En **display** se tratan aparte (colesterol tiene su línea con referencia; agua va a la tarjeta de líquido).

### Escalado (shared)

En `shared/src/nutrition/macros.ts`:
- `MacroSource`: agregar `cholesterol_mg?: number | null;` y `water_ml?: number | null;`.
- `ScaledMacros`: agregar `cholesterol_mg: number | null;` y `water_ml: number | null;`.
- `foodMacrosForQuantity`: escalar ambos con el helper `scaleMicro` existente (redondeo a 1 decimal, null→null). El display redondea a entero (mg/ml enteros).

`sumNullableMicro` ya es genérico → sirve para sumar ambos sin cambios.

### Backend

**Schema** (`backend/src/db/schema.ts`): agregar columnas nullable `real` a **`food`** y a **`meal_item`**:
```ts
cholesterolMg: real("cholesterol_mg"),
waterMl: real("water_ml"),
```

**Tabla nueva `water_log`** (agua tomada, scopeada por usuario, day-scoped por `loggedAt`):
```ts
export const waterLog = pgTable("water_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  ml: real("ml").notNull(),
  loggedAt: bigint("logged_at", { mode: "number" }).notNull(), // epoch ms
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byUserTime: index("water_log_user_time_idx").on(t.userId, t.loggedAt),
}));
```

**Migración** (una sola, `backend/drizzle/`, la última es 0012 → esta será **0013**, con el nombre que le ponga drizzle-kit): 2 columnas en `food`, 2 en `meal_item`, tabla `water_log` + índice. Generada con `drizzle-kit generate`, se aplica sola en el deploy.

**Repository** (`backend/src/nutrition/repository.ts`):
- `toFood` / `snapshotItems` (que ya usa `foodMacrosForQuantity`): mapear `cholesterolMg`/`waterMl` ↔ `cholesterol_mg`/`water_ml` en food, meal_item snapshot y `toMeal`.
- Nuevas funciones del agua: `insertWater(db, userId, { ml, loggedAt })`, `listWater(db, userId, from?, to?)` (ordenado por `loggedAt`), `deleteWater(db, userId, id)` (scopeado por usuario, devuelve bool).

**Prompt IA** (`backend/src/ai/nutrition.ts`, `buildFoodPrompt`): sumar instrucciones:
- Colesterol: si la etiqueta lo muestra, devolver `cholesterol_mg` por 100 en **mg** (convertir si viene por porción). Para alimentos **estimados** con colesterol conocido y alto (huevo, mariscos, vísceras, quesos, carnes) dar un valor típico; si no hay certeza, `null`.
- Agua: devolver **siempre** `water_ml` = contenido de agua estimado por 100 g/ml (café con leche ~90, banana ~75, pan ~35, aceite ~0). Es una estimación esperable.

**Routes** (`backend/src/routes/nutrition.ts`): endpoints del agua con `WaterLogInputSchema`:
- `POST /nutrition/water` → `insertWater`, devuelve la fila.
- `GET /nutrition/water?from&to` → `listWater`, devuelve filas del rango.
- `DELETE /nutrition/water/:id` → `deleteWater`, 404 si no existe / no es del usuario.

**Shared schema del agua**: `WaterLogInputSchema` (`ml` positivo, `loggedAt` int), `WaterLogSchema` (extiende con `id` uuid).

### Mobile

**`mobile/src/api/nutrition.ts`**: `logWater(baseUrl, { ml, loggedAt })`, `listWater(baseUrl, from, to)`, `deleteWater(baseUrl, id)`.

**`mobile/src/nutrition/mealForm.ts`** (`mealTotals`): extender el union de `micro(key)` con `cholesterol_mg` y `water_ml` y sumarlos como los otros.

**`mobile/app/nutricion/agregar-alimento.tsx`**: inputs para **Colesterol (mg)** y **Agua (ml/100)** en el form de alta/edición (la IA los pre-llena; el usuario puede corregir). Colesterol es campo directo (no derivado como el sodio).

**`mobile/app/(tabs)/nutricion.tsx`**:
- `dayTotals`: sumar `cholesterol_mg` (de los ítems) y `water_ml` (aporte de alimentos). Extender el union de `dayMicro`.
- **Línea de colesterol**: `Colesterol {n} / 300 mg`, color normal si ≤300, `colors.warning`/`colors.danger` si >300. Solo se muestra si hay dato (algún ítem con colesterol).
- **Tarjeta "Líquido"** (nuevo componente/sección, day-scoped por `offset`):
  - Carga `listWater(from, to)` en el mismo `load`/`useFocusEffect`.
  - Total = `sum(water_log.ml)` (tomada) + `sum(item.water_ml)` (aporte alimentos). Texto: `Líquido {total} ml · tomada {tomada} + alimentos {aporte}`.
  - Botón **`+1 vaso (250 ml)`** → `logWater({ ml: 250, loggedAt: nowOrNoon })` → recargar.
  - **Campo ml libre** + botón "Agregar" → `logWater({ ml: n, loggedAt })`.
  - **"Deshacer último"** → `deleteWater(id)` de la última fila (por `loggedAt`) → recargar. (Sin filas: oculto.)
  - `loggedAt` = `Date.now()` si es hoy (offset 0), si no el `noon` del día (mismo criterio que "nueva comida").

## Casos borde

- Alimentos/comidas viejos sin los campos nuevos → `null`, se omiten de los totales (el total es `null` si ningún ítem aporta) — igual que los micros actuales.
- Editar un alimento y agregarle colesterol/agua **no** cambia comidas ya registradas (snapshot). Para reflejarlo hay que re-subir la foto/editar la comida — comportamiento ya conocido de #118.
- Agua tomada de un día pasado: el `+1 vaso` usa el `noon` de ese día → cae en el rango correcto.
- Doble conteo posible si el usuario carga "agua" como alimento **y** con el botón: es decisión del usuario (el botón es el camino previsto para agua pura; los alimentos aportan su `water_ml`). No lo prevenimos.

## Testabilidad

- `shared`: `foodMacrosForQuantity` escala `cholesterol_mg` y `water_ml` (test unitario, incluye null→null y unidad `unit`).
- `mobile`: `mealTotals` incluye los 2 campos nuevos (extender el test existente).
- `backend`: `insertWater`/`listWater`/`deleteWater` con fakeDb (scopeo por usuario, rango, borrado); snapshot de `createMeal` incluye `cholesterolMg`/`waterMl`.

## Entrega

- **Backend + migración** → merge deploya a la Pi, migración auto-aplica.
- **Mobile todo JS, sin dep nativa nueva** (el botón de agua es RN puro; no se agrega ningún módulo nativo) → **OTA a vc10** (runtime `784872cb…`, ver memoria `ota-fingerprint-gotcha`). Verificar que el `eas update` reporte ese runtime android.
