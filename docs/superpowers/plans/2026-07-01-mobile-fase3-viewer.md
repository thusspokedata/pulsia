# Pulsia Mobile Fase 3 — Viewer del programa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar el programa generado completo en la app (semanas → días → ejercicios), con selector de semana, toggle Gimnasio/Casa, y "Copiar a Garmin" por día — leyendo el programa guardado localmente, sin cambios en el backend.

**Architecture:** La home (`app/(tabs)/index.tsx`) lee el `Program` de AsyncStorage (`getStoredProgram`, ya existe) y lo renderiza con componentes chicos: selector de semana, toggle gym/casa, y una tarjeta por día con sus ejercicios. "Copiar a Garmin" usa `expo-clipboard`. Estilo "C" (coral). Tests con jest-expo.

**Tech Stack:** Expo + expo-router + AsyncStorage + `@pulsia/shared` (tipos), `expo-clipboard`, jest-expo, RNTL.

---

## Notas previas (workflow)
- **PRs revisados con CodeRabbit.** Rama por PR; nunca commitear directo a `main`. Rama: `feat/mobile-f3-viewer`. Base: `main`.
- **Commits firmados** (`git commit -S`), Conventional Commits, sin atribución a Claude/Anthropic.
- **Bun NO en PATH:** prefijar con `export PATH="$HOME/.bun/bin:$PATH"`.
- Tests mobile con `bun x jest <pattern>` desde `mobile/`. **Tests de pantallas/componentes en `mobile/__tests__/`, NUNCA en `mobile/app/`.**
- Componentes que importan `expo-router` en tests → `jest.mock("expo-router", ...)`. Usar `await render(...)`/`await fireEvent...(...)` (RNTL v14 async).

## Contexto existente (no recrear)
- `mobile/src/storage/program.ts`: `getStoredProgram()` → `Program | null` (valida con `ProgramSchema`).
- `@pulsia/shared`: `Program`, `Workout` (`{ dayLabel, location: "gym"|"home", focus, exercises: ProgramExercise[] }`), `ProgramExercise` (`{ catalogId, garminName, sets, reps, targetLoad, restSeconds, notes }`).
- `mobile/src/theme/tokens.ts`: `colors` (`accent`, `accentSoft`, `accentText`, `bg`, `surface`, `border`, `text`, `textMuted`), `radius`, `spacing`.
- `mobile/app/(tabs)/index.tsx`: hoy muestra un resumen del programa (nombre + semanas + días) o el estado vacío; usa `useFocusEffect` + `getStoredProgram` (con un ref `lastLoaded`). Se reemplaza el bloque "con programa" por el viewer.

## File Structure

```text
mobile/
├── src/components/
│   ├── SegmentToggle.tsx      # toggle de 2 opciones (Gimnasio/Casa) (nuevo)
│   ├── WeekTabs.tsx           # selector de semana (nuevo)
│   └── WorkoutDayCard.tsx     # tarjeta de un día + ejercicios + copiar (nuevo)
├── app/(tabs)/index.tsx       # compone el viewer (modificado)
└── __tests__/
    ├── segmenttoggle.test.tsx
    ├── weektabs.test.tsx
    ├── workoutdaycard.test.tsx
    └── programa-viewer.test.tsx
```

---

## PR — Viewer del programa

### Task 1: `SegmentToggle` (TDD)

**Files:**
- Create: `mobile/src/components/SegmentToggle.tsx`
- Test: `mobile/__tests__/segmenttoggle.test.tsx`

