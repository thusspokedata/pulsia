# Pulsia Mobile Fase 2 — Perfil + Generación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario complete su perfil de entrenamiento en la app, dispare la generación con IA (`POST /programs/generate`) con una pantalla de espera, y vea un resumen del programa generado en la home.

**Architecture:** Perfil persistido en AsyncStorage (validado con `TrainingProfileSchema` de `@pulsia/shared`). La generación llama al backend usando la `backendUrl` guardada; el `Program` devuelto se guarda local (para mostrarlo hasta que la Fase 3 lo lea del backend). Pantalla `generando` con mensajes rotativos maneja los ~50s y los errores (sin API key → Configuración; error de IA → reintentar). Tests con jest-expo + RNTL.

**Tech Stack:** Expo + expo-router + AsyncStorage + `@pulsia/shared` (Zod), jest-expo, RNTL. Reutiliza el cliente API de la Fase 1.

---

## Notas previas (workflow)
- **PRs revisados con CodeRabbit.** Rama por PR; nunca commitear directo a `main`.
- **Commits firmados** (`git commit -S`), Conventional Commits, sin atribución a Claude/Anthropic.
- **Bun NO en PATH:** prefijar con `export PATH="$HOME/.bun/bin:$PATH"`.
- Tests mobile: `bun x jest <pattern>` desde `mobile/` (NO `bun test`).
- **Archivos de test NUNCA dentro de `app/`** (expo-router los toma como rutas). Los tests de pantallas van en `mobile/__tests__/`.
- **Ramas:** `feat/mobile-f2-<slug>`. Base: `main` (la Fase 1 ya está mergeada).

## Contexto ya existente (de Fase 1 — no recrear)
- `@pulsia/shared` exporta `TrainingProfileSchema`, `TrainingProfile`, `EquipmentSchema`, `Equipment`, `ExperienceSchema`, `GoalSchema`, `Program`, `ProgramSchema`.
- `mobile/src/storage/config.ts`: `getBackendUrl()`, `setBackendUrl(url)`.
- `mobile/src/api/client.ts`: `apiFetch(baseUrl, path, init?)`.
- `mobile/src/theme/tokens.ts`: `colors` (`accent`, `accentSoft`, `accentText`, `bg`, `surface`, `border`, `text`, `textMuted`), `radius`, `spacing`.
- `mobile/app/(tabs)/index.tsx` (Programa, placeholder), `mobile/app/(tabs)/perfil.tsx` (Perfil, placeholder).
- Backend: `POST /programs/generate` body = `TrainingProfile` → `{ id, program }`; errores: sin API key → 400, error IA → 502.

## File Structure (nuevos / modificados)

```text
mobile/
├── src/
│   ├── storage/
│   │   ├── profile.ts          # get/set TrainingProfile (nuevo)
│   │   └── program.ts          # get/set último Program (nuevo)
│   └── api/
│       └── programs.ts         # generateProgram(baseUrl, profile) (nuevo)
├── src/components/
│   └── ChipGroup.tsx           # multi-select de chips (nuevo)
├── app/(tabs)/
│   ├── perfil.tsx              # formulario de perfil + "Generar" (reemplaza placeholder)
│   └── index.tsx               # muestra resumen del programa si existe (modificado)
├── app/
│   └── generando.tsx           # pantalla de espera de generación (nuevo)
└── __tests__/
    ├── profile-storage.test.ts
    ├── program-storage.test.ts
    ├── programs-api.test.ts
    ├── perfil.test.tsx
    └── generando.test.tsx
```

---

## PR M3 — Perfil (formulario + storage)

### Task 3.1: Storage del perfil (TDD)

**Files:**
- Create: `mobile/src/storage/profile.ts`
- Test: `mobile/__tests__/profile-storage.test.ts`

- [ ] **Step 1: Test que falla** (`mobile/__tests__/profile-storage.test.ts`)

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getProfile, setProfile } from "../src/storage/profile";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate",
  goal: "hypertrophy",
  daysPerWeek: 4,
  sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell"],
  homeEquipment: ["bodyweight"],
  limitations: [],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("devuelve null si no hay perfil", async () => {
  expect(await getProfile()).toBeNull();
});

