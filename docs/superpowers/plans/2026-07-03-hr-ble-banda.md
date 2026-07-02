# HR en vivo por banda BLE — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar frecuencia cardíaca en vivo desde una banda BLE (perfil estándar `0x180D`), mostrarla en la pantalla de sesión y poblar `hrAvg`/`hrMax` por serie al cerrarla. Todo mobile-only.

**Architecture:** Capa BLE aislada (Approach 1): funciones puras (`hrParser`, `hrAggregate`) TDD-ables sin nativo; wrapper nativo fino (`bandManager`) sobre `react-native-ble-plx`, mockeado en jest; hook `useHeartRate` de orquestación; storage de banda emparejada; UI de emparejado en Configuración + cableado en Sesión. Backend/DB/sync ya soportan los campos HR (sub-proyecto A) — no se tocan.

**Tech Stack:** Expo SDK 57, React Native 0.86, `react-native-ble-plx`, `base64-js`, TypeScript, jest (`jest-expo`, `--runInBand`), `@testing-library/react-native` 14.

**Spec:** `docs/superpowers/specs/2026-07-03-hr-ble-banda-design.md`

---

## Estructura de archivos

Nuevos (todos en `mobile/`):
- `src/ble/hrParser.ts` — PURO: `decodeHrMeasurement(bytes) → bpm`.
- `src/ble/hrAggregate.ts` — PURO: `aggregateHr(samples) → {hrAvg, hrMax}` + tipo `HrSample`.
- `src/ble/bandManager.ts` — NATIVO fino: wrapper de `react-native-ble-plx`.
- `src/ble/useHeartRate.ts` — HOOK: orquesta el manager.
- `src/storage/pairedBand.ts` — storage de la banda emparejada.

Modificados:
- `src/session/engine.ts:57-66` — `endSet` acepta `hrAvg`/`hrMax` opcionales.
- `app/configuracion.tsx` — sección "Banda de pulso".
- `app/sesion.tsx` — HR en vivo + agregación por serie.
- `app.json` — plugin y permisos BLE.
- `package.json` — deps `react-native-ble-plx`, `base64-js`.

## Estrategia de ramas / PRs

Tres PRs secuenciales (cada uno se mergea con el protocolo CodeRabbit antes de arrancar el siguiente, porque dependen en cadena):

- **PR A** `feat/hr-ble-core` — Tasks 1-3 (puro + engine; sin deps nativas).
- **PR B** `feat/hr-ble-native` — Tasks 4-7 (deps + config + storage + manager + hook).
- **PR C** `feat/hr-ble-ui` — Tasks 8-10 (UI config + sesión + docs).

Verificación real con banda física = **Task 11 (manual, requiere dispositivo del usuario)**.

Todos los tests se corren desde `mobile/` con `npm test -- --runInBand <patrón>`. Recordar `bun install --force` si se ejecuta en un worktree nuevo.

---

## PR A — `feat/hr-ble-core`

### Task 1: Parser de la característica HR (`0x2A37`)

**Files:**
- Create: `mobile/src/ble/hrParser.ts`
- Test: `mobile/__tests__/hr-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/hr-parser.test.ts
import { decodeHrMeasurement } from "../src/ble/hrParser";

test("formato uint8 (flag bit0=0): lee el segundo byte", () => {
  expect(decodeHrMeasurement(new Uint8Array([0x00, 72]))).toBe(72);
});

test("flags de sensor-contact activos pero uint8: sigue leyendo bpm", () => {
  // flags 0b110 = sensor contact soportado+detectado, bit0=0 → uint8
  expect(decodeHrMeasurement(new Uint8Array([0x06, 65]))).toBe(65);
});

test("formato uint16 (flag bit0=1): little-endian sobre 2 bytes", () => {
  // 0x012C = 300 bpm (irreal, pero valida el decode de 16 bits)
  expect(decodeHrMeasurement(new Uint8Array([0x01, 0x2c, 0x01]))).toBe(300);
});

test("payload demasiado corto lanza error", () => {
  expect(() => decodeHrMeasurement(new Uint8Array([0x00]))).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand hr-parser`