- [ ] **Step 1: Test que falla** (`mobile/__tests__/segmenttoggle.test.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { useState } from "react";
import { SegmentToggle } from "../src/components/SegmentToggle";

function Harness() {
  const [v, setV] = useState("gym");
  return (
    <SegmentToggle
      options={[{ value: "gym", label: "Gimnasio" }, { value: "home", label: "Casa" }]}
      value={v}
      onChange={setV}
    />
  );
}

test("cambia el valor seleccionado al tocar una opción", async () => {
  await render(<Harness />);
  expect(screen.getByTestId("seg-gym").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText("Casa"));
  expect(screen.getByTestId("seg-home").props.accessibilityState.selected).toBe(true);
  expect(screen.getByTestId("seg-gym").props.accessibilityState.selected).toBe(false);
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest segmenttoggle`

- [ ] **Step 3: Implementar `mobile/src/components/SegmentToggle.tsx`**

```tsx
import { View, Text, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}

export function SegmentToggle({ options, value, onChange }: Props) {
  return (
    <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, overflow: "hidden" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`seg-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: spacing.sm, alignItems: "center", backgroundColor: on ? colors.accent : colors.bg }}
          >
            <Text style={{ color: on ? "#fff" : colors.textMuted, fontSize: 13 }}>{o.label}</Text>
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
git checkout -b feat/mobile-f3-viewer
git add mobile/src/components/SegmentToggle.tsx mobile/__tests__/segmenttoggle.test.tsx
git commit -S -m "feat(mobile): add SegmentToggle component"
```

### Task 2: `WeekTabs` (TDD)

**Files:**
- Create: `mobile/src/components/WeekTabs.tsx`
- Test: `mobile/__tests__/weektabs.test.tsx`

- [ ] **Step 1: Test que falla** (`mobile/__tests__/weektabs.test.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { useState } from "react";
import { WeekTabs } from "../src/components/WeekTabs";

function Harness() {
  const [w, setW] = useState(1);
  return <WeekTabs weeks={[1, 2, 3]} selected={w} onSelect={setW} />;
}