test("guarda y recupera un perfil válido", async () => {
  await setProfile(profile);
  expect(await getProfile()).toEqual(profile);
});

test("getProfile devuelve null si lo guardado es inválido", async () => {
  await AsyncStorage.setItem("pulsia.profile", JSON.stringify({ experience: "x" }));
  expect(await getProfile()).toBeNull();
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest profile-storage`

- [ ] **Step 3: Implementar `mobile/src/storage/profile.ts`**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TrainingProfileSchema, type TrainingProfile } from "@pulsia/shared";

const KEY = "pulsia.profile";

export async function getProfile(): Promise<TrainingProfile | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = TrainingProfileSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function setProfile(profile: TrainingProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
```

- [ ] **Step 4: Correr → PASS (3 tests)**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/mobile-f2-perfil
git add mobile/src/storage/profile.ts mobile/__tests__/profile-storage.test.ts
git commit -S -m "feat(mobile): persist training profile in AsyncStorage"
```

### Task 3.2: Componente ChipGroup (TDD)

**Files:**
- Create: `mobile/src/components/ChipGroup.tsx`
- Test: `mobile/__tests__/chipgroup.test.tsx`

- [ ] **Step 1: Test que falla** (`mobile/__tests__/chipgroup.test.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { useState } from "react";
import { ChipGroup } from "../src/components/ChipGroup";

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <ChipGroup
      options={[{ value: "a", label: "Uno" }, { value: "b", label: "Dos" }]}
      selected={value}
      onChange={setValue}
    />
  );
}

