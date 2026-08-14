# Comidas — horario editable + tipo obligatorio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer editable el horario (HH:MM) de una comida al crear y editar, y obligar a elegir el tipo (desayuno/almuerzo/cena/snack) antes de guardar, avisando y resaltando el selector.

**Architecture:** Todo en el móvil, front-only → OTA. Dos helpers puros nuevos en `mealForm.ts` (`hhmmFromMs`, `combineDayAndTime`), testeados en jest, consumidos por la pantalla `nueva-comida.tsx`, donde `eatenAt` pasa de `useRef` a estado + un campo de texto HH:MM y `save()` valida hora y tipo. Sin backend, sin migración, sin deps nuevas (`createMeal`/`updateMeal` ya mandan `eatenAt`; `MealInput.mealType` ya es `MealType | null`).

**Tech Stack:** Expo/React Native · TypeScript · jest (mobile). Monorepo Bun.

**Referencia:** spec `docs/superpowers/specs/2026-08-14-comidas-horario-tipo-design.md`.

---

## File Structure

- **Modify** `mobile/src/nutrition/mealForm.ts` — agregar `hhmmFromMs` y `combineDayAndTime` (lógica pura de hora ↔ ms, fuente única).
- **Modify** `mobile/__tests__/mealForm.test.ts` — tests de los dos helpers.
- **Modify** `mobile/app/nutricion/nueva-comida.tsx` — `eatenAt` a estado, estado `timeStr` + `mealTypeError`, campo HH:MM en la UI, validaciones de hora y tipo en `save()`, resaltado del selector.

**PR:** uno solo (front-only, OTA).

---

## Fase 1 — Helpers puros (TDD)

### Task 1: `hhmmFromMs` + `combineDayAndTime` en `mealForm.ts`

**Files:**
- Modify: `mobile/src/nutrition/mealForm.ts`
- Test: `mobile/__tests__/mealForm.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `mobile/__tests__/mealForm.test.ts`. Importar los dos helpers nuevos en la línea 1 (extender el import existente):

```ts
import { buildMealInput, itemPreview, mealTotals, allowedUnits, hhmmFromMs, combineDayAndTime } from "../src/nutrition/mealForm";
```

Tests nuevos (al final del archivo):

```ts
// --- horario editable (HH:MM) ---

// 2026-08-14 14:35 local. Usamos componentes locales para no atarnos a la TZ del runner:
// construimos el instante con new Date(y,m,d,h,mm) y verificamos con getHours/getMinutes.
const day = new Date(2026, 7, 14, 14, 35, 0, 0).getTime(); // agosto = mes 7

test("hhmmFromMs formatea la hora local con padStart", () => {
  expect(hhmmFromMs(new Date(2026, 7, 14, 8, 5, 0, 0).getTime())).toBe("08:05");
  expect(hhmmFromMs(new Date(2026, 7, 14, 23, 59, 0, 0).getTime())).toBe("23:59");
  expect(hhmmFromMs(new Date(2026, 7, 14, 0, 0, 0, 0).getTime())).toBe("00:00");
});

test("combineDayAndTime aplica la hora al día de dayMs y preserva la fecha", () => {
  const out = combineDayAndTime(day, "08:00");
  expect(out).not.toBeNull();
  const d = new Date(out as number);
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(7);
  expect(d.getDate()).toBe(14);
  expect(d.getHours()).toBe(8);
  expect(d.getMinutes()).toBe(0);
  expect(d.getSeconds()).toBe(0);
  expect(d.getMilliseconds()).toBe(0);
});

test("combineDayAndTime acepta los bordes 00:00 y 23:59", () => {
  expect(combineDayAndTime(day, "00:00")).not.toBeNull();
  expect(combineDayAndTime(day, "23:59")).not.toBeNull();
});

test("combineDayAndTime devuelve null para HH:MM inválido", () => {
  for (const bad of ["24:00", "12:60", "8", "", "aa:bb", "8:5", "-1:00", "12:5"]) {
    expect(combineDayAndTime(day, bad)).toBeNull();
  }
});

