# Comidas — borrar desde la edición + estado vacío (fix de UX)

> Diseño. Fecha: 2026-07-14. Fix chico de UX del enhancement de edición (#118). Motivado por uso real: al editar una comida y hacer "Quitar" en el único alimento, la comida queda con 0 ítems → no se puede guardar (una comida no puede quedar vacía) y no hay forma clara de borrarla desde la edición → el usuario queda trabado. **Un solo archivo mobile, OTA a vc10, sin backend/migración.**

## Objetivo

En `mobile/app/nutricion/nueva-comida.tsx`, **solo en modo edición** (`mealId` presente):
1. **Botón "Borrar comida"** (rojo) debajo de "Guardar cambios" → confirmación (Alert) → `deleteMeal(baseUrl, mealId)` → volver. Hace descubrible el borrado (hoy solo por long-press en el día).
2. **Estado sin alimentos:** cuando `rows.length === 0`, "Guardar cambios" queda **deshabilitado** (opacidad baja) y aparece el aviso *"Una comida no puede quedar sin alimentos: agregá uno o borrá la comida."*

## No-objetivos (YAGNI)

- **No** permitir guardar una comida vacía (sigue siendo inválido: schema `items.min(1)`).
- **No** botón de borrar en modo alta (crear una comida y borrarla no tiene sentido; se cancela con "atrás").
- **No** cambios de backend: `DELETE /nutrition/meals/:id` ya existe.

## Diseño

`mobile/app/nutricion/nueva-comida.tsx`:
- Imports: agregar `Alert` a `react-native`; agregar `deleteMeal` al import de `../../src/api/nutrition`.
- **Save deshabilitado en vacío:** `disabled={saving || notEditable || rows.length === 0}` (y la misma condición en `opacity`).
- **Aviso de vacío:** cuando `mealId && rows.length === 0 && !notEditable`, mostrar un `<Text>` en `colors.textMuted` con el mensaje. (Si `notEditable`, ya se muestra su propio aviso — no duplicar.)
- **Botón "Borrar comida":** cuando `mealId`, un `Pressable` (fondo `colors.danger`) debajo del de guardar → `Alert.alert("Borrar comida", "¿Borrar esta comida?", [Cancelar, {Borrar, destructive, onPress}])`; el onPress (async) hace `if (!baseUrl.current) return; try { await deleteMeal(baseUrl.current, mealId); router.back(); } catch (e) { setError((e as Error).message); }`.

## Testabilidad

- Sin lógica pura nueva → sin test unitario nuevo; verificación por typecheck + prueba en device (editar → Quitar el único ítem → ver aviso + "Borrar comida" funcionando).

## Entrega

- Mobile-only, todo JS → **OTA a vc10** (runtime `784872cb…`). Sin APK, sin deploy de backend (aunque el merge deploya igual, sin cambios).
