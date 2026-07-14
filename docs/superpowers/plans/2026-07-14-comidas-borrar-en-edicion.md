# Comidas — borrar desde la edición + estado vacío — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** En `nueva-comida.tsx`, en modo edición: botón "Borrar comida" + deshabilitar "Guardar cambios" y avisar cuando la comida quede sin alimentos.

**Architecture:** Un solo archivo mobile. `DELETE /meals/:id` ya existe. OTA a vc10, sin backend.

**Referencia:** spec `docs/superpowers/specs/2026-07-14-comidas-borrar-en-edicion-design.md`.

---

### Task 1: Borrar comida + estado vacío en `nueva-comida.tsx`

**Files:**
- Modify: `mobile/app/nutricion/nueva-comida.tsx`

- [ ] **Step 1: Imports**

En `mobile/app/nutricion/nueva-comida.tsx`:
- Agregar `Alert` al import de `react-native`:
  ```tsx
  import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
  ```
- Agregar `deleteMeal` al import de la API:
  ```tsx
  import { listFoods, createMeal, getMeal, updateMeal, deleteMeal } from "../../src/api/nutrition";
  ```

- [ ] **Step 2: Add the delete handler**

Dentro del componente (junto a las otras funciones, p.ej. después de `save`), agregar:
```tsx
  function confirmDelete() {
    if (!mealId) return;
    Alert.alert("Borrar comida", "¿Borrar esta comida?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
        if (!baseUrl.current) { setError("No se pudo conectar con el servidor."); return; }
        try { await deleteMeal(baseUrl.current, mealId); router.back(); }
        catch (e) { setError((e as Error).message); }
      } },
    ]);
  }
```

- [ ] **Step 3: Disable save when empty + empty hint**

Reemplazar el `Pressable` de guardar (el que tiene `onPress={save}`) y agregar el aviso de vacío justo antes. Buscar:
```tsx
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving || notEditable} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving || notEditable ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : mealId ? "Guardar cambios" : "Guardar comida"}</Text>
      </Pressable>
```
y reemplazarlo por:
```tsx
      {mealId && rows.length === 0 && !notEditable && (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          Una comida no puede quedar sin alimentos: agregá uno o borrá la comida.
        </Text>
      )}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Pressable onPress={save} disabled={saving || notEditable || rows.length === 0} style={{ backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: "center", opacity: saving || notEditable || rows.length === 0 ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "700" }}>{saving ? "Guardando…" : mealId ? "Guardar cambios" : "Guardar comida"}</Text>
      </Pressable>
      {mealId && (
        <Pressable onPress={confirmDelete} style={{ backgroundColor: colors.danger, borderRadius: radius.md, padding: spacing.md, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Borrar comida</Text>
        </Pressable>
      )}
```

- [ ] **Step 4: Typecheck + mobile sweep**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores.
Run: `cd mobile && npm test -- --runInBand`
Expected: verde (nada toca tests existentes; `generando.test.tsx` es un flake pre-existente, ignorar un one-off).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/nutricion/nueva-comida.tsx
git commit -S -m "feat(mobile): borrar comida desde la edición + aviso/disable si queda sin alimentos"
```

---

## Self-Review

**Spec coverage:** botón Borrar (edit mode) → Step 2/3. Save disabled + hint en vacío → Step 3. Sin backend → correcto (`deleteMeal` ya existe). Solo modo edición (guardas `mealId`) → sí. ✅
**Placeholder scan:** sin TBD; código completo.
**Type consistency:** `deleteMeal(baseUrl, id)` existe en el cliente; `Alert`/`router` de RN/expo-router; `mealId` string; `rows`/`notEditable` ya en el componente.