test("hhmmFromMs ↔ combineDayAndTime round-trip sobre el mismo día", () => {
  const s = hhmmFromMs(day);
  const back = combineDayAndTime(day, s);
  expect(hhmmFromMs(back as number)).toBe(s);
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd mobile && bun run test __tests__/mealForm.test.ts`
Expected: FAIL — `hhmmFromMs`/`combineDayAndTime` no existen (TypeError / undefined).

- [ ] **Step 3: Implementar los helpers**

En `mobile/src/nutrition/mealForm.ts`, agregar (después de los imports, antes de `allowedUnits` o al final del archivo):

```ts
// Hora local de un instante en "HH:MM" (mismo formato que metricDate.ts).
export function hhmmFromMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Toma el DÍA (Y/M/D local) de dayMs y le aplica la hora del texto "HH:MM".
// Devuelve el timestamp en ms, o null si el texto no es un HH:MM válido (00–23 : 00–59).
// Exige exactamente dos dígitos por lado para no aceptar "8", "8:5", etc.
export function combineDayAndTime(dayMs: number, hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const d = new Date(dayMs);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `cd mobile && bun run test __tests__/mealForm.test.ts`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/nutrition/mealForm.ts mobile/__tests__/mealForm.test.ts
git commit -S -m "feat(comidas): helpers puros hhmmFromMs + combineDayAndTime"
```

---

## Fase 2 — Pantalla `nueva-comida.tsx`

### Task 2: `eatenAt` a estado + campo HH:MM + tipo obligatorio

**Files:**
- Modify: `mobile/app/nutricion/nueva-comida.tsx`

- [ ] **Step 1: Importar los helpers y ajustar el estado**

En el import de `mealForm` (línea 6) agregar `hhmmFromMs` y `combineDayAndTime`:

```ts
import { buildMealInput, mealTotals, itemPreview, allowedUnits, hhmmFromMs, combineDayAndTime, type MealRow } from "../../src/nutrition/mealForm";
```

Reemplazar la línea del ref (líneas 29-30):

```ts
  // eatenAt: si vino por params (día seleccionado en el tab), usarlo; si no, ahora.
  const eatenAt = useRef<number>(params.eatenAt ? Number(params.eatenAt) : Date.now());
```

por estado + el string del horario + el flag de error de tipo:

```ts
  // eatenAt: si vino por params (día seleccionado en el tab), usarlo; si no, ahora.
  const initialEatenAt = params.eatenAt ? Number(params.eatenAt) : Date.now();
  const [eatenAt, setEatenAt] = useState<number>(initialEatenAt);
  const [timeStr, setTimeStr] = useState<string>(hhmmFromMs(initialEatenAt));
  const [mealTypeError, setMealTypeError] = useState(false);
```

- [ ] **Step 2: Cargar la hora al editar una comida**

En el focus effect, dentro del bloque `if (mealId ...)`, donde hoy dice `eatenAt.current = m.eatenAt;` (línea 43), reemplazar por:

```ts
          setEatenAt(m.eatenAt);
          setTimeStr(hhmmFromMs(m.eatenAt));
```

- [ ] **Step 3: Limpiar el error de tipo al elegir uno**

En el `onPress` del chip de tipo (línea 124), cambiar:

```tsx
          <Pressable key={t} onPress={() => setMealType((cur) => (cur === t ? null : t))} style={{
```

por (limpia el resaltado al tocar un tipo):

```tsx
          <Pressable key={t} onPress={() => { setMealTypeError(false); setMealType((cur) => (cur === t ? null : t)); }} style={{
```

- [ ] **Step 4: Validar tipo y hora en `save()`**

Reemplazar el cuerpo de `save()` (líneas 74-87) por:

```ts
  async function save() {
    setError(null);
    if (notEditable) { setError("Esta comida no se puede editar: uno de sus alimentos fue borrado del catálogo o cambió de unidad/formato. Borrala y volvé a cargarla."); return; }
    if (!mealType) { setMealTypeError(true); setError("Elegí el tipo de comida."); return; }
    if (rows.length === 0) { setError("Agregá al menos un alimento."); return; }
    if (rows.some((r) => r.quantity <= 0)) { setError("Las cantidades tienen que ser mayores a 0."); return; }
    const combined = combineDayAndTime(eatenAt, timeStr);
    if (combined === null) { setError("Horario inválido (usá HH:MM)."); return; }
    if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
    setSaving(true);
    try {
      const input = buildMealInput({ eatenAt: combined, mealType, note, rows });
      if (mealId) await updateMeal(baseUrl.current, mealId, input);
      else await createMeal(baseUrl.current, input);
      router.back();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }
```

- [ ] **Step 5: Agregar el campo Horario y el resaltado del selector en la UI**

En el bloque de chips de tipo (líneas 122-131), envolver la fila con una etiqueta y el resaltado. Reemplazar:

```tsx
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        {MEAL_TYPES.map((t) => (
          <Pressable key={t} onPress={() => { setMealTypeError(false); setMealType((cur) => (cur === t ? null : t)); }} style={{
            paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill,
            backgroundColor: mealType === t ? colors.accent : colors.surfaceMuted,
          }}>
            <Text style={{ color: mealType === t ? "#fff" : colors.text }}>{t}</Text>
          </Pressable>
        ))}
      </View>
```

por:

```tsx
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: mealTypeError ? colors.danger : colors.textMuted, fontSize: 12 }}>Tipo de comida</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", borderWidth: mealTypeError ? 1 : 0, borderColor: colors.danger, borderRadius: radius.md, padding: mealTypeError ? spacing.xs : 0 }}>
          {MEAL_TYPES.map((t) => (
            <Pressable key={t} onPress={() => { setMealTypeError(false); setMealType((cur) => (cur === t ? null : t)); }} style={{
              paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill,
              backgroundColor: mealType === t ? colors.accent : colors.surfaceMuted,
            }}>
              <Text style={{ color: mealType === t ? "#fff" : colors.text }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Horario de la comida (HH:MM, mismo día) */}
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Horario</Text>
        <TextInput
          value={timeStr}
          onChangeText={setTimeStr}
          placeholder="HH:MM"
          placeholderTextColor={colors.icon}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={5}
          style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, color: colors.text, width: 100 }}
        />
      </View>
```

- [ ] **Step 6: Type-check + lint del móvil**

Run: `cd mobile && bun run typecheck`
Expected: sin errores. (script `typecheck` = `tsc --noEmit`.)

- [ ] **Step 7: Correr los tests del móvil**

Run: `cd mobile && bun run test`
Expected: PASS (nada roto por el cambio de pantalla).

- [ ] **Step 8: Commit**

```bash
git add mobile/app/nutricion/nueva-comida.tsx
git commit -S -m "feat(comidas): horario editable (HH:MM) + tipo obligatorio en Nueva/Editar comida"
```

---

## Fase 3 — Verificación manual (opcional, en device tras el OTA)

- [ ] Crear una comida hoy → el campo Horario muestra la hora actual; cambiarla a "08:00" y guardar → aparece con esa hora.
- [ ] Intentar guardar sin elegir tipo → aviso "Elegí el tipo de comida" + selector resaltado; elegir uno limpia el resaltado.
- [ ] Editar una comida existente → el campo arranca con la hora guardada; cambiarla preserva el día.
- [ ] Escribir "25:00" → "Horario inválido (usá HH:MM)."

---

## Notas de cierre

- **Deploy:** front-only → `eas update` (OTA), verificando el runtimeVersion vigente (android `784872cb…` / runtime "11") ANTES de publicar. Sin backend, sin migración, sin APK.
- **Kan:** al mergear, mover la card `n2mealtype00` a ✅ Hecho (mutación sobre infra del owner → confirmar antes).
- **PR:** disparar `@claude review` automáticamente tras abrir (flujo pre-autorizado); leer también lo de CodeRabbit.
```