Expected: FAIL — "Cannot find module '../src/ble/hrParser'".

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/ble/hrParser.ts
// Decodifica la característica Heart Rate Measurement (GATT 0x2A37).
// Byte 0 = flags; bit 0 indica el formato del valor de HR (0 → uint8, 1 → uint16 LE).
export function decodeHrMeasurement(bytes: Uint8Array): number {
  if (bytes.length < 2) throw new Error("HR measurement demasiado corto");
  const flags = bytes[0];
  const is16 = (flags & 0x01) === 0x01;
  if (is16) {
    if (bytes.length < 3) throw new Error("HR uint16 sin segundo byte");
    return bytes[1] | (bytes[2] << 8);
  }
  return bytes[1];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand hr-parser`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/ble/hrParser.ts mobile/__tests__/hr-parser.test.ts
git commit -S -m "feat(mobile): parser de la característica BLE Heart Rate (0x2A37)"
```

### Task 2: Agregación de HR por serie

**Files:**
- Create: `mobile/src/ble/hrAggregate.ts`
- Test: `mobile/__tests__/hr-aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/hr-aggregate.test.ts
import { aggregateHr } from "../src/ble/hrAggregate";

test("sin samples devuelve null/null", () => {
  expect(aggregateHr([])).toEqual({ hrAvg: null, hrMax: null });
});

test("un solo sample: avg y max iguales", () => {
  expect(aggregateHr([{ t: 0, bpm: 70 }])).toEqual({ hrAvg: 70, hrMax: 70 });
});

test("varios samples: avg redondeado y max", () => {
  expect(aggregateHr([
    { t: 0, bpm: 70 },
    { t: 1, bpm: 80 },
    { t: 2, bpm: 75 },
  ])).toEqual({ hrAvg: 75, hrMax: 80 });
});

test("el avg se redondea a entero (half-up)", () => {
  // (70 + 71) / 2 = 70.5 → 71
  expect(aggregateHr([{ t: 0, bpm: 70 }, { t: 1, bpm: 71 }]).hrAvg).toBe(71);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand hr-aggregate`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/ble/hrAggregate.ts
export interface HrSample {
  t: number; // epoch ms de la lectura
  bpm: number;
}

// Agregados por serie (best-effort): promedio redondeado y pico.
// Sin samples → null/null (banda ausente o caída durante toda la serie).
export function aggregateHr(samples: HrSample[]): { hrAvg: number | null; hrMax: number | null } {
  if (samples.length === 0) return { hrAvg: null, hrMax: null };
  let sum = 0;
  let max = 0;
  for (const s of samples) {
    sum += s.bpm;
    if (s.bpm > max) max = s.bpm;
  }
  return { hrAvg: Math.round(sum / samples.length), hrMax: max };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand hr-aggregate`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/ble/hrAggregate.ts mobile/__tests__/hr-aggregate.test.ts
git commit -S -m "feat(mobile): agregación de HR por serie (avg/max, best-effort)"
```

### Task 3: `endSet` puebla `hrAvg`/`hrMax`

**Files:**
- Modify: `mobile/src/session/engine.ts:57-66`
- Test: `mobile/__tests__/session-engine.test.ts` (agregar test)

- [ ] **Step 1: Write the failing test** (agregar al final de `session-engine.test.ts`)

```ts
test("endSet puebla hrAvg/hrMax cuando se pasan", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000, hrAvg: 128, hrMax: 141 });
  const set = s.exercises[0].sets[0];
  expect(set.hrAvg).toBe(128);
  expect(set.hrMax).toBe(141);
});

test("endSet sin HR deja hrAvg/hrMax en null (retrocompat)", () => {
  let s = start();
  s = tapRep(s, { exerciseOrder: 0, setStartMs: 2000, nowMs: 2000 });
  s = endSet(s, { exerciseOrder: 0, weightKg: 40, rpe: 8, nowMs: 5000 });
  const set = s.exercises[0].sets[0];
  expect(set.hrAvg).toBeNull();
  expect(set.hrMax).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand session-engine`
Expected: FAIL — el nuevo test "puebla hrAvg/hrMax" falla (hoy `endSet` no acepta esos args; `set.hrAvg` queda null).

- [ ] **Step 3: Write minimal implementation** — reemplazar `endSet` (`engine.ts:57-66`)

```ts
export function endSet(session: WorkoutSession, args: { exerciseOrder: number; weightKg: number | null; rpe: number | null; nowMs: number; hrAvg?: number | null; hrMax?: number | null }): WorkoutSession {
  return updateExercise(session, args.exerciseOrder, (ex) => {
    const openIdx = ex.sets.findIndex((s) => s.endedAt == null);
    if (openIdx < 0) return ex;
    const sets = ex.sets.map((s, i) =>
      i === openIdx
        ? { ...s, weightKg: args.weightKg, rpe: args.rpe, endedAt: args.nowMs, durationMs: args.nowMs - s.startedAt, hrAvg: args.hrAvg ?? null, hrMax: args.hrMax ?? null }
        : s,
    );
    return { ...ex, sets };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand session-engine`
Expected: PASS (todos, incluidos los 2 nuevos y el existente "endSet cierra la serie con peso/rpe").

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/engine.ts mobile/__tests__/session-engine.test.ts
git commit -S -m "feat(mobile): endSet puebla hrAvg/hrMax por serie (opcional, retrocompat)"
```

### Task A-final: abrir PR A

- [ ] **Step 1: Correr toda la suite mobile**

Run: `npm test -- --runInBand`
Expected: PASS (suite completa, sin regresiones).

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/hr-ble-core
gh pr create --title "feat(mobile): núcleo HR BLE (parser + agregación + endSet)" \
  --body "Sub-proyecto B, PR 1/3. Funciones puras hrParser/hrAggregate y endSet con hrAvg/hrMax por serie. Sin deps nativas. Ver spec 2026-07-03-hr-ble-banda-design.md."
```

- [ ] **Step 3:** Seguir el protocolo de auto-merge (review REAL de CodeRabbit + sin threads → squash). Si no llega review por rate-limit, comentar `@coderabbitai review`.

---

## PR B — `feat/hr-ble-native`

> Rama nueva desde `main` actualizado tras mergear PR A.

### Task 4: Instalar deps BLE y configurar permisos Android

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`

- [ ] **Step 1: Instalar dependencias** (desde `mobile/`)

```bash
bunx expo install react-native-ble-plx
bun add base64-js
```

`base64-js` ya trae sus propios tipos (`index.d.ts`) — no hace falta `@types/base64-js`.

- [ ] **Step 2: Agregar el config plugin en `app.json`** — dentro de `expo.plugins`, agregar como nuevo elemento del array (después del bloque de `expo-build-properties`):

```json
[
  "react-native-ble-plx",
  {
    "isBackgroundEnabled": false,
    "neverForLocation": true,
    "bluetoothAlwaysPermission": "Pulsia usa Bluetooth para conectarse a tu banda de pulso"
  }
]
```

El plugin inyecta en el manifest Android los permisos `BLUETOOTH_SCAN` (con `neverForLocation`) y `BLUETOOTH_CONNECT`. La opción `bluetoothAlwaysPermission` agrega `NSBluetoothAlwaysUsageDescription` en iOS (inocuo en builds Android; hoy la app es Android-only).

- [ ] **Step 3: Verificar que la suite sigue verde** (los tests no cargan ble-plx real porque se mockea)

Run: `npm test -- --runInBand`
Expected: PASS (sin cambios de comportamiento; solo se agregaron deps).

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/app.json mobile/bun.lock
git commit -S -m "chore(mobile): agregar react-native-ble-plx + base64-js y permisos BLE Android"
```

### Task 5: Storage de la banda emparejada

**Files:**
- Create: `mobile/src/storage/pairedBand.ts`
- Test: `mobile/__tests__/paired-band-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/paired-band-storage.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPairedBand, setPairedBand, clearPairedBand } from "../src/storage/pairedBand";

beforeEach(async () => { await AsyncStorage.clear(); });

test("set/get/clear de la banda emparejada", async () => {
  expect(await getPairedBand()).toBeNull();
  await setPairedBand({ deviceId: "AA:BB:CC", name: "Polar H10" });
  expect(await getPairedBand()).toEqual({ deviceId: "AA:BB:CC", name: "Polar H10" });
  await clearPairedBand();
  expect(await getPairedBand()).toBeNull();
});

test("getPairedBand devuelve null si el guardado es inválido", async () => {
  await AsyncStorage.setItem("pulsia.pairedBand", "{ not json");
  expect(await getPairedBand()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand paired-band-storage`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/storage/pairedBand.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "pulsia.pairedBand";

export interface PairedBand {
  deviceId: string;
  name: string;
}

export async function getPairedBand(): Promise<PairedBand | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.deviceId === "string" && typeof p.name === "string") return p;
    return null;
  } catch {
    return null;
  }
}

