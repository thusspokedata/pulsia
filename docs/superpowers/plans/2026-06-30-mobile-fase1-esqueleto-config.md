# Pulsia Mobile Fase 1 — Esqueleto + Configuración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar la app mobile (Expo) dentro del monorepo con navegación por tabs, tema estilo "C" (coral), y una pantalla de Configuración que guarda la URL del backend (local) y la API key de IA (en el backend, encriptada), con test de conexión.

**Architecture:** Paquete `mobile/` (@pulsia/mobile) en el workspace de Bun. Expo + expo-router (tabs + stack). `metro.config.js` configurado para monorepo (resuelve `@pulsia/shared`). Estado local en AsyncStorage (`backendUrl`). Cliente HTTP fino que usa esa URL; la API key se envía a `POST /settings` del backend. Tests con `jest-expo` + React Native Testing Library.

**Tech Stack:** Expo (SDK reciente), React Native, TypeScript, expo-router, @react-native-async-storage/async-storage, @tanstack/react-query, jest-expo, @testing-library/react-native. Reutiliza `@pulsia/shared`.

---

## Notas previas (workflow)
- **Trabajo por PRs revisados con CodeRabbit.** Cada grupo "PR" termina creando un PR. Rama por PR; nunca commitear directo a `main`.
- **Commits firmados** (`git commit -S`), Conventional Commits, sin atribución a Claude/Anthropic.
- **Bun NO está en el PATH por defecto:** prefijar comandos con `export PATH="$HOME/.bun/bin:$PATH"`.
- **Ramas:** `feat/mobile-f1-<slug>`. Base: `main`.
- Los tests de mobile corren con **jest** (`bun x jest` desde `mobile/`), NO con `bun test`.

## File Structure

```text
mobile/
├── package.json               # @pulsia/mobile
├── app.json                   # config de Expo
├── tsconfig.json
├── metro.config.js            # monorepo (watchFolders + nodeModulesPaths)
├── babel.config.js
├── jest.config.js             # preset jest-expo
├── jest-setup.ts              # RNTL + mock de AsyncStorage
├── app/                       # expo-router
│   ├── _layout.tsx            # stack raíz + QueryClientProvider + tema
│   ├── (tabs)/
│   │   ├── _layout.tsx        # tab bar (Programa, Perfil)
│   │   ├── index.tsx          # Programa (placeholder en F1)
│   │   └── perfil.tsx         # Perfil (placeholder en F1)
│   └── configuracion.tsx      # pantalla de Configuración
└── src/
    ├── theme/
    │   └── tokens.ts          # colores/estilo "C" (coral)
    ├── storage/
    │   ├── config.ts          # get/set backendUrl (AsyncStorage)
    │   └── config.test.ts
    └── api/
        ├── client.ts          # fetch wrapper (usa backendUrl)
        ├── health.ts          # testConnection()
        ├── settings.ts        # getSettings(), saveSettings()
        └── api.test.ts
```

---

## PR M1 — Workspace mobile + scaffold Expo + esqueleto de navegación

### Task 1.1: Scaffold del paquete mobile en el monorepo

**Files:**
- Create: `mobile/` (vía Expo), `mobile/metro.config.js`, `mobile/tsconfig.json`
- Modify: `package.json` (root, workspaces)

