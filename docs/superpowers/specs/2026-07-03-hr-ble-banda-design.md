# Sub-proyecto B — HR en vivo por banda BLE — Diseño

> Fecha: 2026-07-03. Estado: aprobado, pendiente de plan de implementación.
> Sub-proyecto **B** de la visión "hacer todo desde el teléfono". Depende del sub-proyecto **A**
> (registro de entrenamiento, ya en `main`), que dejó reservados los campos `hrAvg`/`hrMax` por
> serie en todo el stack (shared → backend → DB → storage → sync).

## 0. Objetivo en una línea

Capturar la **frecuencia cardíaca en vivo** desde una banda BLE (Polar / Garmin) durante la sesión
de entrenamiento, mostrarla en la pantalla de sesión, y poblar `hrAvg`/`hrMax` **por serie** al
cerrarla. Todo el cambio es **mobile-only**: backend, DB y sync ya soportan estos campos.

## 1. Contexto y punto de partida

El sub-proyecto A dejó todo el pipeline de datos listo:

- **Schema** (`shared/src/schemas/session.ts`): `SetLogSchema` tiene `hrAvg: number | null` y
  `hrMax: number | null` (int, `min(0)`, nullable, default `null`).
- **DB** (`backend/src/db/schema.ts`): tabla `set_log` con columnas `hr_avg`/`hr_max` (int, nullable).
- **Backend** (`backend/src/routes/sessions.ts`, `sessions/repository.ts`): valida contra
  `WorkoutSessionSchema`, mapea y persiste HR si viene en el payload.
- **Mobile storage/sync** (`storage/activeSession.ts`, `storage/pendingSessions.ts`,
  `sync/syncSessions.ts`, `api/sessions.ts`): la sesión completa (con HR) viaja automáticamente vía
  `putSession` → `PUT /sessions/:id`.
- **UI** (`mobile/app/sesion.tsx:193-196`): box `♥ HR` que hoy muestra un placeholder `—`.

Lo que **falta** y aporta este sub-proyecto: capturar el HR por BLE, mostrarlo en vivo y poblar
`hrAvg`/`hrMax` al cerrar la serie.

## 2. Decisiones de diseño (tomadas en brainstorming)

- **Granularidad (P1):** solo **agregados por serie** (`hrAvg`/`hrMax`). Sin cambio de schema, sin
  migración. La serie temporal completa (curva de HR) queda en **backlog**.
- **Protocolo BLE (P2):** **perfil estándar Heart Rate Service** (`0x180D`, característica
  `0x2A37`). Funciona con cualquier banda seria (Polar H10/H9, Garmin HRM, etc.). El PMD propietario
  de Polar (RR / HRV) queda en **backlog** para el dominio de estrés.
- **UX de conexión (P3):** **emparejar una vez en Configuración** + **auto-conectar en la sesión**
  (opción C). Se guarda el `deviceId` de la banda emparejada.
- **Fallo/degradación (P4):** **best-effort** (opción A). Si hubo alguna lectura en la ventana de la
  serie, se guardan avg/max de lo capturado; si no hubo ninguna, `hrAvg`/`hrMax` quedan `null`. La
  sesión **nunca** se traba por BLE. Sin marca de calidad del dato (queda en backlog).

## 3. Arquitectura (Approach 1 — capa BLE aislada + funciones puras + hook)

Todo nuevo bajo `mobile/`:

```
mobile/src/ble/
  hrParser.ts        # PURO: decodeHrMeasurement(bytes) → number (bpm)
  hrAggregate.ts     # PURO: aggregateHr(samples) → { hrAvg, hrMax }  (null si vacío)
  bandManager.ts     # NATIVO fino: wrapper de react-native-ble-plx (scan/connect/subscribe/dispose)
  useHeartRate.ts    # HOOK: orquesta el manager; expone { status, bpm, connect, disconnect, samples }
mobile/src/storage/
  pairedBand.ts      # { deviceId, name } de la banda emparejada (AsyncStorage)
```

Principio de aislamiento: la lógica que importa (decodificar el frame BLE y agregar) es **pura y
TDD-able**; el código nativo (intesteable en jest) queda mínimo, detrás de una interfaz chica y
mockeable.

### 3.1 Piezas puras (TDD con jest)

- **`hrParser.decodeHrMeasurement(bytes: Uint8Array): number`** — decodifica la característica
  `0x2A37`: el primer byte es un flag; bit 0 indica formato del valor de HR (uint8 si 0, uint16 LE
  si 1). Devuelve el BPM. Ignora (por ahora) sensor-contact, energy expended y RR intervals.
- **`hrAggregate.aggregateHr(samples: { t: number; bpm: number }[]): { hrAvg: number | null; hrMax: number | null }`**
  — `hrAvg` = promedio redondeado a int; `hrMax` = máximo; `[]` → `{ hrAvg: null, hrMax: null }`.

### 3.2 Capa nativa + hook

- **`bandManager`** envuelve `react-native-ble-plx` detrás de una interfaz chica:
  `scan(onDevice)`, `connect(deviceId)`, `onSample(cb)`, `disconnect()`, `dispose()`. Filtra por
  servicio `0x180D`. Usa `hrParser` para convertir cada frame en bpm.
- **`useHeartRate`** es el único glue entre nativo y React. Al montar: lee `pairedBand` y
  auto-conecta. Expone:
  - `status`: `'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'no-band'`
  - `bpm`: último valor en vivo (o `null`)
  - `samples`: buffer `{ t, bpm }[]` acumulado (para agregar por serie)
  - `connect()`, `disconnect()`, `reconnect()`

