# Balance energético #2a — Metas + Restante

> Diseño. Fecha: 2026-07-14. Primer slice del sub-proyecto #2 (balance energético) del dominio Nutrición, inspirado en MyFitnessPal (ver memoria `nutrition-mfp-direction`). Entrega el **loop central de MFP**: meta calórica + macros calculadas del perfil, y la vista **Meta / Comido / Restante** en el tab de Nutrición. El gasto del entrenamiento (net calories) es el slice **#2b**, aparte. Modelo aprobado por el usuario.

## Objetivo

1. **Meta calórica + de macros** calculadas del perfil: BMR (Mifflin-St Jeor) × nivel de actividad → TDEE, ajustado por un **objetivo nutricional** (perder/mantener/ganar + ritmo), con **macros automáticas** (proteína por peso, grasa ~27%, carbos el resto).
2. Un **nivel de actividad** en el perfil (semilla) y un **objetivo nutricional** por usuario (store nuevo), editables desde la app.
3. En el tab de Nutrición, la tarjeta de totales pasa a **Meta / Comido / Restante** (kcal) + mini-tabla por macro (Comido / Meta / Restante) con barra de progreso. La línea de colesterol 300 mg queda igual.

## No-objetivos (YAGNI)

- **No** gasto de entrenamiento ni net calories (`Restante = Meta − Comido`, sin `+ Ejercicio`): eso es **#2b**. Por ahora el "Restante" no suma lo quemado.
- **No** TDEE adaptativo (que la app corrija la meta sola desde peso-vs-ingesta): es el refinamiento planificado, follow-up (alimenta la memoria del atleta).
- **No** override manual de macros ni editor de % (las macros son 100% automáticas; sí hay override de **kcal** total como fallback).
- **No** metas de colesterol/agua en la tabla Meta/Restante (el colesterol mantiene su línea de 300 mg ya existente; el agua su tarjeta de líquido).
- **No** resumen/consejos ni reportes diarios/semanales: es el sub-proyecto **#4** (patrones + consejos de IA), aparte.

## Diseño

### Bloque 1 — Perfil: nivel de actividad (semilla)