- [ ] **Step 1: Verificar herramientas**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun --version && node --version`
Expected: ambas imprimen versión.

- [ ] **Step 2: Crear el proyecto Expo dentro de `mobile/`**

Run:
```bash
cd /Users/kilo/desarrollo26/pulsia
export PATH="$HOME/.bun/bin:$PATH"
bunx create-expo-app@latest mobile --template blank-typescript --no-install
```
Expected: crea `mobile/` con `App.tsx`, `app.json`, `package.json`, `tsconfig.json`. (Usamos `--no-install` porque las deps se instalan desde la raíz con el workspace de Bun.)

- [ ] **Step 3: Agregar `mobile` al workspace root**

Editar `package.json` (root) para incluir `mobile` en `workspaces`:
```json
{
  "name": "pulsia",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "backend", "mobile"],
  "scripts": {
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck"
  }
}
```

- [ ] **Step 4: Ajustar `mobile/package.json`**

Reemplazar el `package.json` generado por (conservando el `version` de Expo que haya generado en las deps — si difiere, mantené las versiones que puso create-expo-app):
```json
{
  "name": "@pulsia/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "@pulsia/shared": "workspace:*",
    "@react-native-async-storage/async-storage": "2.1.0",
    "@tanstack/react-query": "^5.62.0",
    "expo": "*",
    "expo-router": "*",
    "expo-constants": "*",
    "expo-linking": "*",
    "expo-status-bar": "*",
    "react": "*",
    "react-native": "*",
    "react-native-safe-area-context": "*",
    "react-native-screens": "*"
  },
  "devDependencies": {
    "@testing-library/react-native": "^12.9.0",
    "@types/react": "*",
    "jest": "^29.7.0",
    "jest-expo": "*",
    "typescript": "*"
  }
}
```
> Nota: dejar `"expo": "*"` etc. hará que Bun resuelva lo que create-expo-app fijó; si preferís versiones exactas, copiá las que generó create-expo-app. Lo importante: agregar `@pulsia/shared`, async-storage, react-query, expo-router, jest-expo y RNTL.

- [ ] **Step 5: Crear `mobile/metro.config.js` (monorepo)**

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

- [ ] **Step 6: Crear `mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
```

- [ ] **Step 7: Configurar expo-router en `mobile/app.json`**

Asegurar que `app.json` tenga el plugin y el scheme (dentro de `expo`):
```json
{
  "expo": {
    "name": "Pulsia",
    "slug": "pulsia",
    "scheme": "pulsia",
    "newArchEnabled": true,
    "plugins": ["expo-router"]
  }
}
```
(Conservar el resto de campos que generó create-expo-app: `version`, `orientation`, `icon`, etc.)

- [ ] **Step 8: Borrar `App.tsx`** (expo-router usa `app/`)

Run: `rm mobile/App.tsx`

- [ ] **Step 9: Instalar desde la raíz**

Run: `cd /Users/kilo/desarrollo26/pulsia && export PATH="$HOME/.bun/bin:$PATH" && bun install`
Expected: instala sin errores; `@pulsia/mobile` y `@pulsia/shared` se enlazan como workspaces.

- [ ] **Step 10: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/mobile-f1-scaffold
git add mobile package.json bun.lock
git commit -S -m "chore(mobile): scaffold expo app in monorepo with metro config"
```

### Task 1.2: Tema (estilo C) + navegación por tabs

**Files:**
- Create: `mobile/src/theme/tokens.ts`, `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/perfil.tsx`

- [ ] **Step 1: Crear `mobile/src/theme/tokens.ts`** (paleta estilo "C" coral)

```ts
export const colors = {
  accent: "#D85A30",
  accentSoft: "#FAECE7",
  accentText: "#993C1D",
  bg: "#FFFFFF",
  surface: "#F7F5F2",
  border: "#E5E2DC",
  text: "#1A1A1A",
  textMuted: "#6B6B6B",
};

export const radius = { sm: 8, md: 12, pill: 20 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
```

- [ ] **Step 2: Crear `mobile/app/_layout.tsx`** (stack raíz + React Query)

```tsx
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="configuracion" options={{ headerShown: true, title: "Configuración", presentation: "modal" }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Crear `mobile/app/(tabs)/_layout.tsx`** (tab bar)

```tsx
import { Tabs } from "expo-router";
import { colors } from "../../src/theme/tokens";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Programa" }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil" }} />
    </Tabs>
  );
}
```

- [ ] **Step 4: Crear `mobile/app/(tabs)/index.tsx`** (placeholder Programa)

```tsx
import { View, Text } from "react-native";
import { Link } from "expo-router";
import { colors, spacing } from "../../src/theme/tokens";

export default function ProgramaScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Programa</Text>
      <Text style={{ color: colors.textMuted }}>Todavía no hay un programa. Configurá el backend para empezar.</Text>
      <Link href="/configuracion" style={{ color: colors.accent }}>Ir a configuración</Link>
    </View>
  );
}
```

- [ ] **Step 5: Crear `mobile/app/(tabs)/perfil.tsx`** (placeholder Perfil)

```tsx
import { View, Text } from "react-native";
import { colors, spacing } from "../../src/theme/tokens";

export default function PerfilScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Perfil</Text>
    </View>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck`
Expected: sin errores. (Si `tsc` no está, `bun add -d typescript` en `mobile`.)

- [ ] **Step 7: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile
git commit -S -m "feat(mobile): add coral theme and tab navigation skeleton"
git push -u origin feat/mobile-f1-scaffold
gh pr create --base main --title "Mobile F1 — scaffold Expo + navegación" --body "Scaffold de Expo en el monorepo (metro config), tema estilo C y tabs Programa/Perfil."
```

---

## PR M2 — Storage, cliente API y pantalla de Configuración

### Task 2.1: Configurar jest-expo

