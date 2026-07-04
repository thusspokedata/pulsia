# Memoria del atleta · M3 — pantalla "Qué sabe la IA de mí" (mobile) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.
> **NOTA orquestador:** "IMPLEMENTÁ VOS, NO delegues ni spawnees subagentes". Verificar git/tests reales tras cada tarea.

**Goal:** Pantalla mobile "Qué sabe la IA de mí" que muestra la memoria del atleta (`GET /memory`) y tiene un botón "Actualizar memoria" (`POST /memory/refresh`), enlazada desde Perfil.

**Architecture:** Solo mobile. Cliente API `memory.ts` (usa `apiFetch`), una pantalla-ruta `app/memoria.tsx` (usa `getBackendUrl`, tokens, expo-router), y un link en Perfil (`router.push("/memoria")`).

**Tech Stack:** Expo/React Native + TypeScript. Tests jest (`jest-expo`, `--runInBand`), en `mobile/__tests__/`.

**Entorno:** `cd mobile && npm test -- --runInBand <patrón>`; typecheck `npm run typecheck`. Commits firmados. Rama `feat/memoria-atleta-m3` (creada).

**Contexto (verificado):**
- `mobile/src/api/client.ts` → `apiFetch(baseUrl, path, init?)` (init acepta `method`/`body`; headers JSON por defecto).
- Backend: `GET /memory` → `{ content }`; `POST /memory/refresh` → `{ content }`.
- Pantallas-ruta: archivos top-level en `mobile/app/` con `export default function XScreen()`; obtienen la URL con `getBackendUrl()` de `../src/storage/config`; tokens de `../src/theme/tokens`. Modelo: `mobile/app/configuracion.tsx`.
- Perfil: `mobile/app/(tabs)/perfil.tsx`, termina en un `<ScrollView>` con botones "Guardar perfil"/"Generar programa" (usa `router` de expo-router). Tests: `mobile/__tests__/perfil.test.tsx`.
- Modelo de test de API (mock de `apiFetch`/fetch): `mobile/__tests__/sessions-api.test.ts`. Modelo de test de pantalla: `mobile/__tests__/configuracion.test.tsx` / `historial.test.tsx`.

---

## Task 1: cliente API `memory.ts`

**Files:**
- Create: `mobile/src/api/memory.ts`, `mobile/__tests__/memory-api.test.ts`