export async function setPairedBand(band: PairedBand): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(band));
}

export async function clearPairedBand(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand paired-band-storage`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/storage/pairedBand.ts mobile/__tests__/paired-band-storage.test.ts
git commit -S -m "feat(mobile): storage de la banda BLE emparejada"
```

### Task 6: Wrapper nativo `bandManager`

**Files:**
- Create: `mobile/src/ble/bandManager.ts`
- Test: `mobile/__tests__/band-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/__tests__/band-manager.test.ts
// Mock del módulo nativo: nunca se carga react-native-ble-plx real.
const device = {
  id: "AA:BB:CC",
  name: "Polar H10",
  localName: null as string | null,
  discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
  monitorCharacteristicForService: jest.fn(),
};
const manager = {
  startDeviceScan: jest.fn(),
  stopDeviceScan: jest.fn(),
  connectToDevice: jest.fn().mockResolvedValue(device),
  cancelDeviceConnection: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
};
jest.mock("react-native-ble-plx", () => ({ BleManager: jest.fn(() => manager) }));

import { createBandManager } from "../src/ble/bandManager";

beforeEach(() => { jest.clearAllMocks(); });

test("scan reenvía los dispositivos encontrados con id y nombre", () => {
  const bm = createBandManager();
  const found: any[] = [];
  bm.scan((d) => found.push(d));
  // el manager real invocaría este callback por cada dispositivo:
  const scanCb = manager.startDeviceScan.mock.calls[0][2];
  scanCb(null, device);
  expect(found).toEqual([{ id: "AA:BB:CC", name: "Polar H10" }]);
});

test("connect decodifica el frame de HR y lo entrega por onSample", async () => {
  const bm = createBandManager();
  const samples: number[] = [];
  await bm.connect("AA:BB:CC", (bpm) => samples.push(bpm));
  expect(device.discoverAllServicesAndCharacteristics).toHaveBeenCalled();
  // el monitor entrega la característica en base64 ("AEg=" = [0x00, 72] → 72 bpm)
  const monitorCb = device.monitorCharacteristicForService.mock.calls[0][2];
  monitorCb(null, { value: "AEg=" });
  expect(samples).toEqual([72]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand band-manager`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/ble/bandManager.ts
import { BleManager, type Device } from "react-native-ble-plx";
import { toByteArray } from "base64-js";
import { decodeHrMeasurement } from "./hrParser";

// UUIDs del perfil estándar Heart Rate (servicio 0x180D, característica 0x2A37).
const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_CHAR = "00002a37-0000-1000-8000-00805f9b34fb";

export interface FoundDevice {
  id: string;
  name: string;
}

export function createBandManager() {
  const manager = new BleManager();
  let connected: Device | null = null;

  return {
    scan(onDevice: (d: FoundDevice) => void): void {
      manager.startDeviceScan([HR_SERVICE], null, (error, device) => {
        if (error || !device) return;
        onDevice({ id: device.id, name: device.name ?? device.localName ?? "Banda" });
      });
    },
    stopScan(): void {
      manager.stopDeviceScan();
    },
    async connect(deviceId: string, onSample: (bpm: number) => void): Promise<void> {
      manager.stopDeviceScan();
      const device = await manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      connected = device;
      device.monitorCharacteristicForService(HR_SERVICE, HR_CHAR, (error, char) => {
        if (error || !char?.value) return;
        try {
          onSample(decodeHrMeasurement(toByteArray(char.value)));
        } catch {
          // frame BLE inválido: se ignora, la sesión sigue.
        }
      });
    },
    async disconnect(): Promise<void> {
      if (connected) {
        await manager.cancelDeviceConnection(connected.id);
        connected = null;
      }
    },
    destroy(): void {
      manager.destroy();
    },
  };
}

export type BandManagerHandle = ReturnType<typeof createBandManager>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand band-manager`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/ble/bandManager.ts mobile/__tests__/band-manager.test.ts
git commit -S -m "feat(mobile): bandManager (wrapper ble-plx, scan/connect/HR monitor)"
```

### Task 7: Hook `useHeartRate`

**Files:**
- Create: `mobile/src/ble/useHeartRate.ts`
- Test: `mobile/__tests__/use-heart-rate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/use-heart-rate.test.tsx
import { renderHook, act, waitFor } from "@testing-library/react-native";

let mockBand: any = { deviceId: "AA:BB:CC", name: "Polar H10" };
jest.mock("../src/storage/pairedBand", () => ({
  getPairedBand: async () => mockBand,
}));

// bandManager mockeado: connect entrega un sample fijo de 88 bpm.
const fakeManager = {
  connect: jest.fn(async (_id: string, onSample: (b: number) => void) => { onSample(88); }),
  disconnect: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
  scan: jest.fn(),
  stopScan: jest.fn(),
};
jest.mock("../src/ble/bandManager", () => ({
  createBandManager: () => fakeManager,
}));

import { useHeartRate } from "../src/ble/useHeartRate";

beforeEach(() => { mockBand = { deviceId: "AA:BB:CC", name: "Polar H10" }; jest.clearAllMocks(); });

test("sin banda emparejada: status 'no-band'", async () => {
  mockBand = null;
  const { result } = renderHook(() => useHeartRate());
  await act(async () => { await result.current.connect(); });
  expect(result.current.status).toBe("no-band");
});

test("con banda: conecta, recibe bpm y acumula sample", async () => {
  const { result } = renderHook(() => useHeartRate());
  await act(async () => { await result.current.connect(); });
  await waitFor(() => expect(result.current.status).toBe("connected"));
  expect(result.current.bpm).toBe(88);
  expect(result.current.getSamples().map((s) => s.bpm)).toEqual([88]);
});

test("resetSamples vacía el buffer de la serie", async () => {
  const { result } = renderHook(() => useHeartRate());
  await act(async () => { await result.current.connect(); });
  act(() => result.current.resetSamples());
  expect(result.current.getSamples()).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand use-heart-rate`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/ble/useHeartRate.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { createBandManager, type BandManagerHandle } from "./bandManager";
import { getPairedBand } from "../storage/pairedBand";
import type { HrSample } from "./hrAggregate";

export type HrStatus = "idle" | "no-band" | "connecting" | "connected" | "disconnected";

export function useHeartRate(nowFn: () => number = Date.now) {
  const [status, setStatus] = useState<HrStatus>("idle");
  const [bpm, setBpm] = useState<number | null>(null);
  const managerRef = useRef<BandManagerHandle | null>(null);
  const samplesRef = useRef<HrSample[]>([]);

  const connect = useCallback(async () => {
    const band = await getPairedBand();
    if (!band) {
      setStatus("no-band");
      return;
    }
    if (!managerRef.current) managerRef.current = createBandManager();
    setStatus("connecting");
    try {
      await managerRef.current.connect(band.deviceId, (b) => {
        samplesRef.current.push({ t: nowFn(), bpm: b });
        setBpm(b);
        setStatus("connected");
      });
    } catch {
      setStatus("disconnected");
    }
  }, [nowFn]);

  const disconnect = useCallback(async () => {
    await managerRef.current?.disconnect();
    setStatus("disconnected");
    setBpm(null);
  }, []);

  const getSamples = useCallback(() => samplesRef.current, []);
  const resetSamples = useCallback(() => {
    samplesRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, []);

  return { status, bpm, connect, disconnect, reconnect: connect, getSamples, resetSamples };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand use-heart-rate`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/ble/useHeartRate.ts mobile/__tests__/use-heart-rate.test.tsx
git commit -S -m "feat(mobile): hook useHeartRate (orquesta bandManager + buffer por serie)"
```

### Task B-final: abrir PR B

- [ ] **Step 1: Suite completa**

Run: `npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/hr-ble-native
gh pr create --title "feat(mobile): capa BLE nativa (bandManager + useHeartRate + storage)" \
  --body "Sub-proyecto B, PR 2/3. Deps react-native-ble-plx/base64-js, permisos BLE, storage de banda emparejada, wrapper nativo y hook. Requiere dev build para BLE real (se verifica en PR 3/manual)."
```

- [ ] **Step 3:** Protocolo de auto-merge CodeRabbit.

---

## PR C — `feat/hr-ble-ui`

> Rama nueva desde `main` actualizado tras mergear PR B.

### Task 8: Sección "Banda de pulso" en Configuración

**Files:**
- Modify: `mobile/app/configuracion.tsx`
- Test: `mobile/__tests__/configuracion-banda.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/configuracion-banda.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// bandManager mockeado: scan entrega un dispositivo cuando se lo pide.
let scanCb: ((d: any) => void) | null = null;
const fakeManager = {
  scan: jest.fn((cb: (d: any) => void) => { scanCb = cb; }),
  stopScan: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  destroy: jest.fn(),
};
jest.mock("../src/ble/bandManager", () => ({ createBandManager: () => fakeManager }));

import ConfiguracionScreen from "../app/configuracion";

beforeEach(async () => { await AsyncStorage.clear(); scanCb = null; jest.clearAllMocks(); });

test("escanear, elegir una banda y verla emparejada", async () => {
  await render(<ConfiguracionScreen />);
  await waitFor(() => expect(screen.getByText("Ninguna")).toBeTruthy());

  await fireEvent.press(screen.getByText("Escanear banda"));
  // simular que el scanner encontró un dispositivo
  await waitFor(() => expect(fakeManager.scan).toHaveBeenCalled());
  scanCb!({ id: "AA:BB:CC", name: "Polar H10" });

  await waitFor(() => screen.getByTestId("band-AA:BB:CC"));
  await fireEvent.press(screen.getByTestId("band-AA:BB:CC"));

  await waitFor(async () => {
    expect(await AsyncStorage.getItem("pulsia.pairedBand")).toContain("AA:BB:CC");
  });
  expect(screen.getByText("Polar H10 (emparejada)")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand configuracion-banda`
Expected: FAIL — no existe "Escanear banda" / "Ninguna".

- [ ] **Step 3: Write implementation** — agregar a `configuracion.tsx`:

En los imports (arriba, junto a los otros):

```tsx
import { getPairedBand, setPairedBand, clearPairedBand } from "../src/storage/pairedBand";
import { createBandManager, type BandManagerHandle, type FoundDevice } from "../src/ble/bandManager";
```

En el componente, junto a los otros `useState` (después de `const [status, setStatus] = ...`):

```tsx
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [found, setFound] = useState<FoundDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const bandMgr = useRef<BandManagerHandle | null>(null);
```

`useRef` ya no está importado: agregar `useRef` al import de react (`import { useEffect, useRef, useState } from "react";`).

En el `useEffect` de montaje existente, agregar la carga de la banda (dejar el `getBackendUrl` como está y sumar):

```tsx
  useEffect(() => {
    getBackendUrl().then((u) => {
      if (u) setUrl(u);
    });
    getPairedBand().then((b) => setPairedName(b?.name ?? null));
    return () => {
      bandMgr.current?.destroy();
      bandMgr.current = null;
    };
  }, []);
```

Handlers nuevos (después de `onSaveKey`):

```tsx
  function onScanBand() {
    setFound([]);
    setScanning(true);
    if (!bandMgr.current) bandMgr.current = createBandManager();
    bandMgr.current.scan((d) => {
      setFound((prev) => (prev.some((x) => x.id === d.id) ? prev : [...prev, d]));
    });
  }

  async function onPickBand(d: FoundDevice) {
    bandMgr.current?.stopScan();
    setScanning(false);
    await setPairedBand({ deviceId: d.id, name: d.name });
    setPairedName(d.name);
    setFound([]);
  }

  async function onForgetBand() {
    await clearPairedBand();
    setPairedName(null);
  }
```

En el JSX, agregar una sección nueva antes del `{status && ...}` final:

```tsx
      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textMuted }}>Banda de pulso</Text>
        <Text style={{ color: colors.text }}>{pairedName ? `${pairedName} (emparejada)` : "Ninguna"}</Text>
        <Pressable style={button} onPress={onScanBand}>
          <Text style={{ color: "#fff" }}>Escanear banda</Text>
        </Pressable>
        {scanning && <Text style={{ color: colors.textMuted, fontSize: 12 }}>Buscando…</Text>}
        {found.map((d) => (
          <Pressable
            key={d.id}
            testID={`band-${d.id}`}
            onPress={() => onPickBand(d)}
            style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.md }}
          >
            <Text style={{ color: colors.text }}>{d.name}</Text>
          </Pressable>
        ))}
        {pairedName && (
          <Pressable onPress={onForgetBand} style={{ alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Olvidar banda</Text>
          </Pressable>
        )}
      </View>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand configuracion`
Expected: PASS (el nuevo `configuracion-banda` y el existente `configuracion` de la URL).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/configuracion.tsx mobile/__tests__/configuracion-banda.test.tsx
git commit -S -m "feat(mobile): emparejar banda de pulso en Configuración"
```

### Task 9: HR en vivo y agregación por serie en Sesión

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Modify: `mobile/__tests__/sesion.test.tsx` (agregar mock de `useHeartRate` + test HR)

- [ ] **Step 1: Write the failing test**

Primero, agregar el mock de `useHeartRate` al inicio de `sesion.test.tsx` (junto a los otros `jest.mock`, antes de `import SesionScreen`):

```tsx
let mockHrSamples: { t: number; bpm: number }[] = [];
let mockBpm: number | null = null;
jest.mock("../src/ble/useHeartRate", () => ({
  useHeartRate: () => ({
    status: "connected",
    bpm: mockBpm,
    connect: jest.fn(),
    disconnect: jest.fn(),
    reconnect: jest.fn(),
    getSamples: () => mockHrSamples,
    resetSamples: jest.fn(),
  }),
}));
```

Agregar al `beforeEach` existente el reset de estas vars:

```tsx
beforeEach(() => { mockActive = null; mockProgramId = "22222222-2222-4222-8222-222222222222"; mockHrSamples = []; mockBpm = null; jest.clearAllMocks(); });
```

Y agregar dos tests nuevos al final:

```tsx
test("muestra el bpm en vivo en el box de HR", async () => {
  mockBpm = 80;
  await render(<SesionScreen />);
  await waitFor(() => expect(screen.getByTestId("hr-value").props.children).toBe(80));
});

test("al terminar la serie guarda hrAvg/hrMax agregados de los samples", async () => {
  mockHrSamples = [{ t: 1, bpm: 78 }, { t: 2, bpm: 84 }];
  await render(<SesionScreen />);
  await waitFor(() => screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("tap-rep"));
  await fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => {
    const last = mockSetActive.mock.calls.at(-1)?.[0];
    const set = last.exercises[0].sets[0];
    expect(set.hrAvg).toBe(81); // round((78+84)/2)
    expect(set.hrMax).toBe(84);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand sesion`
Expected: FAIL — `hr-value` sigue mostrando "—" (no 80) y `set.hrAvg` es null.

- [ ] **Step 3: Write implementation** — editar `sesion.tsx`:

Agregar imports (junto a los existentes):

```tsx
import { useHeartRate } from "../src/ble/useHeartRate";
import { aggregateHr } from "../src/ble/hrAggregate";
```

Dentro del componente, después de los `useState`/`useRef` existentes, instanciar el hook y auto-conectar una vez:

```tsx
  const hr = useHeartRate();
  const hrStarted = useRef(false);
  useEffect(() => {
    if (hrStarted.current) return;
    hrStarted.current = true;
    void hr.connect();
  }, [hr]);
```

Etiqueta de estado para el box (agregar como helper de módulo, arriba junto a `fmt`):

```tsx
function hrLabel(status: string): string {
  if (status === "no-band") return "sin banda";
  if (status === "connecting") return "buscando…";
  if (status === "disconnected") return "sin señal";
  return "—";
}
```

Reemplazar el box de HR (`sesion.tsx:193-196`) por:

```tsx
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>♥ HR</Text>
        <Text testID="hr-value" style={{ color: hr.bpm != null ? colors.accent : colors.textMuted, fontSize: 16 }}>
          {hr.bpm != null ? hr.bpm : hrLabel(hr.status)}
        </Text>
      </View>
```

En `onTap`, resetear el buffer al iniciar una serie nueva:

```tsx
  function onTap() {
    if (!current) return;
    if (!openSet) {
      setStartRef.current = Date.now();
      hr.resetSamples();
    }
    apply(tapRep(sess, { exerciseOrder: current.order, setStartMs: setStartRef.current, nowMs: Date.now() }));
  }
```

En `onEndSet`, agregar los HR:

```tsx
  function onEndSet() {
    if (!current) return;
    const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
    apply(
      endSet(sess, {
        exerciseOrder: current.order,
        weightKg: parseNum(weight),
        rpe: parseNum(rpe),
        nowMs: Date.now(),
        hrAvg,
        hrMax,
      }),
    );
    setWeight("");
    setRpe("");
  }
```

En `onFinish`, cuando cierra una serie abierta, pasar también los HR:

```tsx
    if (openEx) {
      const { hrAvg, hrMax } = aggregateHr(hr.getSamples());
      s = endSet(s, { exerciseOrder: openEx.order, weightKg: parseNum(weight), rpe: parseNum(rpe), nowMs: Date.now(), hrAvg, hrMax });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand sesion`
Expected: PASS (los 2 nuevos + los 7 existentes de `sesion.test.tsx`, ahora con `useHeartRate` mockeado).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): HR en vivo y hrAvg/hrMax por serie en la pantalla de sesión"
```

### Task 10: Documentar dev build y actualizar backlog

**Files:**
- Modify: `ONBOARDING.md`

- [ ] **Step 1:** En `ONBOARDING.md §5` ("Cómo correr / operar"), agregar bajo la sección de APK una nota de dev build:

```markdown
**Dev build (necesario para BLE / sub-proyecto B):** el APK `preview` no incluye BLE. Para HR por
banda hace falta un dev client:
`cd mobile && bunx eas-cli build -p android --profile development` → instalar el APK →
`bunx expo start --dev-client`. Emparejar la banda en Configuración → "Banda de pulso".
```

- [ ] **Step 2:** En `ONBOARDING.md §8` (Backlog), mover el ítem de sub-proyecto B a "hecho parcial" y agregar los diferidos:

```markdown
- **[Sub-proyecto B — HECHO en código, pendiente verificación en dispositivo]** HR en vivo por banda
  BLE (perfil estándar 0x180D), avg/max por serie. Falta: dev build + prueba con banda física.
- **[Backlog B]** curva de HR completa (serie temporal), HRV/RR por PMD Polar (dominio estrés),
  marca de calidad de cobertura del dato. Ver spec 2026-07-03-hr-ble-banda-design.md §9.
```

- [ ] **Step 3: Commit**

```bash
git add ONBOARDING.md
git commit -S -m "docs: dev build para BLE y backlog del sub-proyecto B"
```

### Task C-final: abrir PR C

- [ ] **Step 1: Suite completa + typecheck**

Run: `npm test -- --runInBand && npm run typecheck`
Expected: PASS ambos.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/hr-ble-ui
gh pr create --title "feat(mobile): UI de HR — emparejado en config + HR en vivo en sesión" \
  --body "Sub-proyecto B, PR 3/3. Emparejado de banda en Configuración y HR en vivo + hrAvg/hrMax por serie en Sesión. Pendiente: verificación con banda física sobre dev build (Task 11)."
```

- [ ] **Step 3:** Protocolo de auto-merge CodeRabbit.

---

## Task 11 (MANUAL — requiere el dispositivo del usuario)

> No automatizable en jest: no hay BLE en el entorno de test. La hace el usuario al despertar.

- [ ] Buildear el dev client: `cd mobile && bunx eas-cli build -p android --profile development` (cuenta Expo `belregistro`).
- [ ] Instalar el APK en el teléfono; `bunx expo start --dev-client`.
- [ ] Encender la banda (Polar o Garmin). En la app: Configuración → "Banda de pulso" → Escanear → elegir la banda → ver "emparejada".
- [ ] Empezar un entrenamiento → verificar que el box `♥ HR` muestra bpm en vivo.
- [ ] Hacer una serie (tap por rep) → Terminar serie → terminar entrenamiento.
- [ ] Verificar en el backend (Pi) que la serie quedó con `hr_avg`/`hr_max` no nulos (query a `set_log` o `GET /sessions/:id`).
- [ ] Probar degradación: apagar la banda a mitad de serie → la serie se completa igual (HR queda con lo capturado o null). La sesión nunca se traba.

---

## Self-Review

- **Cobertura del spec:** granularidad avg/max por serie (Tasks 2,3,9) ✅; perfil estándar 0x180D (Task 6) ✅; emparejar en config + auto-conectar (Tasks 5,8,9) ✅; best-effort/null sin lecturas (Tasks 2,9) ✅; capa aislada + puros + hook (Tasks 1,2,6,7) ✅; endSet mínimo (Task 3) ✅; dev build + permisos (Tasks 4,10,11) ✅; backlog diferido (Task 10) ✅.
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** `HrSample {t,bpm}` (Task 2) usado en hook (Task 7) y sesión (Task 9); `FoundDevice {id,name}` (Task 6) usado en bandManager, hook, config (Tasks 6,8); `endSet` firma con `hrAvg?/hrMax?` (Task 3) llamada en sesión (Task 9); `createBandManager`/`BandManagerHandle` (Task 6) usados en hook y config (Tasks 7,8); `getSamples`/`resetSamples` (Task 7) usados en sesión (Task 9).
- **Implementación de "ventana por serie":** se implementa reseteando el buffer al iniciar la serie (Task 9, `onTap`) en vez de filtrar por timestamp absoluto — mismo intent del spec (agregados por serie), más simple y determinista en test.