**Files:**
- Create: `mobile/jest.config.js`, `mobile/jest-setup.ts`

- [ ] **Step 1: Crear `mobile/jest.config.js`**

```js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest-setup.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@tanstack/.*))",
  ],
};
```

- [ ] **Step 2: Crear `mobile/jest-setup.ts`**

```ts
import "@testing-library/react-native/extend-expect";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
```

- [ ] **Step 3: Verificar que jest arranca (sin tests aún)**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest --passWithNoTests`
Expected: "No tests found, exiting with code 0" (o similar) sin errores de config.

- [ ] **Step 4: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/mobile-f1-config
git add mobile/jest.config.js mobile/jest-setup.ts
git commit -S -m "chore(mobile): configure jest-expo"
```

### Task 2.2: Storage de `backendUrl` (TDD)

**Files:**
- Create: `mobile/src/storage/config.ts`
- Test: `mobile/src/storage/config.test.ts`

- [ ] **Step 1: Escribir el test que falla** (`mobile/src/storage/config.test.ts`)

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBackendUrl, setBackendUrl } from "./config";

beforeEach(async () => { await AsyncStorage.clear(); });

test("devuelve null si no hay URL guardada", async () => {
  expect(await getBackendUrl()).toBeNull();
});

test("guarda y recupera la URL", async () => {
  await setBackendUrl("http://192.168.1.50:8787");
  expect(await getBackendUrl()).toBe("http://192.168.1.50:8787");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest config.test`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `mobile/src/storage/config.ts`**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.backendUrl";

export async function getBackendUrl(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY, url);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest config.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/storage
git commit -S -m "feat(mobile): persist backend url in AsyncStorage"
```

### Task 2.3: Cliente API — health y settings (TDD)

**Files:**
- Create: `mobile/src/api/client.ts`, `mobile/src/api/health.ts`, `mobile/src/api/settings.ts`
- Test: `mobile/src/api/api.test.ts`

- [ ] **Step 1: Escribir el test que falla** (`mobile/src/api/api.test.ts`)

```ts
import { testConnection } from "./health";
import { saveSettings, getSettings } from "./settings";

const URL = "http://backend.test";

afterEach(() => { (global.fetch as any) = undefined; });

test("testConnection true cuando /health responde ok", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }) as any;
  expect(await testConnection(URL)).toBe(true);
});

test("testConnection false cuando falla la red", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("network")) as any;
  expect(await testConnection(URL)).toBe(false);
});

test("saveSettings hace POST /settings con la api key", async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  global.fetch = fetchMock as any;
  await saveSettings(URL, { aiApiKey: "sk-ant-x", aiModel: "claude-sonnet-4-6" });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://backend.test/settings",
    expect.objectContaining({ method: "POST" }),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.aiApiKey).toBe("sk-ant-x");
});

test("getSettings devuelve hasApiKey", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ hasApiKey: true, aiModel: "claude-sonnet-4-6" }) }) as any;
  expect(await getSettings(URL)).toEqual({ hasApiKey: true, aiModel: "claude-sonnet-4-6" });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest api.test`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `mobile/src/api/client.ts`**

```ts
export async function apiFetch(baseUrl: string, path: string, init?: RequestInit): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}
```

- [ ] **Step 4: Implementar `mobile/src/api/health.ts`**

```ts
import { apiFetch } from "./client";

export async function testConnection(baseUrl: string): Promise<boolean> {
  try {
    const res = await apiFetch(baseUrl, "/health");
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Implementar `mobile/src/api/settings.ts`**

```ts
import { apiFetch } from "./client";

export interface SettingsInput {
  aiApiKey: string;
  aiModel: string;
}

export interface SettingsStatus {
  hasApiKey: boolean;
  aiModel: string;
}

export async function saveSettings(baseUrl: string, input: SettingsInput): Promise<void> {
  const res = await apiFetch(baseUrl, "/settings", { method: "POST", body: JSON.stringify(input) });
  if (!res.ok) throw new Error("No se pudo guardar la configuración");
}

export async function getSettings(baseUrl: string): Promise<SettingsStatus> {
  const res = await apiFetch(baseUrl, "/settings");
  return res.json();
}
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest api.test`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/api
git commit -S -m "feat(mobile): add api client for health and settings"
```

### Task 2.4: Pantalla de Configuración (TDD de componente)

**Files:**
- Create: `mobile/app/configuracion.tsx`
- Test: `mobile/app/configuracion.test.tsx`

- [ ] **Step 1: Escribir el test que falla** (`mobile/app/configuracion.test.tsx`)

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ConfiguracionScreen from "./configuracion";

beforeEach(async () => { await AsyncStorage.clear(); });

test("guarda la URL del backend al tocar Guardar", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ hasApiKey: false, aiModel: "claude-sonnet-4-6" }) }) as any;
  render(<ConfiguracionScreen />);
  fireEvent.changeText(screen.getByPlaceholderText("http://192.168.1.50:8787"), "http://10.0.0.2:8787");
  fireEvent.press(screen.getByText("Guardar URL"));
  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.backendUrl")).toBe("http://10.0.0.2:8787");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest configuracion.test`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Implementar `mobile/app/configuracion.tsx`**

```tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { getBackendUrl, setBackendUrl } from "../src/storage/config";
import { testConnection } from "../src/api/health";
import { saveSettings } from "../src/api/settings";
import { colors, radius, spacing } from "../src/theme/tokens";

export default function ConfiguracionScreen() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { getBackendUrl().then((u) => u && setUrl(u)); }, []);

  async function onSaveUrl() {
    await setBackendUrl(url);
    const ok = await testConnection(url);
    setStatus(ok ? "Conexión OK" : "No se pudo conectar");
  }

  async function onSaveKey() {
    try {
      await saveSettings(url, { aiApiKey: apiKey, aiModel: "claude-sonnet-4-6" });
      setApiKey("");
      setStatus("API key guardada");
    } catch {
      setStatus("Error al guardar la API key");
    }
  }

  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, color: colors.text, backgroundColor: colors.bg,
  } as const;
  const button = {
    backgroundColor: colors.accent, borderRadius: radius.sm,
    padding: spacing.md, alignItems: "center",
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>URL del backend</Text>
        <TextInput style={input} placeholder="http://192.168.1.50:8787" autoCapitalize="none" value={url} onChangeText={setUrl} />
        <Pressable style={button} onPress={onSaveUrl}><Text style={{ color: "#fff" }}>Guardar URL</Text></Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>API key de IA</Text>
        <TextInput style={input} placeholder="sk-ant-..." autoCapitalize="none" secureTextEntry value={apiKey} onChangeText={setApiKey} />
        <Pressable style={button} onPress={onSaveKey}><Text style={{ color: "#fff" }}>Guardar API key</Text></Pressable>
      </View>

      {status && <Text style={{ color: colors.accentText }}>{status}</Text>}
    </View>
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest configuracion.test`
Expected: PASS.

- [ ] **Step 5: Suite completa mobile + typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest && bun run typecheck`
Expected: todos los tests PASS, typecheck limpio.

- [ ] **Step 6: Smoke test manual (opcional, lo corre el usuario)**

Con el backend corriendo (`docker compose up -d` + `cd backend && bun run dev`):
```bash
cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun run start
```
Abrir en Expo Go / simulador → ir a Configuración → cargar la URL del backend (la de tu VPN/LAN) → "Guardar URL" muestra "Conexión OK" → cargar API key → "API key guardada".

- [ ] **Step 7: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile
git commit -S -m "feat(mobile): add configuration screen (backend url + api key)"
git push -u origin feat/mobile-f1-config
gh pr create --base main --title "Mobile F1 — configuración (URL backend + API key)" --body "Storage de backendUrl, cliente API (health/settings), y pantalla de Configuración con test de conexión. Tests con jest-expo."
```

---

## Self-Review (cobertura del spec — Fase 1)

- **Stack Expo + expo-router + TanStack Query + AsyncStorage (spec §3):** Tasks 1.1–1.2, 2.1. ✅
- **Monorepo + `@pulsia/shared` (spec §3, §6):** metro.config.js (Task 1.1) + dependency. ✅
- **`backendUrl` configurable en AsyncStorage (spec §3):** Task 2.2. ✅
- **API key → `POST /settings`, nunca en el cliente (spec §3, §5.2):** Task 2.3–2.4 (se envía, no se persiste local). ✅
- **Pantalla de Configuración con test de conexión a `/health` (spec §5.2):** Task 2.4. ✅
- **Estilo "C" coral (spec §1):** Task 1.2 (tokens). ✅
- **Testing con jest-expo + RNTL (spec §8):** Tasks 2.1–2.4. ✅

**Fuera de esta fase (próximos planes):** onboarding/perfil + generación (Fase 2), viewer del programa + `GET /programs/latest|:id` (Fase 3), detalle de ejercicio + `GET /catalog` + imágenes (Fase 4). Estos endpoints del backend se agregan en sus fases correspondientes.
