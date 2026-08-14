# Comidas — horario editable + tipo obligatorio — Design

**Fecha:** 2026-08-14

## Problema

Dos mejoras del formulario de comidas (`nueva-comida.tsx`), pedidas por el owner:

1. **Horario no editable.** Hoy `eatenAt` se guarda pero no hay UI para cambiarlo. Caso real: como algo en el desayuno, me olvido de cargarlo, y cuando me acuerdo al mediodía la comida queda con la hora de ese momento (o el mediodía del día seleccionado). No puedo corregir la hora a la del desayuno.
2. **Se puede guardar sin tipo** (tarjeta Kan `n2mealtype00`). Hoy `mealType` arranca en `null` y `save()` no lo valida → se guardan comidas sin desayuno/almuerzo/cena/snack. El owner quiere que sea obligatorio, avisando y resaltando el selector (nada de guardado silencioso).

## Alcance

- **Solo hora (HH:MM)**, mismo día. No se cambia el día en el que aparece la comida (decisión del owner; navegar a otro día ya se hace desde el tab al crear).
- **Un solo PR**, front-only → **OTA** (sin backend, sin migración, sin APK).

## No-objetivos

- Editar la **fecha** (mover la comida a otro día). Diferido.
- Cambiar el schema `MealInput` (`mealType` sigue siendo `MealType | null` en la API; la obligatoriedad es de la UI). El backend mantiene la robustez de aceptar null.
- Picker de fecha/hora nativo. Se evita a propósito: agregar `@react-native-community/datetimepicker` rompería el fingerprint del OTA y obligaría a un APK nuevo.

## Diseño

Todo en el móvil. Fuente única de la lógica pura en `mealForm.ts` (ya es el hogar de la lógica del formulario), testeada en `__tests__/mealForm.test.ts`.

### 1. Horario editable (HH:MM)

Patrón ya usado en la app para el recordatorio de informes (`configuracion.tsx`): un `TextInput` con placeholder `"HH:MM"`, `keyboardType="numbers-and-punctuation"`, parseado con `split(":")`. JS puro, sin deps.

**Formateo de la hora (reuso):** para inicializar el campo se reusa `hhmm(ms)` de `mobile/src/session/metricDate.ts` (hora local `"HH:MM"` con `padStart`), ya importado por otras pantallas de nutrición (`comida.tsx`). No se crea un helper nuevo de formateo.

**Helper puro nuevo en `mobile/src/nutrition/mealForm.ts`:**

- `combineDayAndTime(dayMs: number, hhmm: string): number | null` — toma el **día** (Y/M/D local) de `dayMs`, le aplica la hora del texto, devuelve el timestamp en ms; `null` si el texto no es un `HH:MM` válido (hora 0–23, minutos 0–59). Implementado con `new Date(dayMs)` + `setHours(h, m, 0, 0)`, y **rechaza también las horas locales inexistentes** del salto de DST (compara la fecha/hora resultante con la entrada y devuelve `null` si `setHours` tuvo que normalizar — p.ej. `"02:30"` en Europe/Berlin el día del spring-forward).

**Estado de la pantalla:**

- `eatenAt` pasa de `useRef` a estado. Inicial: al **crear**, `params.eatenAt` (día seleccionado, mediodía) o `Date.now()`; al **editar**, `m.eatenAt` (ya se carga en el focus effect).
- `timeStr` (estado string) inicializado con `hhmm(eatenAt inicial)`; en modo edición se re-setea tras cargar la comida.

**UI:** una fila etiquetada "Horario" cerca de los chips de tipo, con el `TextInput` HH:MM.

**Guardado:** en `save()`, `const combined = combineDayAndTime(eatenAt, timeStr)`. Si es `null` → `setError("Horario inválido (usá HH:MM).")` y no guarda. Si es válido → `buildMealInput({ eatenAt: combined, ... })`.

### 2. Tipo obligatorio (Kan `n2mealtype00`)

- Estado nuevo `mealTypeError: boolean`.
- En `save()`, antes de construir el input: si `mealType == null` → `setMealTypeError(true)`, `setError("Elegí el tipo de comida.")`, `return`. Sin guardado silencioso.
- Al elegir un tipo (`setMealType`), limpiar el error (`setMealTypeError(false)`).
- **Resaltado:** cuando `mealTypeError` es true, la fila de chips muestra borde/texto de ayuda en color `danger` ("Elegí el tipo de comida"). El botón Guardar queda habilitado (valida al presionar y da feedback), acorde al pedido de "avisar y resaltar", no deshabilitar mudo.

## Data flow

Sin cambios de red ni de datos: `buildMealInput` ya propaga `eatenAt`; `createMeal`/`updateMeal` (`POST /meals`, `PATCH /meals/:id`) ya lo aceptan. La combinación día+hora ocurre client-side justo antes de `buildMealInput`.

## Casos borde

- **Editar una comida existente:** el campo arranca con la hora guardada; cambiarla actualiza solo la hora, el día se preserva (`combineDayAndTime` usa el día de `eatenAt`).
- **Crear en un día pasado desde el tab:** `params.eatenAt` es el día a mediodía → el campo muestra `"12:00"`, editable.
- **HH:MM inválido** (`"25:00"`, `"8"`, vacío, `"aa:bb"`): `combineDayAndTime` devuelve `null` → error, no guarda.
- **notEditable** (alimento borrado/incompatible): la validación de horario y tipo no aplica porque ya se corta antes con el aviso existente.

## Testing

`__tests__/mealForm.test.ts` (jest):

- `combineDayAndTime`: válidos (`"08:30"`, `"00:00"`, `"23:59"`), inválidos (`"24:00"`, `"12:60"`, `"8"`, `""`, `"aa:bb"`), y que **preserva el día** (Y/M/D de `dayMs` intactos, solo cambia la hora).
- `hhmm` (de `metricDate`) ↔ `combineDayAndTime`: round-trip sobre el mismo día.
- `buildMealInput`: respeta el `eatenAt` combinado que se le pasa (ya cubierto por el test existente de `buildMealInput`).

## Archivos

- Modify `mobile/src/nutrition/mealForm.ts` — `combineDayAndTime` (el formateo reusa `hhmm` de `metricDate.ts`).
- Modify `mobile/app/nutricion/nueva-comida.tsx` — estado de `eatenAt`/`timeStr`/`mealTypeError`, campo HH:MM, validaciones en `save()`, resaltado del selector.
- Modify `mobile/__tests__/mealForm.test.ts` — tests de los helpers.

## Deploy

Front-only → **OTA** (`eas update`), verificando el runtimeVersion vigente (android `784872cb…` / runtime "11"). Sin backend, sin migración, sin APK.