## 4. Flujo de datos

**Conexión (opción C):**
1. En **Configuración** (`mobile/app/configuracion.tsx`), sección "Banda de pulso": botón *Escanear*
   → lista de dispositivos que anuncian `0x180D` → tocar uno guarda `{ deviceId, name }` en
   `pairedBand.ts`. Botón *Olvidar* para desemparejar.
2. Al entrar a la **sesión**, `useHeartRate` lee la banda emparejada y **auto-conecta**. Indicador
   arriba: `buscando…` / `♥ 72` / `sin banda`.

**Captura por serie (opción A, best-effort):**
3. Mientras la serie está abierta (`startedAt → endedAt`), el hook acumula samples `{ t, bpm }`
   (~1 Hz). El `bpm` vivo alimenta el box de HR (reemplaza el `—` en `sesion.tsx:195`).
4. Al tocar **"Terminar serie"** (`onEndSet`), se toman los samples cuyo `t` cae en la ventana de la
   serie, se corre `aggregateHr()` → `{ hrAvg, hrMax }`, y se pasan a `endSet()`.
5. Si no hubo samples (banda ausente/caída), `aggregateHr([])` → `{ null, null }` → la serie queda
   como hoy. La sesión no se traba.

**Persistencia (sin cambios):** `hrAvg`/`hrMax` ya viajan por `putSession`/sync al backend.

## 5. Cambio mínimo en el motor (`mobile/src/session/engine.ts`)

`endSet` extiende su firma para aceptar HR opcional y poblar la serie cerrada:

```ts
endSet(session, { exerciseOrder, weightKg, rpe, nowMs, hrAvg = null, hrMax = null })
// en la serie que se cierra: { ...s, weightKg, rpe, endedAt, durationMs, hrAvg, hrMax }
```

Retrocompatible: si no se pasan `hrAvg`/`hrMax`, quedan `null` (comportamiento actual). Se cubre con
test.

## 6. UI

**Configuración (`mobile/app/configuracion.tsx`):** sección nueva "Banda de pulso":
- Estado: *Ninguna* / *&lt;nombre&gt; (emparejada)*.
- Botón **Escanear** → lista de dispositivos `0x180D` (nombre + señal) → tocar empareja y guarda.
- Botón **Olvidar** para desemparejar.

**Sesión (`mobile/app/sesion.tsx:193-196`):** el box `♥ HR` que hoy muestra `—`:
- `sin banda` (muted) → `buscando…` → `♥ 72` (acento coral `#D85A30` cuando hay señal viva).
- Toque en el indicador = re-conectar / re-escanear (para cambiar Polar ↔ Garmin en el momento).
- No agrega pantallas nuevas: es el hueco reservado + una sección en config.

## 7. Native, build y permisos

- **Dependencia:** `react-native-ble-plx` + su **config plugin** en `app.json` (inyecta permisos y
  `bluetooth` en el manifest Android).
- **Permisos Android 12+:** `BLUETOOTH_SCAN` (con `neverForLocation`), `BLUETOOTH_CONNECT`. El plugin
  los agrega; se pide el runtime-permission al escanear por primera vez.
- **Permisos iOS (solo si a futuro se agrega iOS; hoy la app es Android-only):**
  `NSBluetoothAlwaysUsageDescription` vía la opción `bluetoothAlwaysPermission` del config plugin de
  `react-native-ble-plx`. Inocuo en builds Android.
- **Dev build (obligatorio):** BLE no corre en Expo Go ni en el APK `preview`. Se usa el perfil
  `development` (ya en `eas.json`): `bunx eas-cli build -p android --profile development` (cuenta
  Expo `belregistro`). El flujo de dev pasa a `bunx expo start --dev-client`. Documentar en
  ONBOARDING §5.
- **Worktrees:** `bun install --force` en cada worktree nuevo antes de buildear (gotcha conocido).

## 8. Estrategia de testing (TDD)

| Pieza | Test | Cómo |
|---|---|---|
| `hrParser` | jest, TDD | payloads conocidos de `0x2A37`: flag uint8/uint16, con/sin sensor-contact, casos borde. |
| `hrAggregate` | jest, TDD | samples → avg redondeado + max; `[]` → `{ null, null }`; un solo sample. |
| `engine.endSet` con HR | jest, TDD | pasa hrAvg/hrMax → serie cerrada los tiene; sin pasarlos → `null` (retrocompat). |
| `bandManager` (nativo) | jest, mockeado | `jest.mock('react-native-ble-plx')`; se testea la orquestación, no el BLE real. |
| `useHeartRate` | jest con manager mock | transición de estados (buscando→conectada→caída), acumulación de samples. |
| Integración real (banda física) | manual en dispositivo | Polar/Garmin real sobre el dev build: conectar, ver bpm vivo, cerrar serie, verificar hrAvg/hrMax persistidos y sincronizados. |

Todo jest corre con `--runInBand` (gotcha conocido). El BLE real se verifica a mano en el dev build
(inevitable: no hay BLE en jest).

## 9. Fuera de alcance (→ backlog)

- **Curva de HR / serie temporal completa** (opción B de la P1): persistir el stream crudo
  `[{ t, bpm }]` por serie/sesión → habilita gráficos y cruces para "estado holístico". Requiere
  campo/tabla nueva + migración en shared y backend.
- **HRV / intervalos RR por PMD Polar** (opción B de la P2): materia prima del dominio de estrés
  (dominio 3 del roadmap). Alternativa: ingesta Garmin Health.
- **Marca de calidad de cobertura del dato** (opción B de la P4): registrar si la banda cubrió solo
  parte de la serie.