test("togglea selección al tocar un chip", async () => {
  render(<Harness />);
  await fireEvent.press(screen.getByText("Uno"));
  expect(screen.getByTestId("chip-a").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText("Uno"));
  expect(screen.getByTestId("chip-a").props.accessibilityState.selected).toBe(false);
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest chipgroup`

- [ ] **Step 3: Implementar `mobile/src/components/ChipGroup.tsx`**

```tsx
import { View, Text, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

export interface ChipOption {
  value: string;
  label: string;
}

interface Props {
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
}

export function ChipGroup({ options, selected, onChange, single }: Props) {
  function toggle(value: string) {
    if (single) {
      onChange([value]);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((o) => {
        const isOn = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            testID={`chip-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            onPress={() => toggle(o.value)}
            style={{
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: isOn ? colors.accent : colors.border,
              backgroundColor: isOn ? colors.accent : colors.bg,
            }}
          >
            <Text style={{ color: isOn ? "#fff" : colors.text, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/components/ChipGroup.tsx mobile/__tests__/chipgroup.test.tsx
git commit -S -m "feat(mobile): add ChipGroup selection component"
```

### Task 3.3: Pantalla de Perfil (TDD)

**Files:**
- Modify: `mobile/app/(tabs)/perfil.tsx`
- Test: `mobile/__tests__/perfil.test.tsx`

> La pantalla arma un `TrainingProfile` y lo guarda con `setProfile`. Usa `ChipGroup` (single para experiencia/objetivo, multi para equipamiento), `TextInput` numérico para días/minutos y de texto para limitaciones (una por línea). El botón "Guardar perfil" persiste; si el perfil es válido, muestra el botón "Generar programa" que navega a `/generando`.

- [ ] **Step 1: Test que falla** (`mobile/__tests__/perfil.test.tsx`)

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PerfilScreen from "../app/(tabs)/perfil";

beforeEach(async () => { await AsyncStorage.clear(); });

test("guarda un perfil con los valores por defecto al tocar Guardar", async () => {
  render(<PerfilScreen />);
  await fireEvent.press(screen.getByText("Guardar perfil"));
  await waitFor(async () => {
    const raw = await AsyncStorage.getItem("pulsia.profile");
    expect(raw).not.toBeNull();
    const p = JSON.parse(raw as string);
    expect(p.daysPerWeek).toBe(3);
    expect(p.experience).toBe("beginner");
  });
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest perfil.test`

- [ ] **Step 3: Implementar `mobile/app/(tabs)/perfil.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable } from "react-native";
import { router } from "expo-router";
import { TrainingProfileSchema, type TrainingProfile } from "@pulsia/shared";
import { getProfile, setProfile } from "../../src/storage/profile";
import { ChipGroup } from "../../src/components/ChipGroup";
import { colors, radius, spacing } from "../../src/theme/tokens";

const EXPERIENCE = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];
const GOAL = [
  { value: "hypertrophy", label: "Hipertrofia" },
  { value: "strength", label: "Fuerza" },
  { value: "endurance", label: "Resistencia" },
  { value: "fat_loss", label: "Pérdida de grasa" },
  { value: "general_fitness", label: "Fitness general" },
];
const EQUIPMENT = [
  { value: "bodyweight", label: "Peso corporal" },
  { value: "dumbbell", label: "Mancuernas" },
  { value: "barbell", label: "Barra" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "resistance_band", label: "Banda" },
  { value: "pull_up_bar", label: "Barra dominadas" },
  { value: "bench", label: "Banco" },
  { value: "cable_machine", label: "Cable" },
  { value: "machine", label: "Máquina" },
  { value: "trx", label: "TRX" },
];

export default function PerfilScreen() {
  const [experience, setExperience] = useState("beginner");
  const [goal, setGoal] = useState("general_fitness");
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  const [sessionMinutes, setSessionMinutes] = useState("45");
  const [gymEquipment, setGymEquipment] = useState<string[]>([]);
  const [homeEquipment, setHomeEquipment] = useState<string[]>(["bodyweight"]);
  const [limitations, setLimitations] = useState("");
  const [saved, setSaved] = useState<TrainingProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then((p) => {
      if (!p) return;
      setExperience(p.experience);
      setGoal(p.goal);
      setDaysPerWeek(String(p.daysPerWeek));
      setSessionMinutes(String(p.sessionMinutes));
      setGymEquipment(p.gymEquipment);
      setHomeEquipment(p.homeEquipment);
      setLimitations(p.limitations.join("\n"));
      setSaved(p);
    });
  }, []);

  async function onSave() {
    const candidate = {
      experience,
      goal,
      daysPerWeek: Number(daysPerWeek),
      sessionMinutes: Number(sessionMinutes),
      gymEquipment,
      homeEquipment,
      limitations: limitations.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    const parsed = TrainingProfileSchema.safeParse(candidate);
    if (!parsed.success) {
      setError("Revisá los datos: días 1-7, minutos 15-180.");
      return;
    }
    await setProfile(parsed.data);
    setSaved(parsed.data);
    setError(null);
  }

  const label = { color: colors.textMuted, marginBottom: spacing.xs } as const;
  const input = {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, color: colors.text, backgroundColor: colors.bg,
  } as const;
  const primary = {
    backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: "center",
  } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <View><Text style={label}>Experiencia</Text><ChipGroup single options={EXPERIENCE} selected={[experience]} onChange={(v) => setExperience(v[0])} /></View>
      <View><Text style={label}>Objetivo</Text><ChipGroup single options={GOAL} selected={[goal]} onChange={(v) => setGoal(v[0])} /></View>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}><Text style={label}>Días/semana</Text><TextInput style={input} keyboardType="number-pad" value={daysPerWeek} onChangeText={setDaysPerWeek} /></View>
        <View style={{ flex: 1 }}><Text style={label}>Min/sesión</Text><TextInput style={input} keyboardType="number-pad" value={sessionMinutes} onChangeText={setSessionMinutes} /></View>
      </View>
      <View><Text style={label}>Equipamiento gimnasio</Text><ChipGroup options={EQUIPMENT} selected={gymEquipment} onChange={setGymEquipment} /></View>
      <View><Text style={label}>Equipamiento casa</Text><ChipGroup options={EQUIPMENT} selected={homeEquipment} onChange={setHomeEquipment} /></View>
      <View><Text style={label}>Limitaciones (una por línea)</Text><TextInput style={[input, { minHeight: 72 }]} multiline value={limitations} onChangeText={setLimitations} placeholder="dolor lumbar leve" /></View>

      {error && <Text style={{ color: colors.accentText }}>{error}</Text>}

      <Pressable style={primary} onPress={onSave}><Text style={{ color: "#fff" }}>Guardar perfil</Text></Pressable>

      {saved && (
        <Pressable
          style={[primary, { backgroundColor: colors.accentSoft }]}
          onPress={() => router.push("/generando")}
        >
          <Text style={{ color: colors.accentText }}>Generar programa</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Suite + typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest && bun run typecheck`
Expected: todos PASS, typecheck limpio.

- [ ] **Step 6: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/"(tabs)"/perfil.tsx mobile/__tests__/perfil.test.tsx
git commit -S -m "feat(mobile): add training profile form"
git push -u origin feat/mobile-f2-perfil
gh pr create --base main --title "Mobile F2 — perfil (formulario + storage)" --body "Formulario de perfil de entrenamiento (chips + inputs), persistido y validado con TrainingProfileSchema. Botón Generar que navega a la pantalla de espera."
```

---

## PR M4 — Generación (API + pantalla de espera + resumen en home)

### Task 4.1: Storage del programa (TDD)

**Files:**
- Create: `mobile/src/storage/program.ts`
- Test: `mobile/__tests__/program-storage.test.ts`

- [ ] **Step 1: Test que falla** (`mobile/__tests__/program-storage.test.ts`)

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStoredProgram, setStoredProgram } from "../src/storage/program";
import type { Program } from "@pulsia/shared";

const program: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("null si no hay programa", async () => {
  expect(await getStoredProgram()).toBeNull();
});

test("guarda y recupera un programa", async () => {
  await setStoredProgram(program);
  expect(await getStoredProgram()).toEqual(program);
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest program-storage`

- [ ] **Step 3: Implementar `mobile/src/storage/program.ts`**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProgramSchema, type Program } from "@pulsia/shared";

const KEY = "pulsia.program";

export async function getStoredProgram(): Promise<Program | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = ProgramSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function setStoredProgram(program: Program): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(program));
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git checkout -b feat/mobile-f2-generacion
git add mobile/src/storage/program.ts mobile/__tests__/program-storage.test.ts
git commit -S -m "feat(mobile): persist last generated program in AsyncStorage"
```

### Task 4.2: API de generación (TDD)

**Files:**
- Create: `mobile/src/api/programs.ts`
- Test: `mobile/__tests__/programs-api.test.ts`

- [ ] **Step 1: Test que falla** (`mobile/__tests__/programs-api.test.ts`)

```ts
import { generateProgram, GenerationError } from "../src/api/programs";
import type { TrainingProfile } from "@pulsia/shared";

const URL = "http://backend.test";
const profile: TrainingProfile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};
const validProgram = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [] }] };

afterEach(() => { (global.fetch as any) = undefined; });

test("devuelve el programa en éxito", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "p1", program: validProgram }) }) as any;
  const res = await generateProgram(URL, profile);
  expect(res.program.name).toBe("Plan");
});

test("lanza GenerationError con code noApiKey en 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "No hay API key" }) }) as any;
  await expect(generateProgram(URL, profile)).rejects.toMatchObject({ code: "noApiKey" });
});

test("lanza GenerationError con code aiError en 502", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "fuera del catálogo" }) }) as any;
  await expect(generateProgram(URL, profile)).rejects.toMatchObject({ code: "aiError" });
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest programs-api`

- [ ] **Step 3: Implementar `mobile/src/api/programs.ts`**

```ts
import { apiFetch } from "./client";
import { ProgramSchema, type Program, type TrainingProfile } from "@pulsia/shared";

export type GenerationErrorCode = "noApiKey" | "aiError" | "network" | "invalid";

export class GenerationError extends Error {
  code: GenerationErrorCode;
  constructor(code: GenerationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function generateProgram(
  baseUrl: string,
  profile: TrainingProfile,
): Promise<{ id: string; program: Program }> {
  let res: Response;
  try {
    res = await apiFetch(baseUrl, "/programs/generate", { method: "POST", body: JSON.stringify(profile) });
  } catch {
    throw new GenerationError("network", "No se pudo conectar con el backend.");
  }
  if (res.status === 400) throw new GenerationError("noApiKey", "No hay API key de IA configurada.");
  if (!res.ok) throw new GenerationError("aiError", "La IA no pudo generar el programa. Reintentá.");
  const body = await res.json();
  const parsed = ProgramSchema.safeParse(body.program);
  if (!parsed.success) throw new GenerationError("invalid", "El programa recibido es inválido.");
  return { id: body.id, program: parsed.data };
}
```

- [ ] **Step 4: Correr → PASS (3 tests)**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/api/programs.ts mobile/__tests__/programs-api.test.ts
git commit -S -m "feat(mobile): add program generation api client"
```

### Task 4.3: Pantalla de espera de generación (TDD)

**Files:**
- Create: `mobile/app/generando.tsx`
- Test: `mobile/__tests__/generando.test.tsx`

> Al montarse: lee perfil + backendUrl, llama `generateProgram`, guarda el `Program` con `setStoredProgram` y navega a la home (`/`). En error: muestra mensaje según `code` (sin key → botón a Configuración; otro → botón Reintentar). Mensajes rotativos mientras carga.

- [ ] **Step 1: Test que falla** (`mobile/__tests__/generando.test.tsx`)

```tsx
import { render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GenerandoScreen from "../app/generando";

const replaceMock = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: any[]) => replaceMock(...a) } }));

const profile = {
  experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45,
  gymEquipment: ["barbell", "bench"], homeEquipment: ["bodyweight"], limitations: [],
};

beforeEach(async () => {
  await AsyncStorage.clear();
  replaceMock.mockClear();
  await AsyncStorage.setItem("pulsia.backendUrl", "http://backend.test");
  await AsyncStorage.setItem("pulsia.profile", JSON.stringify(profile));
});
afterEach(() => { (global.fetch as any) = undefined; });

test("genera, guarda el programa y navega a la home", async () => {
  const program = { name: "Plan", weeks: [{ weekNumber: 1, workouts: [] }] };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "p1", program }) }) as any;
  render(<GenerandoScreen />);
  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.program")).not.toBeNull();
  });
  expect(replaceMock).toHaveBeenCalledWith("/");
});

test("muestra error de API key cuando el backend devuelve 400", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "no key" }) }) as any;
  render(<GenerandoScreen />);
  await waitFor(() => {
    expect(screen.getByText("Cargá tu API key en Configuración")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest generando`

- [ ] **Step 3: Implementar `mobile/app/generando.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { router } from "expo-router";
import { getBackendUrl } from "../src/storage/config";
import { getProfile } from "../src/storage/profile";
import { setStoredProgram } from "../src/storage/program";
import { generateProgram, GenerationError } from "../src/api/programs";
import { colors, radius, spacing } from "../src/theme/tokens";

const MESSAGES = [
  "Analizando tu perfil…",
  "Eligiendo ejercicios…",
  "Armando la progresión…",
  "Ajustando cargas y descansos…",
];

export default function GenerandoScreen() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [error, setError] = useState<GenerationError | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 2500);
    return () => clearInterval(t);
  }, []);

  async function run() {
    setError(null);
    const [url, profile] = await Promise.all([getBackendUrl(), getProfile()]);
    if (!url) { setError(new GenerationError("network", "Configurá la URL del backend.")); return; }
    if (!profile) { setError(new GenerationError("invalid", "Completá tu perfil primero.")); return; }
    try {
      const { program } = await generateProgram(url, profile);
      await setStoredProgram(program);
      router.replace("/");
    } catch (e) {
      setError(e instanceof GenerationError ? e : new GenerationError("network", "Error inesperado."));
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, []);

  if (error) {
    const goConfig = error.code === "noApiKey";
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "500", color: colors.text }}>No se pudo generar</Text>
        <Text style={{ color: colors.textMuted }}>{error.message}</Text>
        <Pressable
          style={{ backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: "center" }}
          onPress={() => (goConfig ? router.replace("/configuracion") : run())}
        >
          <Text style={{ color: "#fff" }}>{goConfig ? "Cargá tu API key en Configuración" : "Reintentar"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ fontSize: 16, color: colors.text }}>{MESSAGES[msgIndex]}</Text>
      <Text style={{ color: colors.textMuted, textAlign: "center" }}>Esto puede tardar hasta un minuto.</Text>
    </View>
  );
}
```

- [ ] **Step 4: Correr → PASS (2 tests)**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/generando.tsx mobile/__tests__/generando.test.tsx
git commit -S -m "feat(mobile): add generation waiting screen with error handling"
```