- [ ] **Step 1: Test que falla.** Leer `mobile/__tests__/sessions-api.test.ts` para copiar cómo mockea `apiFetch` (o `fetch`). Crear `mobile/__tests__/memory-api.test.ts` con el mismo patrón:
```ts
import { getMemory, refreshMemory } from "../src/api/memory";
import { apiFetch } from "../src/api/client";

jest.mock("../src/api/client", () => ({ apiFetch: jest.fn() }));

test("getMemory devuelve el content del backend", async () => {
  (apiFetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ content: "sabe X" }) });
  expect(await getMemory("http://b.test")).toBe("sabe X");
  expect(apiFetch).toHaveBeenCalledWith("http://b.test", "/memory");
});

test("refreshMemory hace POST y devuelve el content nuevo", async () => {
  (apiFetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ content: "actualizada" }) });
  expect(await refreshMemory("http://b.test")).toBe("actualizada");
  expect(apiFetch).toHaveBeenCalledWith("http://b.test", "/memory/refresh", { method: "POST", timeoutMs: 60000 });
});

test("getMemory lanza si !ok", async () => {
  (apiFetch as jest.Mock).mockResolvedValueOnce({ ok: false });
  await expect(getMemory("http://b.test")).rejects.toThrow();
});
```
(Adaptar el shape del mock a lo que use sessions-api.test.ts.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand memory-api`

- [ ] **Step 3: Implementar** `mobile/src/api/memory.ts`:
```ts
import { apiFetch } from "./client";

export async function getMemory(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/memory");
  if (!res.ok) throw new Error("No se pudo cargar la memoria");
  return ((await res.json()) as { content: string }).content;
}

// El refresh dispara una llamada a la IA en el backend → timeout más generoso.
export async function refreshMemory(baseUrl: string): Promise<string> {
  const res = await apiFetch(baseUrl, "/memory/refresh", { method: "POST", timeoutMs: 60000 });
  if (!res.ok) throw new Error("No se pudo actualizar la memoria");
  return ((await res.json()) as { content: string }).content;
}
```

- [ ] **Step 4: Correr, confirmar PASS.** `cd mobile && npm test -- --runInBand memory-api`

- [ ] **Step 5: Commit.**
```bash
git add mobile/src/api/memory.ts mobile/__tests__/memory-api.test.ts
git commit -S -m "feat(mobile): cliente API de memoria (get/refresh)"
```

---

## Task 2: pantalla `app/memoria.tsx`

**Files:**
- Create: `mobile/app/memoria.tsx`, `mobile/__tests__/memoria.test.tsx`

- [ ] **Step 1: Test que falla.** Leer `mobile/__tests__/configuracion.test.tsx` para el patrón de mock (`../src/storage/config` → `getBackendUrl`, y `../src/api/memory`). Crear `mobile/__tests__/memoria.test.tsx`:
```ts
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import MemoriaScreen from "../app/memoria";
import { getMemory, refreshMemory } from "../src/api/memory";

jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/api/memory", () => ({ getMemory: jest.fn(), refreshMemory: jest.fn() }));

test("muestra la memoria cargada", async () => {
  (getMemory as jest.Mock).mockResolvedValue("no tiene barra");
  await render(<MemoriaScreen />);
  await waitFor(() => expect(screen.getByTestId("memoria-content").props.children).toContain("no tiene barra"));
});

test("Actualizar dispara refresh y muestra la memoria nueva", async () => {
  (getMemory as jest.Mock).mockResolvedValue("vieja");
  (refreshMemory as jest.Mock).mockResolvedValue("nueva");
  await render(<MemoriaScreen />);
  await waitFor(() => screen.getByTestId("memoria-actualizar"));
  await fireEvent.press(screen.getByTestId("memoria-actualizar"));
  await waitFor(() => expect(screen.getByTestId("memoria-content").props.children).toContain("nueva"));
});
```

- [ ] **Step 2: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand memoria`

- [ ] **Step 3: Implementar** `mobile/app/memoria.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, View, Text, Pressable } from "react-native";
import { getBackendUrl } from "../src/storage/config";
import { getMemory, refreshMemory } from "../src/api/memory";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function MemoriaScreen() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = await getBackendUrl();
      baseUrl.current = url;
      if (!url) { setError("Configurá el backend"); setLoading(false); return; }
      try { setContent(await getMemory(url)); } catch { setError("No se pudo cargar la memoria"); }
      finally { setLoading(false); }
    })();
  }, []);

  async function onRefresh() {
    const url = baseUrl.current;
    if (!url) return;
    setRefreshing(true); setError(null);
    try { setContent(await refreshMemory(url)); } catch { setError("No se pudo actualizar la memoria"); }
    finally { setRefreshing(false); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Qué sabe la IA de mí</Text>
      {error && <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
      {loading ? (
        <Text style={{ color: colors.textMuted }}>Cargando…</Text>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }}>
          <Text testID="memoria-content" style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
            {content || "Todavía no hay memoria. Entrená y actualizá para que la IA aprenda de vos."}
          </Text>
        </View>
      )}
      <Pressable
        testID="memoria-actualizar"
        onPress={onRefresh}
        disabled={refreshing || loading}
        style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center", opacity: refreshing ? 0.6 : 1 }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>{refreshing ? "Actualizando…" : "Actualizar memoria"}</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Correr, confirmar PASS + typecheck.** `cd mobile && npm test -- --runInBand memoria && npm run typecheck`

- [ ] **Step 5: Commit.**
```bash
git add mobile/app/memoria.tsx mobile/__tests__/memoria.test.tsx
git commit -S -m "feat(mobile): pantalla 'Qué sabe la IA de mí' (ver + actualizar memoria)"
```

---

## Task 3: link desde Perfil

**Files:**
- Modify: `mobile/app/(tabs)/perfil.tsx`
- Test: `mobile/__tests__/perfil.test.tsx`

- [ ] **Step 1: Test que falla.** Leer `mobile/__tests__/perfil.test.tsx` (cómo mockea `expo-router`/`router`). Agregar un test que verifique que tocar el link navega a `/memoria`:
```ts
test("el link de memoria navega a /memoria", async () => {
  // reusar el harness de render de PerfilScreen + el mock de router del archivo
  await render(<PerfilScreen />);
  await waitFor(() => screen.getByTestId("perfil-memoria-link"));
  await fireEvent.press(screen.getByTestId("perfil-memoria-link"));
  expect(mockPush).toHaveBeenCalledWith("/memoria"); // usar el nombre del spy de router.push del archivo
});
```
(Adaptar al harness real: nombre del spy de `router.push`, cómo se monta PerfilScreen.)

- [ ] **Step 2: Correr, confirmar FAIL.** `cd mobile && npm test -- --runInBand perfil`

- [ ] **Step 3: Implementar.** En `mobile/app/(tabs)/perfil.tsx`, dentro del `<ScrollView>` (por ej. antes del botón "Guardar perfil" o al final), agregar:
```tsx
<Pressable
  testID="perfil-memoria-link"
  onPress={() => router.push("/memoria")}
  style={{ alignItems: "center", paddingVertical: spacing.sm }}
>
  <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: "600" }}>Qué sabe la IA de mí →</Text>
</Pressable>
```
(`router`, `colors`, `spacing` ya están importados en perfil.tsx — verificar; si `spacing` no está, usar los imports existentes.)

- [ ] **Step 4: Correr, confirmar PASS + typecheck + suite completa.** `cd mobile && npm test -- --runInBand perfil && npm run typecheck && npm test -- --runInBand`

- [ ] **Step 5: Commit.**
```bash
git add "mobile/app/(tabs)/perfil.tsx" mobile/__tests__/perfil.test.tsx
git commit -S -m "feat(mobile): link a 'Qué sabe la IA de mí' desde Perfil"
```

---

## Cierre del PR (M3)
- `cd mobile && npm run typecheck && npm test -- --runInBand` — verde.
- Push + PR → review (timer + escalado a `@claude`) → aplicar hallazgos → merge (solo con comentarios corregidos).
- Nativo/JS → se ve en el próximo preview build. Cierra el sub-proyecto "Memoria del atleta" v1 (M1 store + M2 generación + M3 UI). El refresh usa la IA del backend (requiere API key configurada + Pi con el código nuevo).
