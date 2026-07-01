# Diseño — Pulsia Plan B: App mobile (v1)

**Fecha:** 2026-06-30
**Estado:** En revisión

## 1. Contexto

El backend core de la Fase 1A ya está en `main`: genera programas gym+casa con nombres
compatibles con Garmin a partir de un perfil, con BYO API key encriptada. Este documento diseña
la **app mobile** que consume ese backend (Plan B del proyecto Pulsia).

Decisiones ya tomadas en el brainstorming:
- **Plataforma/stack:** React Native + Expo + TypeScript.
- **Home:** el programa actual (viewer). Tabs: **Programa** · **Perfil**; engranaje → **Configuración**.
- **Estilo visual:** dirección "C" (energético): acento **coral**, denso, reps en píldoras,
  títulos grandes. Vibe de app de gimnasio.
- **Detalle de ejercicio:** tocar un ejercicio abre su detalle con **demostración visual
  (imágenes open-source)**, músculos (primario/secundarios), equipamiento, equivalente Garmin,
  la prescripción de la sesión, y la nota/cue de la IA.

## 2. Alcance v1

Pantallas:
1. **Onboarding / Perfil** — formulario del perfil de entrenamiento.
2. **Configuración** — URL del backend, API key de IA, modelo.
3. **Programa (home)** — viewer del programa generado (semanas → días → ejercicios), con toggle
   Gimnasio/Casa; estado vacío si no hay programa (→ generar).
4. **Espera de generación** — pantalla de carga con mensajes rotativos (la generación tarda ~50s).
5. **Detalle de ejercicio** — demo, músculos, equipamiento, prescripción, nota.

Fuera de alcance v1 (fases posteriores): registro de logs editable, import .FIT, dashboard de
gráficos, ajuste conversacional, generación async/streaming, perfil multi-dispositivo server-side.

## 3. Arquitectura

```text
┌───────────────────────────────┐         ┌──────────────────────────────┐
│  App mobile (Expo / RN / TS)  │  HTTP   │  Backend (Bun + Hono) en Pi   │
│  - expo-router (tabs + stack) │ ──────▶ │  - POST /programs/generate    │
│  - TanStack Query (server)    │         │  - GET  /programs/latest,/:id │  (nuevos)
│  - AsyncStorage (URL, perfil) │ ◀────── │  - GET  /catalog (enriquecido)│  (nuevo)
│  - @pulsia/shared (tipos Zod) │         │  - POST/GET /settings         │
└───────────────────────────────┘         │  - Postgres + Drizzle          │
                                           └──────────────────────────────┘
```

- **Navegación:** expo-router. Tab bar: `Programa`, `Perfil`. Stack para `Detalle de ejercicio`
  y `Configuración` (accesible por el engranaje del header).
- **Datos del servidor:** TanStack Query (hooks: `useCatalog`, `useLatestProgram`,
  `useGenerateProgram`, `useSettings`). Cache + estados de carga/error listos.
- **Estado local persistido (AsyncStorage):**
  - `backendUrl` — la URL del backend (VPN de casa ahora; Tailscale a futuro). **Configurable**,
    sin hardcodear.
  - `profile` — el perfil de entrenamiento del usuario (se edita local y se manda en `generate`).
- **Tipos compartidos:** la app importa `@pulsia/shared` (workspace) → `TrainingProfile`,
  `Program`, `Workout`, etc. Mismos tipos y validación que el backend.
- **API key:** se ingresa en Configuración y se envía a `POST /settings` (se guarda encriptada en
  el backend). **Nunca** se persiste en el cliente.
- **Cliente HTTP:** wrapper `fetch` que usa `backendUrl` + valida respuestas con los schemas Zod
  de `@pulsia/shared`.

## 4. Adiciones al backend (parte de este plan)

Hoy el backend solo expone `POST /programs/generate` y `/settings`. La app necesita:

1. **`GET /programs/latest`** — devuelve el último `Program` del usuario (o 404 si no hay).
   **`GET /programs/:id`** — un programa por id. (Lee de la tabla `programs` ya existente.)
2. **`GET /catalog`** — catálogo enriquecido: `id`, `garminName`, `displayName`,
   `primaryMuscles`, `secondaryMuscles`, `equipment`, e `imageUrls` (0..n). La app lo cachea y el
   detalle de ejercicio resuelve por `catalogId`.
3. **Enriquecimiento con imágenes (open-source):** un paso offline (script) que matchea cada
   ejercicio del catálogo Garmin contra **free-exercise-db** (Unlicense, ~870 ejercicios con
   imágenes) por nombre normalizado; guarda `imageUrls` en el catálogo (campo nuevo opcional en
   `CatalogExercise` + columna en `exercise_catalog`). Cobertura parcial → fallback claro cuando
   no hay match. Las imágenes se referencian por URL (raw del dataset / CDN), no se hostean.

> El perfil se mantiene **client-side** en v1 (AsyncStorage) y se envía en `generate`; endpoints
> de perfil server-side quedan para una fase futura (multi-dispositivo).

## 5. Pantallas (detalle)