test("marca la semana seleccionada y permite cambiarla", async () => {
  await render(<Harness />);
  expect(screen.getByTestId("week-1").props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByText("Semana 3"));
  expect(screen.getByTestId("week-3").props.accessibilityState.selected).toBe(true);
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest weektabs`

- [ ] **Step 3: Implementar `mobile/src/components/WeekTabs.tsx`**

```tsx
import { ScrollView, Text, Pressable } from "react-native";
import { colors, radius, spacing } from "../theme/tokens";

interface Props {
  weeks: number[];
  selected: number;
  onSelect: (w: number) => void;
}

export function WeekTabs({ weeks, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {weeks.map((w) => {
        const on = w === selected;
        return (
          <Pressable
            key={w}
            testID={`week-${w}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(w)}
            style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: on ? colors.accent : colors.surface }}
          >
            <Text style={{ color: on ? "#fff" : colors.text, fontSize: 13 }}>Semana {w}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/components/WeekTabs.tsx mobile/__tests__/weektabs.test.tsx
git commit -S -m "feat(mobile): add WeekTabs component"
```

### Task 3: `WorkoutDayCard` + copiar a Garmin (TDD)

**Files:**
- Create: `mobile/src/components/WorkoutDayCard.tsx`
- Test: `mobile/__tests__/workoutdaycard.test.tsx`

- [ ] **Step 1: Instalar `expo-clipboard`**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bunx expo install expo-clipboard`
Expected: agrega `expo-clipboard` compatible con el SDK. (Si `expo install` falla en el monorepo, `bun add expo-clipboard` y reportar.)

- [ ] **Step 2: Test que falla** (`mobile/__tests__/workoutdaycard.test.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { WorkoutDayCard } from "../src/components/WorkoutDayCard";

const setStringAsync = jest.fn();
jest.mock("expo-clipboard", () => ({ setStringAsync: (...a: any[]) => setStringAsync(...a) }));

const workout = {
  dayLabel: "Día 1 - Empuje",
  location: "gym",
  focus: "chest",
  exercises: [
    { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 120, notes: "" },
    { catalogId: "overhead_press", garminName: "Overhead Press", sets: 3, reps: "10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
  ],
};

test("muestra el día y sus ejercicios", async () => {
  await render(<WorkoutDayCard workout={workout as any} />);
  expect(screen.getByText("Día 1 - Empuje")).toBeTruthy();
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  expect(screen.getByText("4 × 8-10")).toBeTruthy();
});

test("copiar a Garmin copia los nombres de los ejercicios", async () => {
  setStringAsync.mockClear();
  await render(<WorkoutDayCard workout={workout as any} />);
  await fireEvent.press(screen.getByText("Copiar a Garmin"));
  expect(setStringAsync).toHaveBeenCalledWith("Barbell Bench Press\nOverhead Press");
});
```

- [ ] **Step 3: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest workoutdaycard`

- [ ] **Step 4: Implementar `mobile/src/components/WorkoutDayCard.tsx`**

```tsx
import { View, Text, Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Workout } from "@pulsia/shared";
import { colors, radius, spacing } from "../theme/tokens";

interface Props {
  workout: Workout;
}

export function WorkoutDayCard({ workout }: Props) {
  async function copy() {
    await Clipboard.setStringAsync(workout.exercises.map((e) => e.garminName).join("\n"));
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: colors.text }}>{workout.dayLabel}</Text>
        <Pressable
          onPress={copy}
          style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}
        >
          <Text style={{ color: colors.accentText, fontSize: 12 }}>Copiar a Garmin</Text>
        </Pressable>
      </View>
      {workout.exercises.map((e, i) => (
        <View key={`${e.catalogId}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs }}>
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm, minWidth: 56, alignItems: "center" }}>
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "500" }}>{e.sets} × {e.reps}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>{e.garminName}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{e.targetLoad} · descanso {e.restSeconds}s</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 5: Correr → PASS**

- [ ] **Step 6: Commit**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add mobile/src/components/WorkoutDayCard.tsx mobile/__tests__/workoutdaycard.test.tsx mobile/package.json bun.lock
git commit -S -m "feat(mobile): add WorkoutDayCard with copy-to-Garmin"
```

### Task 4: Componer el viewer en la home (TDD)

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`
- Test: `mobile/__tests__/programa-viewer.test.tsx`

> La home, cuando hay programa, muestra: nombre, `WeekTabs`, `SegmentToggle` (gym/casa), y las `WorkoutDayCard` de los días de la semana + ubicación seleccionadas. Sin programa → estado vacío existente.

- [ ] **Step 1: Test que falla** (`mobile/__tests__/programa-viewer.test.tsx`)

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ProgramaScreen from "../app/(tabs)/index";

jest.mock("expo-router", () => ({ Link: ({ children }: any) => children, useFocusEffect: (cb: any) => cb() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

const program = {
  name: "Plan Hipertrofia",
  weeks: [
    { weekNumber: 1, workouts: [
      { dayLabel: "Día 1 (Gym)", location: "gym", focus: "chest", exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 120, notes: "" }] },
      { dayLabel: "Día 1 (Casa)", location: "home", focus: "chest", exercises: [{ catalogId: "push_up", garminName: "Push-Up", sets: 4, reps: "12", targetLoad: "peso corporal", restSeconds: 90, notes: "" }] },
    ] },
    { weekNumber: 2, workouts: [] },
  ],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("muestra los días de gimnasio y permite cambiar a casa", async () => {
  await AsyncStorage.setItem("pulsia.program", JSON.stringify(program));
  await render(<ProgramaScreen />);
  await waitFor(() => expect(screen.getByText("Plan Hipertrofia")).toBeTruthy());
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  await fireEvent.press(screen.getByText("Casa"));
  expect(screen.getByText("Push-Up")).toBeTruthy();
});
```

- [ ] **Step 2: Correr → FAIL**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest programa-viewer`

- [ ] **Step 3: Reemplazar `mobile/app/(tabs)/index.tsx`**

```tsx
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { getStoredProgram } from "../../src/storage/program";
import type { Program } from "@pulsia/shared";
import { WeekTabs } from "../../src/components/WeekTabs";
import { SegmentToggle } from "../../src/components/SegmentToggle";
import { WorkoutDayCard } from "../../src/components/WorkoutDayCard";
import { colors, spacing } from "../../src/theme/tokens";

export default function ProgramaScreen() {
  const [program, setProgram] = useState<Program | null>(null);
  const [week, setWeek] = useState(1);
  const [location, setLocation] = useState("gym");
  const lastLoaded = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getStoredProgram().then((p) => {
        if (!active) return;
        const serialized = p ? JSON.stringify(p) : null;
        if (serialized === lastLoaded.current) return;
        lastLoaded.current = serialized;
        setProgram(p);
        if (p && !p.weeks.some((w) => w.weekNumber === week)) setWeek(p.weeks[0]?.weekNumber ?? 1);
      });
      return () => {
        active = false;
      };
    }, [week]),
  );

  const currentWeek = useMemo(() => program?.weeks.find((w) => w.weekNumber === week), [program, week]);
  const days = useMemo(() => currentWeek?.workouts.filter((w) => w.location === location) ?? [], [currentWeek, location]);

  if (!program) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>Programa</Text>
        <Text style={{ color: colors.textMuted }}>Todavía no hay un programa. Configurá el backend y generá uno desde Perfil.</Text>
        <Link href="/configuracion" style={{ color: colors.accent }}><Text>Ir a configuración</Text></Link>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
      <Text style={{ fontSize: 20, fontWeight: "500", color: colors.text }}>{program.name}</Text>
      <WeekTabs weeks={program.weeks.map((w) => w.weekNumber)} selected={week} onSelect={setWeek} />
      <SegmentToggle options={[{ value: "gym", label: "Gimnasio" }, { value: "home", label: "Casa" }]} value={location} onChange={setLocation} />
      {days.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>No hay días para esta selección.</Text>
      ) : (
        days.map((w, i) => <WorkoutDayCard key={`${w.dayLabel}-${i}`} workout={w} />)
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 4: Correr → PASS**

- [ ] **Step 5: Suite completa + typecheck**

Run: `cd /Users/kilo/desarrollo26/pulsia/mobile && export PATH="$HOME/.bun/bin:$PATH" && bun x jest && bun run typecheck`
Expected: todos PASS, typecheck limpio.

- [ ] **Step 6: Smoke test manual (lo corre el usuario)**

Con backend + app en el simulador: generá un programa → la home muestra el viewer (semanas, toggle gym/casa, días con ejercicios) → "Copiar a Garmin" copia los nombres.

- [ ] **Step 7: Commit + PR**

```bash
cd /Users/kilo/desarrollo26/pulsia
git add "mobile/app/(tabs)/index.tsx" mobile/__tests__/programa-viewer.test.tsx
git commit -S -m "feat(mobile): full program viewer (weeks, gym/home, exercises)"
git push -u origin feat/mobile-f3-viewer
gh pr create --base main --title "Mobile F3 — viewer del programa" --body "Viewer completo del programa leyendo el programa local: selector de semana, toggle Gimnasio/Casa, días con ejercicios (series×reps, carga, descanso), y Copiar a Garmin por día. Tests con jest-expo."
```

---

## Self-Review (cobertura del spec — Fase 3)

- **Viewer del programa: semanas → días → ejercicios (spec §5.3):** Tasks 1-4. ✅
- **Toggle Gimnasio/Casa (spec §5.3):** `SegmentToggle` (Task 1) + filtro por `location` (Task 4). ✅
- **Copiar a Garmin por día (spec §5.3):** `WorkoutDayCard` (Task 3). ✅
- **Lee el programa local (sin backend, camino rápido):** Task 4 usa `getStoredProgram`. ✅
- **Estilo C (coral):** todos los componentes usan `colors.accent`. ✅

**Fuera de esta fase:** detalle de ejercicio con imágenes + músculos (spec §5.5 / Fase 4), y leer el programa del backend por usuario (`GET /programs/latest`) — que llega junto con el auth. Hoy el viewer usa el programa guardado local, suficiente para uso single-user inmediato.
