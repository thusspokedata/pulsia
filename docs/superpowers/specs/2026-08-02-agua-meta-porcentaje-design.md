# NUT-1 · Agua: meta + % de avance + confirmar antes de borrar — Diseño

**Fecha:** 2026-08-02
**Card:** NUT-1 (Kan, columna P0 · Ahora, publicId `8s856arrfwvh`) — TODO #3 del owner.
**Tamaño:** S/M. **Solo móvil.** Sin backend, sin migración, sin OTA-blocker (JS puro → OTA a vc10).

## Problema

Hoy la app registra agua (`logWater`/`deleteWater` en `mobile/app/(tabs)/nutricion.tsx`) pero:

1. No hay **meta** de agua ni **% de avance** — solo muestra el total tomado.
2. "Deshacer último" **borra al instante**, sin confirmación (a diferencia del borrado de comidas,
   que ya pide confirmación con un `Alert`).

## Decisiones (del owner, en el brainstorming)

- **Meta = auto 35 ml/kg del peso del perfil, con override manual.** Espeja el patrón de la meta
  calórica (cálculo automático que un valor manual puede pisar). Si no hay peso disponible, cae a un
  **fijo de 2000 ml**.
- **La meta vive en el móvil / AsyncStorage** (no en el backend). Solo se persiste el *override
  manual*; el valor auto se recalcula del peso en cada render.
- **% mostrado con una barra** (reusa el componente `Bar` de `src/nutrition/tabs/ui`, ya usado para
  los macros). No se construye un anillo.
- **La barra mide agua BEBIDA (`liquid.drank`) contra la meta** — es lo que dice la card ("% de lo
  bebido vs meta"). El agua que aportan los alimentos (`liquid.fromFood`) se sigue mostrando como
  texto informativo, pero **no** cuenta para el %.

## Arquitectura (unidades con un propósito claro)

### 1. Cálculo puro de la meta — `mobile/src/nutrition/waterGoal.ts`

```ts
export function computeWaterGoalMl(input: { overrideMl?: number | null; weightKg?: number | null }): number
```

Reglas, en orden:
1. `overrideMl` finito y `> 0` → devuelve `Math.round(overrideMl)`.
2. Si no, y `weightKg` finito y `> 0` → `Math.round(35 * weightKg)`.
3. Si no → `2000` (constante `WATER_GOAL_FALLBACK_ML`).

Función pura, sin dependencias de RN/AsyncStorage → testeable de forma aislada.

### 2. Persistencia del override — `mobile/src/storage/waterGoal.ts`

Espeja `src/storage/sounds.ts`:

```ts
export async function getWaterGoalOverride(): Promise<number | null>
export async function setWaterGoalOverride(ml: number | null): Promise<void>
```

- Clave `pulsia.waterGoalOverrideMl`.
- `set(null)` **borra** la clave (vuelve a modo auto).
- `get` parsea el número; un valor corrupto o no-finito → `null` (cae a auto, no rompe).

### 3. UI — `mobile/src/components/WaterCard.tsx` (extracción)

`nutricion.tsx` ya tiene ~213 líneas; sacar el bloque de agua a su propio componente deja la pantalla
enfocada y hace la card **testeable con jest**. Es una mejora acotada que sirve al objetivo (no un
refactor no relacionado).

**Props:** `{ water: WaterLog[]; liquid: { total; drank; fromFood }; weightKg?: number | null;
onAddWater: (ml: number) => void; onUndoLast: () => void }`.

La card maneja **internamente** el estado del override (lee `getWaterGoalOverride` al montar,
escribe con `setWaterGoalOverride`) y calcula la meta efectiva con `computeWaterGoalMl`.

Layout:
- Encabezado: `💧 Agua {liquid.drank} / {goal} ml` + un `✎` (pressable) para editar la meta.
- **`Bar`** de `value={liquid.drank}` `target={goal}` + `{pct}%` al lado.
- Subtexto (se conserva): `tomada {drank} + alimentos {fromFood}`.
- Fila de acción (igual que hoy): `+1 vaso (250 ml)` / TextInput ml / `Agregar`.
- `water.length > 0` → botón **`Borrar último ({ml} ml)`** (antes "Deshacer último").
- Al tocar `✎`: fila inline con TextInput (precargado con la meta efectiva) + `Guardar` +
  `Auto (35 ml/kg)` (limpia el override → `setWaterGoalOverride(null)`).

`nutricion.tsx` queda con `addWater`/`undoLastWater` como handlers y renderiza `<WaterCard … />`.

### 4. Confirmación antes de borrar — en `nutricion.tsx`

`undoLastWater` envuelve el borrado en `Alert.alert`, mismo patrón que `remove(m)` (comidas):

```
Alert.alert("Borrar registro", "¿Borrar el último registro de agua (X ml)?", [
  { text: "Cancelar", style: "cancel" },
  { text: "Borrar", style: "destructive", onPress: <borra> },
])
```

### 5. `useNutritionDay` expone `weightKg`

El hook ya calcula `weightKg` (línea 63) pero no lo devuelve. Se agrega al `return` (línea 73) para
que `nutricion.tsx` se lo pase a `WaterCard`.

## Flujo de datos

`useNutritionDay` → `{ water, summary.liquid, weightKg }` → `nutricion.tsx` → `<WaterCard>` →
lee override de AsyncStorage → `computeWaterGoalMl({ overrideMl, weightKg })` → barra `drank/goal`.
Editar la meta escribe AsyncStorage y recomputa en el próximo render (no toca el backend).

## Errores / bordes

- Sin peso y sin override → meta 2000 ml (la barra funciona igual).
- `drank > goal` → la `Bar` clampea al 100% visual; el texto puede mostrar `>100%`.
- Override con texto no numérico → se ignora (no se guarda), queda en auto.
- Borrar con `water.length === 0` → el botón no se renderiza (no hay nada que borrar).

## Testing (jest, en `__tests__/` — convención del móvil)

- `waterGoal.test.ts`: override gana; redondeo `35 * weightKg`; fallback 2000 sin peso/override;
  override inválido (0, negativo, NaN) cae a auto.
- `WaterCard.test.tsx`: renderiza `drank / goal` y el %; `+1 vaso` llama `onAddWater(250)`;
  el botón "Borrar último" llama `onUndoLast`; editar la meta y guardar persiste (mock de storage);
  "Auto" limpia el override. (Los tests de componente mockean `expo-router` si hace falta y usan
  `await render`.)

## Fuera de alcance (YAGNI)

- Meta de agua en el backend / sincronizada entre dispositivos (la card pide AsyncStorage).
- Anillo de progreso (se eligió barra).
- Recordatorios / notificaciones de hidratación.
- Que el agua de alimentos cuente para el % (se decidió: solo lo bebido).
