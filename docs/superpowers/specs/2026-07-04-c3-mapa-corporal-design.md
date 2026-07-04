# C3 — Mapa corporal (músculos trabajados) — Diseño

> Fecha: 2026-07-04. Estado: aprobado (decisiones tomadas autónomamente), pendiente de implementación.
> Sub-proyecto **C3**. Vive dentro del resumen post-entrenamiento (C2), reemplazando la lista "por
> músculo". Aparece tanto al Terminar entrenamiento como en el detalle del historial (ambos usan
> `SessionSummary`).

## 0. Objetivo

Silueta humana (frente + espalda) que resalta los músculos trabajados en la sesión, estilo Garmin:
**primary** en color fuerte, **secondary** en color suave, **untargeted** en gris.

## 1. Librería (decidido)

- **`react-native-body-highlighter` v3.2.0 (MIT)** + **`react-native-svg`**. Compatible con Expo SDK
  57 / RN 0.86 (peer `react-native-svg ^15.9.0`, que Expo 57 satisface). Soporta front/back y colores
  por `intensity`. No requiere config plugin; `react-native-svg` es dep nativa → **nuevo preview/dev build**.
- Instalar: `bunx expo install react-native-svg` + `bun add react-native-body-highlighter`.

## 2. Datos

El catálogo (`@pulsia/shared`, `getExerciseById`) tiene `primaryMuscles` **y** `secondaryMuscles` por
ejercicio. Valores posibles (11): `abs, back, full_body, glutes, shoulders, chest, quads, hamstrings,
triceps, calves, biceps`.

Extender `summarize` (`mobile/src/session/summary.ts`) para exponer, sobre los ejercicios con series
terminadas:
- `primaryMuscles: string[]` — distintos `primaryMuscles` trabajados.
- `secondaryMuscles: string[]` — distintos `secondaryMuscles` trabajados.

(Se mantiene `perMuscle` existente; el mapa usa los dos sets nuevos.)

## 3. Mapeo músculo → slug de la librería

`mobile/src/session/muscleMap.ts` (PURO, testeable):

```ts
export const MUSCLE_MAP: Record<string, string[] | null> = {
  abs: ["abs"],
  back: ["upper-back", "lower-back", "trapezius"],
  glutes: ["gluteal"],
  shoulders: ["deltoids"],
  chest: ["chest"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  triceps: ["triceps"],
  calves: ["calves"],
  biceps: ["biceps"],
  full_body: null, // no localizable → chip "Cuerpo completo", no se pinta
};

export interface BodyDatum { slug: string; intensity: number }

// primary → intensity 1 (colors[0]); secondary → intensity 2 (colors[1]). primary gana si un
// músculo aparece en ambos (min de intensity). full_body no entra a data.
export function buildBodyData(primary: string[], secondary: string[]): { data: BodyDatum[]; hasFullBody: boolean } { ... }
```

## 4. Componente `MuscleMap` (`mobile/src/components/MuscleMap.tsx`)

```tsx
function MuscleMap({ primary, secondary }: { primary: string[]; secondary: string[] }) {
  const { data, hasFullBody } = buildBodyData(primary, secondary);
  const colors = [colors.accent, "<coral suave>"]; // [0]=primary fuerte, [1]=secondary
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        <Body data={data} side="front" colors={colors} defaultFill={<gris>} scale={...} border="none" />
        <Body data={data} side="back"  colors={colors} defaultFill={<gris>} scale={...} border="none" />
      </View>
      {hasFullBody && <Text>Cuerpo completo</Text>}
      {/* leyenda: ● Primarios  ● Secundarios */}
    </View>
  );
}
```

- `intensity 1` → `colors[0]` (primary, acento coral); `intensity 2` → `colors[1]` (secondary, coral
  suave); no incluidos → `defaultFill` gris (untargeted).
- Mismo `data` para front y back; la lib pinta en cada lado los slugs que corresponden.
- Leyenda chica (Primarios / Secundarios) + chip "Cuerpo completo" si `hasFullBody`.
- testID `muscle-map`.

## 5. Integración en `SessionSummary`

Reemplazar la sección actual "por músculo" (la lista `perMuscle`) por
`<MuscleMap primary={summary.primaryMuscles} secondary={summary.secondaryMuscles} />`.

## 6. Testing

- **`muscleMap.test.ts`** (jest, TDD): `buildBodyData` — primary → intensity 1; secondary → 2;
  músculo en ambos → 1 (primary gana); `back` → 3 slugs; `full_body` → no entra a data pero
  `hasFullBody=true`; vacío → `{data:[], hasFullBody:false}`.
- **`summary.test.ts`**: los nuevos `primaryMuscles`/`secondaryMuscles` (distintos, de series hechas).
- **`session-summary.test.tsx`**: mockear `react-native-body-highlighter` (default export `Body`) para
  no cargar SVG nativo; verificar que se renderiza `muscle-map`.

## 7. Fuera de alcance
- Músculos interactivos (tap en un músculo → detalle). `onBodyPartPress` existe pero no v1.
- Género femenino / selección de modelo (default male).