### Task 4.4: Resumen del programa en la home (TDD)

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`
- Test: `mobile/__tests__/programa-home.test.tsx`

> La home lee el programa guardado. Si hay, muestra un resumen (nombre + N semanas + N días de la semana 1) y una nota de que el viewer completo llega en la próxima fase. Si no, el estado vacío actual. Usa `useFocusEffect` para recargar al volver de generar.

- [ ] **Step 1: Test que falla** (`mobile/__tests__/programa-home.test.tsx`)

```tsx
import { render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ProgramaScreen from "../app/(tabs)/index";

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  useFocusEffect: (cb: any) => cb(),
}));

beforeEach(async () => { await AsyncStorage.clear(); });

test("muestra el resumen cuando hay un programa guardado", async () => {
  const program = { name: "Hipertrofia 4 días", weeks: [
    { weekNumber: 1, workouts: [{ dayLabel: "D1", location: "gym", focus: "chest", exercises: [] }] },
    { weekNumber: 2, workouts: [] },
  ] };
  await AsyncStorage.setItem("pulsia.program", JSON.stringify(program));
  render(<ProgramaScreen />);
  await waitFor(() => {
    expect(screen.getByText("Hipertrofia 4 días")).toBeTruthy();
    expect(screen.getByText("2 semanas")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest programa-home`

- [ ] **Step 3: Implementar `mobile/app/(tabs)/index.tsx`**

```tsx
import { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { getStoredProgram } from "../../src/storage/program";
import type { Program } from "@pulsia/shared";
import { colors, radius, spacing } from "../../src/theme/tokens";

export default function ProgramaScreen() {
  const [program, setProgram] = useState<Program | null>(null);

  useFocusEffect(
    useCallback(() => {
      getStoredProgram().then(setProgram);
    }, []),
  );

  if (!program) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Programa</Text>
        <Text style={{ color: colors.textMuted }}>Todavía no hay un programa. Configurá el backend y generá uno desde Perfil.</Text>
        <Link href="/configuracion" style={{ color: colors.accent }}>Ir a configuración</Link>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>{program.name}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: colors.accentText }}>{program.weeks.length} semanas</Text>
        </View>
        <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
          <Text style={{ color: colors.accentText }}>{program.weeks[0]?.workouts.length ?? 0} días/semana</Text>
        </View>
      </View>
      <Text style={{ color: colors.textMuted }}>El viewer completo (días, ejercicios, gym/casa) llega en la próxima fase.</Text>
    </View>
  );
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Suite completa + typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest && bun run typecheck`
Expected: todos PASS, typecheck limpio.

- [ ] **Step 6: Smoke test manual (lo corre el usuario)**

Con backend corriendo y la app en el simulador: Perfil → completar → "Guardar perfil" → "Generar programa" → ver la pantalla de espera → al terminar, la home muestra el resumen del programa.

- [ ] **Step 7: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/app/"(tabs)"/index.tsx mobile/__tests__/programa-home.test.tsx
git commit -S -m "feat(mobile): show generated program summary on home"
git push -u origin feat/mobile-f2-generacion
gh pr create --base main --title "Mobile F2 — generación (espera + resumen)" --body "Storage del programa, API de generación con manejo de errores (sin key / IA), pantalla de espera con mensajes rotativos, y resumen del programa en la home. Tests con jest-expo."
```

---

## Self-Review (cobertura del spec — Fase 2)

- **Onboarding/Perfil mapeado a TrainingProfileSchema (spec §5.1):** Tasks 3.1–3.3. ✅
- **Perfil client-side en AsyncStorage, enviado en generate (spec §3, §4):** Task 3.1 + 4.2. ✅
- **Generación vía POST /programs/generate con backendUrl (spec §5.4):** Task 4.2. ✅
- **Pantalla de espera con mensajes rotativos, ~50s (spec §5.4):** Task 4.3. ✅
- **Manejo de errores: sin API key → Configuración; error IA → reintentar (spec §7):** Task 4.2–4.3. ✅
- **Timeout largo del request (spec §7):** el fetch no impone timeout corto; RN no corta a los 50s. (AbortController explícito queda para cuando se sume; documentado en el spec.)
- **Estilo C coral:** ChipGroup + botones usan `colors.accent`. ✅

**Fuera de esta fase (Fase 3+):** viewer completo del programa con toggle gym/casa y `GET /programs/latest|:id` (por ahora la home lee el programa local guardado tras generar); detalle de ejercicio + `GET /catalog` + imágenes (Fase 4).