En `shared/src/schemas/profile.ts`:
- Nuevo `ActivityLevelSchema = z.enum(["sedentary", "light", "moderate", "active"])`.
- Agregar `activityLevel: ActivityLevelSchema.optional()` a `TrainingProfileSchema`.
- Multiplicadores (en la función de cálculo, no en el schema): sedentary 1.2, light 1.375, moderate 1.55, active 1.725. Descripción en la UI: **"sin contar los entrenamientos"** (para no doble-contar el gasto que suma #2b).

El perfil vive en `profiles.data` (jsonb `TrainingProfile`) → **sin migración**. La pantalla de perfil (`mobile/app/(tabs)/perfil.tsx`, que ya edita sexo/edad/peso/altura) suma un selector de actividad.

### Bloque 2 — Objetivo nutricional (store nuevo)

Registro single-row-por-usuario (patrón `settings`/`athlete_memory`). Tabla `nutrition_goal`:
```ts
export const nutritionGoal = pgTable("nutrition_goal", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),        // 'lose' | 'maintain' | 'gain'
  rateKgPerWeek: real("rate_kg_per_week").notNull(), // 0.25 | 0.5 (ignorado si maintain)
  manualKcal: integer("manual_kcal"),            // nullable: override total, pisa el cálculo
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```
Migración nueva (0014). Shared:
```ts
export const NutritionObjectiveSchema = z.enum(["lose", "maintain", "gain"]);
export const NutritionGoalInputSchema = z.object({
  objective: NutritionObjectiveSchema,
  rateKgPerWeek: z.number().min(0).max(1),       // la UI usa 0.25 / 0.5
  manualKcal: z.number().int().positive().max(10000).nullable().optional(),
});
```

### Bloque 3 — El cálculo (función pura en `shared`)

`shared/src/nutrition/goal.ts` — fuente única, reusable por backend (y a futuro por el móvil si hace falta). Firma:
```ts
computeNutritionGoal(args: {
  sex?: Sex; age?: number; heightCm?: number;
  weightKg?: number;                 // ya resuelto: último weight_kg de métricas ?? profile.weightKg
  activityLevel?: ActivityLevel;
  objective: NutritionObjective; rateKgPerWeek: number; manualKcal?: number | null;
}): NutritionGoalResult
```
donde
```ts
type NutritionGoalResult =
  | { status: "ok"; source: "auto" | "manual"; kcal: number; protein_g: number; carbs_g: number; fat_g: number; bmr: number | null; tdee: number | null }
  | { status: "incomplete"; missing: string[] };  // p.ej. ["edad", "altura", "peso"]
```

Reglas:
1. **BMR** (Mifflin-St Jeor): `10*kg + 6.25*cm − 5*age + s`, con `s = +5` (male), `−161` (female), `−78` (other/prefer_not_to_say/sin sexo → promedio, así siempre computa).
2. **TDEE** = `BMR × factor(activityLevel ?? "light")` (default `light` = 1.375; el usuario lo ajusta en el perfil).
3. **Meta kcal**:
   - Si `manualKcal` presente → `kcal = manualKcal`, `source: "manual"` (el cálculo BMR/TDEE se ignora; `bmr`/`tdee` pueden ir null).
   - Si no: `adj = rateKgPerWeek * 1100` (1 kg ≈ 7700 kcal → /7 ≈ 1100 kcal/día por kg/semana). `lose → TDEE − adj`, `gain → TDEE + adj`, `maintain → TDEE` (rate ignorado). Piso de seguridad: `kcal = max(kcal, 1500)`. `source: "auto"`.
4. **Macros** (redondeadas a entero):
   - `protein_g = weightKg * (objective === "lose" ? 2.0 : 1.8)` — más alta en déficit para preservar músculo.
   - `fat_g = (kcal * 0.27) / 9`.
   - `carbs_g = max(0, (kcal − protein_g*4 − fat_g*9) / 4)`.
   - **Fallback sin peso** (solo en camino manual sin `weightKg`): reparto por %: proteína 25%, grasa 27%, carbos el resto.
5. **Incompleto**: si NO hay `manualKcal` y falta alguno de `age` / `heightCm` / `weightKg` → `status: "incomplete"` con la lista `missing` (el sexo no cuenta, tiene fallback; la actividad tampoco, tiene default). El peso "falta" solo si no hay ni métrica ni `profile.weightKg`.

Nota de peso single-source: el peso canónico es el último `weight_kg` de Progreso (métricas); `profile.weightKg` es fallback.

### Bloque 4 — Backend

- **shared**: schemas del Bloque 2 + la función del Bloque 3 (con sus tests).
- **schema.ts**: tabla `nutrition_goal`. Migración 0014.
- **repository** (`backend/src/nutrition/repository.ts`): `getGoalInput(db, userId)` (fila o default `{ objective: "maintain", rateKgPerWeek: 0, manualKcal: null }` si no existe) y `upsertGoalInput(db, userId, input)` (insert/onConflictDoUpdate como el perfil).
- **resolver** (`backend/src/nutrition/goalService.ts` o dentro de la ruta): junta perfil (`profiles.data` → sexo/edad/altura/peso/activityLevel), último peso (`getLatestMetrics` → `weight_kg`), y el goal input → llama `computeNutritionGoal`.
- **rutas** (`backend/src/routes/nutrition.ts`):
  - `GET /nutrition/goal` → `{ ...NutritionGoalResult, input: NutritionGoalInput }`. Con el default de `getGoalInput`, un usuario sin objetivo configurado igual recibe una meta de **mantenimiento** (o `incomplete` si le falta perfil).
  - `PUT /nutrition/goal` → valida `NutritionGoalInputSchema`, `upsertGoalInput`, devuelve el resultado recomputado (mismo shape que el GET).

### Bloque 5 — Mobile

- **api** (`mobile/src/api/nutrition.ts`): `getNutritionGoal(baseUrl)` y `putNutritionGoal(baseUrl, input)`.
- **Perfil** (`mobile/app/(tabs)/perfil.tsx`): selector de **nivel de actividad** (chips sedentario/ligero/moderado/activo) con la aclaración "sin contar entrenamientos"; se incluye en el `TrainingProfile` que ya se guarda.
- **Pantalla "Objetivo nutricional"** (`mobile/app/nutricion/objetivo.tsx`, nueva): chips de objetivo (perder/mantener/ganar), chips de ritmo (0.25 / 0.5 kg/sem, ocultos si "mantener"), campo opcional de **kcal manual**; muestra la **meta calculada** (kcal + P/C/F) en vivo. Si el resultado es `incomplete`, muestra qué falta + link a Perfil. Guardar → `putNutritionGoal`. Acceso desde el tab (botón "Objetivo").
- **Tab Nutrición** (`mobile/app/(tabs)/nutricion.tsx`): en `load`, sumar `getNutritionGoal` (Promise.all con meals+water). La tarjeta de totales:
  - Si `goal.status === "ok"`: **Meta {kcal} · Comido {comido} · Restante {meta − comido}** (el restante en ámbar/rojo si es negativo), y una mini-tabla por macro **P/C/G** con **Comido / Meta / Restante** + barra de progreso (comido/meta, clamp 0–100%).
  - Si `incomplete`: mostrar lo comido igual + un CTA "Completá tu perfil / definí tu objetivo" que lleva a la pantalla de objetivo/perfil.
  - La línea de **colesterol 300 mg** y la **tarjeta de líquido** quedan igual.

## Casos borde

- Perfil sin edad/altura/peso → `incomplete`, no se inventa una meta; el tab sigue mostrando lo comido y un CTA.
- Sexo `other`/sin sexo → BMR con constante promedio (−78), computa igual.
- `manualKcal` sin peso → macros por % (no rompe).
- Meta chica que no alcanza para proteína+grasa → carbos en 0 (no negativos).
- Usuario sin objetivo configurado → default mantenimiento (no una pantalla vacía).
- Cambia el peso en Progreso → la próxima carga del tab recomputa la meta (no está congelada), salvo `manualKcal`.

## Testabilidad

- **shared** (`goal.test.ts`): BMR male/female/other, TDEE por nivel, ajuste lose/maintain/gain + piso 1500, manualKcal override, macros (proteína lose vs no-lose, carbos = resto, floor 0), fallback por % sin peso, `incomplete` con la lista `missing` correcta.
- **backend**: `getGoalInput` default + `upsertGoalInput`; el resolver arma bien los inputs (perfil + último peso); `GET`/`PUT /nutrition/goal` (ok, incomplete, validación 400) con fakeDb.
- **mobile**: lógica pura de la pantalla de objetivo (buildInput desde el form) y del cálculo de "Restante"/porcentaje de barra por macro (función pura testeable).

## Entrega

- **shared + backend** (migración 0014 `nutrition_goal`; `activityLevel` va en el jsonb del perfil, sin migración) → merge deploya a la Pi.
- **Mobile todo JS, sin dep nativa** → **OTA a vc10** (`784872cb…`, ver `ota-fingerprint-gotcha`; recordar `eas update --branch preview --environment preview`).