### 5.1 Onboarding / Perfil
Formulario mapeado a `TrainingProfileSchema`:
- experiencia (beginner/intermediate/advanced), objetivo (hipertrofia/fuerza/resistencia/
  pérdida de grasa/fitness general), días por semana (1–7), minutos por sesión (15–180),
  equipamiento gimnasio[] y casa[] (chips multi-selección del enum `Equipment`), limitaciones
  (texto libre, lista). Validación con el schema Zod antes de guardar. Guardar → persiste local +
  habilita "Generar programa".

### 5.2 Configuración
- `backendUrl` (input, con test de conexión a `GET /health`), API key de IA (input seguro →
  `POST /settings`), modelo (default `claude-sonnet-4-6`). Indicador `hasApiKey` desde
  `GET /settings`.

### 5.3 Programa (home)
- Si no hay programa → estado vacío: "Generá tu primer programa" + botón.
- Con programa: selector de semana, toggle **Gimnasio/Casa**, lista de días; cada día muestra sus
  ejercicios (nombre + series×reps + carga). Botón "Copiar a Garmin" (copia los nombres del día).
- Tocar un ejercicio → Detalle.

### 5.4 Espera de generación
- Tras "Generar", pantalla de carga dedicada con mensajes rotativos (~50s): "Analizando tu
  perfil…", "Eligiendo ejercicios…", "Armando la progresión…". Maneja error (sin key → lleva a
  Configuración; error de IA → reintentar).

### 5.5 Detalle de ejercicio
- Demo (imágenes open-source con fallback ícono si no hay match), músculos (primario coral,
  secundarios outline), equipamiento, equivalente Garmin, prescripción de la sesión
  (series/reps/RPE/descanso), nota/cue. Datos de músculos/equipamiento desde `GET /catalog`.

## 6. Estructura de archivos (app)

```text
mobile/
├── app/                      # expo-router
│   ├── _layout.tsx           # stack raíz + provider de TanStack Query
│   ├── (tabs)/
│   │   ├── _layout.tsx       # tab bar (Programa, Perfil)
│   │   ├── index.tsx         # Programa (home / viewer)
│   │   └── perfil.tsx        # Perfil / onboarding
│   ├── ejercicio/[id].tsx    # Detalle de ejercicio
│   ├── configuracion.tsx     # Configuración
│   └── generando.tsx         # Espera de generación
├── src/
│   ├── api/                  # cliente fetch + hooks de TanStack Query
│   │   ├── client.ts         # fetch wrapper (usa backendUrl), validación Zod
│   │   ├── programs.ts       # useLatestProgram, useGenerateProgram
│   │   ├── catalog.ts        # useCatalog
│   │   └── settings.ts       # useSettings, useSaveSettings
│   ├── storage/              # AsyncStorage (backendUrl, profile)
│   ├── theme/                # tokens estilo "C" (coral) + componentes base
│   └── components/           # ExerciseRow, WeekSelector, GymHomeToggle, etc.
└── package.json              # @pulsia/mobile (workspace)
```

## 7. Manejo de errores
- Sin `backendUrl` configurada o backend inalcanzable → pantalla/empty state que lleva a
  Configuración, con test de conexión.
- Generación sin API key (400) → redirige a Configuración con mensaje claro.
- Error de IA (502) / timeout → estado de error con reintento.
- Imagen de ejercicio sin match → fallback (ícono + datos de músculos/equipamiento igual).
- Validación Zod de las respuestas del backend → error controlado, no crashea la UI.
- **Request de generación larga (~50s):** el cliente usa un timeout amplio (ej. `AbortController`
  con ≥120s) para no cortar la espera; si el backend está detrás de un reverse proxy, subir su
  read/idle timeout en consecuencia. (Se resuelve de raíz cuando la generación pase a async.)

## 8. Testing
- **Componentes** (React Native Testing Library): formulario de perfil (validación), viewer
  (render de semanas/días, toggle gym/casa), detalle (con y sin imagen), estados vacío/carga/error.
- **Hooks de API:** con fetch mockeado (generate, latest, catalog, settings).
- **Backend nuevo:** tests de `GET /programs/latest|:id`, `GET /catalog`, y del matcheo de
  imágenes (unit, con dataset de ejemplo).

## 9. Fases de implementación (dentro de la v1 mobile)
1. **Fase 1 — Esqueleto + Configuración:** Expo + expo-router + tabs, AsyncStorage, pantalla de
   Configuración (URL + API key + test de conexión). App que conecta al backend.
2. **Fase 2 — Perfil + Generación:** formulario de perfil, `POST /programs/generate`, pantalla de
   espera. Genera y guarda un programa.
3. **Fase 3 — Viewer:** `GET /programs/latest|:id`, home con semanas/días, toggle gym/casa,
   copiar a Garmin.
4. **Fase 4 — Detalle + imágenes:** `GET /catalog` enriquecido + enriquecimiento con
   free-exercise-db; pantalla de detalle de ejercicio.

## 10. Notas / decisiones diferidas
- La generación es **síncrona (~50s)**; para mejorar UX conviene **async/streaming** en una fase
  futura (no bloquear). v1 usa pantalla de espera con mensajes rotativos.
- El **número de semanas** del programa hoy es fijo (2, definido en el prompt del backend);
  hacerlo configurable desde el perfil queda para más adelante.
- Perfil server-side (multi-dispositivo) y auth real: fases futuras.
