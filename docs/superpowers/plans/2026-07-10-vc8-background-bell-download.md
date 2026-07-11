# vc8 — Campana en background + página de descarga con QR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la campana del descanso suene con la app en background (vía `expo-notifications`, nativo → APK vc8) y publicar una página pública `/download` con QR al APK.

**Architecture:** Dos features independientes en dos PRs. **PR B** (backend puro): ruta pública `GET /download` que lee `app_release` y renderiza HTML con botón de descarga + QR (SVG server-side, apunta al APK directo). **PR A** (mobile, nativo): `expo-notifications` programa una notif local al iniciar cada descanso y la cancela atada al ciclo de vida de `restUntil`; un handler global suprime el sonido en foreground (la campana JS ya suena) para evitar doble campana; incluye el bump TypeScript 6→7. Luego un paso de **ops**: build local de vc8 + release + activación.

**Tech Stack:** Backend Hono + Bun + Drizzle, tests `bun test`, lib `qrcode`. Mobile Expo SDK 57 + expo-router, tests jest (`jest-expo`, `--runInBand`), `expo-notifications`, `expo-audio`.

**Orden:** PR B → PR A → ops. Cada PR: rama propia, TDD, review CodeRabbit, squash-merge tras review limpio.

---

## PARTE 1 — PR B: página `/download` con QR (backend)

Rama: `feat/download-page-qr`. Todo el backend auto-migra/deploya en merge a `main`; esta feature no toca la DB (solo lee `app_release`).

### Task 1: Dependencia `qrcode`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Instalar la lib + tipos**

Run:
```bash
cd backend && bun add qrcode && bun add -d @types/qrcode
```
Expected: `qrcode` en `dependencies`, `@types/qrcode` en `devDependencies`.

- [ ] **Step 2: Verificar el build/typecheck sigue verde**

Run: `cd backend && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/bun.lock
git commit -S -m "chore(backend): add qrcode dep para la página de descarga"
```

---

### Task 2: Render puro de la página HTML

Función pura que arma el HTML dado el release y el SVG del QR ya generado. Separar el render (puro, testeable) de la generación del QR (async, en la ruta).

**Files:**
- Create: `backend/src/download/render.ts`
- Test: `backend/src/download/render.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/src/download/render.test.ts`:
```ts
import { test, expect } from "bun:test";
import { renderDownloadPage } from "./render";

test("con release: incluye la versión, el label, el link al APK y el QR svg", () => {
  const html = renderDownloadPage(
    { versionCode: 8, apkUrl: "https://x.test/pulsia-vc8.apk", label: "vc8 con login" },
    "<svg id='qr'></svg>",
  );
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("vc8"); // versión visible
  expect(html).toContain("vc8 con login"); // label
  expect(html).toContain("https://x.test/pulsia-vc8.apk"); // href de descarga
  expect(html).toContain("<svg id='qr'>"); // QR inline (sin escapar)
  expect(html).toContain("Descargar");
});

test("sin release (null): mensaje amable, sin link ni QR", () => {
  const html = renderDownloadPage(null, "");
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("Aún no hay");
  expect(html).not.toContain("<a "); // no hay botón de descarga
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && bun test src/download/render.test.ts`
Expected: FAIL con "Cannot find module './render'".

- [ ] **Step 3: Implementar el render mínimo**

`backend/src/download/render.ts`:
```ts
import type { AppRelease } from "../appRelease/repository";

// Render puro de la página pública de descarga. El SVG del QR se genera en la ruta
// (async) y se inyecta ya listo; acá solo se arma el HTML.
export function renderDownloadPage(release: AppRelease, qrSvg: string): string {
  const shell = (body: string) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pulsia · descargar</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, system-ui, sans-serif; background: #FBF7F4;
    color: #2A211C; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 380px; width: 100%;
    text-align: center; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .ver { color: #D85A30; font-weight: 700; }
  .label { color: #7A6E66; font-size: 14px; margin: 0 0 20px; }
  .qr { width: 200px; height: 200px; margin: 0 auto 20px; }
  .qr svg { width: 100%; height: 100%; }
  a.btn { display: inline-block; background: #D85A30; color: #fff; text-decoration: none;
    font-weight: 600; padding: 14px 28px; border-radius: 12px; }
  .hint { color: #7A6E66; font-size: 12px; margin-top: 16px; }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;

  if (!release) {
    return shell(`<h1>Pulsia</h1><p class="label">Aún no hay una versión publicada.</p>`);
  }
  const label = release.label ? `<p class="label">${release.label}</p>` : "";
  return shell(
    `<h1>Pulsia</h1>
     <p class="label">Última versión: <span class="ver">vc${release.versionCode}</span></p>
     ${label}
     <div class="qr">${qrSvg}</div>
     <a class="btn" href="${release.apkUrl}">Descargar APK</a>
     <p class="hint">Escaneá el QR desde el teléfono o tocá Descargar.</p>`,
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd backend && bun test src/download/render.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/download/render.ts backend/src/download/render.test.ts
git commit -S -m "feat(backend): render puro de la página de descarga"
```

---

### Task 3: Ruta pública `GET /download` + wiring

La ruta genera el QR (SVG) del `apkUrl` y devuelve el HTML. Se registra **fuera** de la lista de prefijos con `auth` (el middleware es por-prefijo), así queda pública.

**Files:**
- Create: `backend/src/routes/download.ts`
- Test: `backend/src/routes/download.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Escribir el test de integración que falla**

`backend/src/routes/download.test.ts`:
```ts
import { test, expect } from "bun:test";
import { createApp } from "../app";

function fakeDb(stored: any = null) {
  return {
    query: {
      sessions: { findFirst: async () => null },
      appRelease: { findFirst: async () => stored },
    },
  } as any;
}
function deps(db: any) {
  return {
    db,
    config: { encryptionKey: "a".repeat(64), defaultModel: "claude-sonnet-4-6", inviteCode: "INV", sessionTtlDays: 4, adminToken: "admintok" },
    aiClient: { generateProgram: async () => ({ name: "x", weeks: [] }) },
  };
}

test("GET /download es PÚBLICO (sin auth) y renderiza la versión + apkUrl + QR", async () => {
  const app = createApp(deps(fakeDb({ id: "singleton", versionCode: 8, apkUrl: "https://x.test/p-vc8.apk", label: "vc8" })) as any);
  const res = await app.request("/download"); // sin Authorization
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("vc8");
  expect(html).toContain("https://x.test/p-vc8.apk");
  expect(html).toContain("<svg"); // QR generado server-side
});

test("GET /download sin release → 200 con mensaje amable", async () => {
  const app = createApp(deps(fakeDb(null)) as any);
  const res = await app.request("/download");
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("Aún no hay");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && bun test src/routes/download.test.ts`
Expected: FAIL (404 en `/download`, la ruta no existe).

- [ ] **Step 3: Implementar la ruta**

`backend/src/routes/download.ts`:
```ts
import { Hono } from "hono";
import QRCode from "qrcode";
import { getLatestRelease } from "../appRelease/repository";
import { renderDownloadPage } from "../download/render";
import type { AppDeps } from "../app";

// Página pública de descarga. NO va detrás de `auth` (se registra fuera de la lista de
// prefijos con middleware en app.ts). El QR apunta al APK directo y se regenera con la
// última versión en cada carga.
export function downloadRoutes(deps: AppDeps) {
  const r = new Hono();
  r.get("/", async (c) => {
    const release = await getLatestRelease(deps.db);
    const qrSvg = release ? await QRCode.toString(release.apkUrl, { type: "svg", margin: 1 }) : "";
    return c.html(renderDownloadPage(release, qrSvg));
  });
  return r;
}
```

- [ ] **Step 4: Registrar la ruta en `app.ts` (pública)**

En `backend/src/app.ts`: agregar el import y registrar la ruta junto a `/health` (rutas públicas), **sin** agregar ningún `app.use("/download", auth)`.

Agregar el import con los otros imports de rutas:
```ts
import { downloadRoutes } from "./routes/download";
```
Y justo después de `app.get("/health", ...)` (antes de la lista de `app.use(..., auth)`):
```ts
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/download", downloadRoutes(deps)); // PÚBLICA: fuera del middleware `auth`
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `cd backend && bun test src/routes/download.test.ts && bunx tsc --noEmit`
Expected: PASS (2 tests), typecheck limpio.

- [ ] **Step 6: Correr toda la suite de backend (no romper auth ni release)**

Run: `cd /Users/kilo/desarrollo26/pulsia && bun test backend`
Expected: toda verde.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/download.ts backend/src/routes/download.test.ts backend/src/app.ts
git commit -S -m "feat(backend): ruta pública GET /download con QR al APK"
```

---

### Task 4: Cerrar PR B

- [ ] **Step 1:** Push de la rama `feat/download-page-qr` y abrir PR contra `main`.
- [ ] **Step 2:** Esperar review de CodeRabbit (`@coderabbitai review` si rate-limited; `@claude review` si caído). Menores → fix + merge; mayores → fix + nuevo review.
- [ ] **Step 3:** Squash-merge tras review limpio. El merge auto-deploya el backend a la Pi → verificar salud: `ssh vps 'curl -s http://10.8.0.2:3011/health'` y `curl -s https://pulsia.lahuelladelcaminante.de/download | head` (debe devolver HTML con la versión actual, hoy vc7).

---

## PARTE 2 — PR A: campana en background (mobile) + TS7

Rama: `feat/rest-bell-background`. Cambios nativos → re-basa el fingerprint (esperado). Tests jest `--runInBand`.

### Task 5: Bump TypeScript 6 → 7 (commit aislado y reversible)

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Subir la versión**

Run:
```bash
cd mobile && bun add -d typescript@7
```
Expected: `typescript` en `~7.x` en `mobile/package.json`.

- [ ] **Step 2: Typecheck del móvil**

Run: `cd mobile && bunx tsc --noEmit`
Expected: sin errores. (Si hay errores nuevos de TS7, evaluar si son triviales de arreglar; si el toolchain revienta, revertir este commit y seguir el PR sin TS7 — ver Riesgos.)

- [ ] **Step 3: Correr los tests del móvil**

Run: `cd mobile && npm test -- --runInBand`
Expected: toda la suite verde.

- [ ] **Step 4: Commit (aislado para poder revertir limpio)**

```bash
git add mobile/package.json mobile/bun.lock
git commit -S -m "chore(mobile): TypeScript 6→7"
```

---

### Task 6: Dependencia + config nativa de `expo-notifications`

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`

- [ ] **Step 1: Instalar la dep alineada al SDK**

Run:
```bash
cd mobile && bunx expo install expo-notifications
```
Expected: `expo-notifications` (`~57.x`) en `mobile/package.json`.

- [ ] **Step 2: Configurar el plugin con el sonido de la campana**

En `mobile/app.json`, dentro de `expo.plugins`, agregar (después de `"expo-audio"`):
```json
      [
        "expo-notifications",
        { "sounds": ["./assets/bell.wav"] }
      ],
```
Esto empaqueta `bell.wav` como sonido nativo (`res/raw`) referenciable por el canal.

- [ ] **Step 3: Verificar que `app.json` sigue siendo JSON válido y el typecheck pasa**

Run: `cd mobile && node -e "require('./app.json')" && bunx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/bun.lock mobile/app.json
git commit -S -m "chore(mobile): expo-notifications + sonido de campana en el plugin"
```

---

### Task 7: Módulo `restNotification` — plan puro + wrapper nativo

El **plan** (qué hacer) es puro y testeable. El **wrapper** (programar/cancelar) llama a `expo-notifications` y se mockea en tests.

**Files:**
- Create: `mobile/src/session/restNotification.ts`
- Test: `mobile/__tests__/rest-notification.test.ts`

- [ ] **Step 1: Escribir el test puro que falla**

`mobile/__tests__/rest-notification.test.ts`:
```ts
import { restNotificationPlan } from "../src/session/restNotification";

const NOW = 1_000_000;

test("descanso futuro con sonidos ON → programar en restUntil", () => {
  expect(restNotificationPlan({ restUntil: NOW + 90_000, soundsEnabled: true, now: NOW })).toEqual({
    schedule: true,
    date: NOW + 90_000,
  });
});

test("sin descanso (null) → no programar", () => {
  expect(restNotificationPlan({ restUntil: null, soundsEnabled: true, now: NOW })).toEqual({ schedule: false });
});

test("sonidos OFF → no programar aunque haya descanso", () => {
  expect(restNotificationPlan({ restUntil: NOW + 90_000, soundsEnabled: false, now: NOW })).toEqual({ schedule: false });
});

test("descanso ya vencido (<= now) → no programar", () => {
  expect(restNotificationPlan({ restUntil: NOW - 1, soundsEnabled: true, now: NOW })).toEqual({ schedule: false });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd mobile && npm test -- --runInBand rest-notification`
Expected: FAIL ("Cannot find module '../src/session/restNotification'").

- [ ] **Step 3: Implementar el módulo (plan puro + wrapper nativo)**

`mobile/src/session/restNotification.ts`:
```ts
import * as Notifications from "expo-notifications";

export const REST_CHANNEL_ID = "rest-bell";
const BELL_SOUND = "bell.wav";

export type RestNotificationPlan = { schedule: false } | { schedule: true; date: number };

// Decisión pura: ¿programar una notif para el fin del descanso? Solo si hay un descanso
// futuro y los sonidos están habilitados. `date` es el timestamp absoluto (ms) del fin.
export function restNotificationPlan(args: {
  restUntil: number | null;
  soundsEnabled: boolean;
  now: number;
}): RestNotificationPlan {
  const { restUntil, soundsEnabled, now } = args;
  if (!soundsEnabled || restUntil == null || restUntil <= now) return { schedule: false };
  return { schedule: true, date: restUntil };
}

// Wrapper con efectos: programa la campana de fin de descanso y devuelve su id.
export async function scheduleRestBell(date: number): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: "Descanso terminado", body: "¡Dale con la próxima serie!", sound: BELL_SOUND },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(date),
      channelId: REST_CHANNEL_ID,
    },
  });
}

export async function cancelRestBell(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd mobile && npm test -- --runInBand rest-notification`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/session/restNotification.ts mobile/__tests__/rest-notification.test.ts
git commit -S -m "feat(mobile): plan puro + wrapper de la notif de fin de descanso"
```

---

### Task 8: Setup global de notificaciones (handler + permiso + canal)

Un módulo de setup que se llama una vez al montar el layout raíz: fija el handler (foreground → sin sonido, la campana JS ya suena), pide permiso y crea el canal Android con el sonido.

**Files:**
- Create: `mobile/src/notifications/setup.ts`
- Test: `mobile/__tests__/notifications-setup.test.ts`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Escribir el test que falla (con `expo-notifications` mockeado)**

`mobile/__tests__/notifications-setup.test.ts`:
```ts
const mockSetHandler = jest.fn();
const mockRequestPerms = jest.fn(async () => ({ status: "granted" }));
const mockSetChannel = jest.fn(async () => undefined);
jest.mock("expo-notifications", () => ({
  setNotificationHandler: (...a: any[]) => mockSetHandler(...a),
  requestPermissionsAsync: (...a: any[]) => mockRequestPerms(...a),
  setNotificationChannelAsync: (...a: any[]) => mockSetChannel(...a),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import { setupRestNotifications } from "../src/notifications/setup";

test("fija el handler que suprime el sonido en foreground", async () => {
  await setupRestNotifications();
  expect(mockSetHandler).toHaveBeenCalledTimes(1);
  const handler = mockSetHandler.mock.calls[0][0].handleNotification;
  await expect(handler()).resolves.toMatchObject({ shouldPlaySound: false });
});

test("pide permiso y crea el canal 'rest-bell' con el sonido", async () => {
  await setupRestNotifications();
  expect(mockRequestPerms).toHaveBeenCalled();
  const [id, cfg] = mockSetChannel.mock.calls[0];
  expect(id).toBe("rest-bell");
  expect(cfg.sound).toBe("bell.wav");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd mobile && npm test -- --runInBand notifications-setup`
Expected: FAIL ("Cannot find module '../src/notifications/setup'").

- [ ] **Step 3: Implementar el setup**

`mobile/src/notifications/setup.ts`:
```ts
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { REST_CHANNEL_ID } from "../session/restNotification";

// Setup único (al montar el layout raíz). El handler solo corre cuando llega una notif con
// la app en FOREGROUND: ahí se suprime el sonido porque la campana JS (expo-audio) ya lo
// maneja → evita la doble campana. En background el handler no corre y el sonido lo pone
// el OS vía el canal.
export async function setupRestNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
  try {
    await Notifications.requestPermissionsAsync();
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
        name: "Fin de descanso",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "bell.wav",
      });
    }
  } catch {
    // Permiso/canal best-effort: si falla, queda la campana solo-foreground (comportamiento previo).
  }
}
```

- [ ] **Step 4: Llamar el setup desde el layout raíz**

En `mobile/app/_layout.tsx`: importar y disparar el setup una vez al montar. Agregar el import:
```ts
import { setupRestNotifications } from "../src/notifications/setup";
```
Y dentro del componente del layout, un efecto de montaje único:
```ts
  useEffect(() => {
    void setupRestNotifications();
  }, []);
```
(Si ya hay un `useEffect` de arranque en `_layout.tsx`, agregar la llamada ahí; si no existe `useEffect` importado, agregarlo al import de `react`.)

- [ ] **Step 5: Correr los tests + typecheck**

Run: `cd mobile && npm test -- --runInBand notifications-setup && bunx tsc --noEmit`
Expected: PASS (2 tests), typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/notifications/setup.ts mobile/__tests__/notifications-setup.test.ts mobile/app/_layout.tsx
git commit -S -m "feat(mobile): setup de notificaciones (handler foreground + canal + permiso)"
```

---

### Task 9: Programar/cancelar la campana atada a `restUntil` en `sesion.tsx`

Un único `useEffect([restUntil, soundsEnabled])`: cuando hay descanso futuro y sonidos ON, programa la notif; en el cleanup (cambia `restUntil` o unmount) la cancela. Cubre skip-rest, pausar (cancelan), reanudar (reprograma), terminar (unmount cancela) y respeta que cambiar de ejercicio NO toque `restUntil` (la notif sobrevive).

**Files:**
- Modify: `mobile/app/sesion.tsx`
- Test: `mobile/__tests__/sesion.test.tsx` (agregar mock de `expo-notifications` + casos)

- [ ] **Step 1: Agregar el mock de `expo-notifications` y un test que falla**

En `mobile/__tests__/sesion.test.tsx`, junto a los otros `jest.mock` del tope del archivo, agregar:
```ts
const mockSchedule = jest.fn(async () => "notif-1");
const mockCancel = jest.fn(async () => undefined);
jest.mock("../src/session/restNotification", () => {
  const actual = jest.requireActual("../src/session/restNotification");
  return {
    ...actual,
    scheduleRestBell: (...a: any[]) => mockSchedule(...a),
    cancelRestBell: (...a: any[]) => mockCancel(...a),
  };
});
```
Y agregar un test (adaptar los helpers de render existentes del archivo — `renderSesion`/setup ya presente) que:
```ts
test("al terminar una serie programa la campana de fin de descanso", async () => {
  // (usar el flujo existente del archivo para montar la sesión y terminar una serie:
  //  tap-rep hasta completar reps → botón terminar serie 'end-set')
  // ...montaje como en los otros tests...
  fireEvent.press(screen.getByTestId("tap-rep"));
  fireEvent.press(screen.getByTestId("end-set"));
  await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
});

test("saltar el descanso cancela la campana programada", async () => {
  // ...montaje + terminar serie (programa)...
  await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
  fireEvent.press(screen.getByTestId("skip-rest"));
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("notif-1"));
});
```
> Nota para el implementador: reutilizar el patrón de montaje/`waitFor` ya usado por los tests de esta suite (hay ~28KB de casos); no inventar un montaje nuevo. Los testIDs `tap-rep`, `end-set`, `skip-rest` existen en `sesion.tsx`.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: FAIL (`mockSchedule` nunca se llama — el efecto no existe todavía).

- [ ] **Step 3: Implementar el efecto en `sesion.tsx`**

Agregar el import (junto a los otros imports de `../src/session/...`):
```ts
import { restNotificationPlan, scheduleRestBell, cancelRestBell } from "../src/session/restNotification";
```
Leer la preferencia de sonidos a **estado** para que el efecto reaccione (hoy `soundsEnabledRef` es un ref; agregar un estado espejo). Cerca de donde se resuelve `soundsEnabledRef`:
```ts
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  useEffect(() => {
    void getSoundsEnabled().then((v) => {
      soundsEnabledRef.current = v;
      setSoundsEnabled(v);
    });
  }, []);
```
Agregar el efecto que ata la notif al ciclo de vida de `restUntil` (junto a los otros `useEffect`):
```ts
  // Notif nativa de fin de descanso (suena con la app en background). Atada a `restUntil`:
  // se programa al haber descanso futuro y se cancela en el cleanup (skip/pausa/terminar/reprogramar).
  // Cambiar de ejercicio NO toca `restUntil` → la notif sobrevive (fix #4).
  useEffect(() => {
    const plan = restNotificationPlan({ restUntil, soundsEnabled, now: Date.now() });
    if (!plan.schedule) return;
    let id: string | null = null;
    let cancelled = false;
    void scheduleRestBell(plan.date).then((nid) => {
      if (cancelled) void cancelRestBell(nid);
      else id = nid;
    });
    return () => {
      cancelled = true;
      if (id) void cancelRestBell(id);
    };
  }, [restUntil, soundsEnabled]);
```

- [ ] **Step 4: Correr los tests de `sesion` para verificar que pasan**

Run: `cd mobile && npm test -- --runInBand sesion`
Expected: PASS (incluyendo los 2 casos nuevos y sin romper los existentes).

- [ ] **Step 5: Correr toda la suite del móvil + typecheck**

Run: `cd mobile && npm test -- --runInBand && bunx tsc --noEmit`
Expected: toda verde, typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/sesion.tsx mobile/__tests__/sesion.test.tsx
git commit -S -m "feat(mobile): campana de fin de descanso en background (expo-notifications)"
```

---

### Task 10: Cerrar PR A

- [ ] **Step 1:** Push de `feat/rest-bell-background` y abrir PR contra `main`.
- [ ] **Step 2:** Review de CodeRabbit (misma política que PR B).
- [ ] **Step 3:** Squash-merge tras review limpio. (Este merge NO se entrega por OTA — es nativo → requiere el build vc8 de la Parte 3.)

---

## PARTE 3 — Ops: build local de vc8 + release + activación

No es TDD. Se hace tras el merge de PR A. Requiere confirmación puntual del usuario en cada mutación externa (release + PUT).

- [ ] **Step 1: Build local del APK vc8** siguiendo la memoria `local-android-build`: extraer el keystore de EAS del job spec + `bunx expo prebuild` + `cd android && ./gradlew assembleRelease` con la firma inyectada + fix `~/.gradle/gradle.properties` `MaxMetaspaceSize=1536m` + restringir ABIs a `arm64-v8a,armeabi-v7a`. Mismo keystore que vc7 (cert SHA-256 `0470…769f7`) → instala como update. Cuenta EAS `belregistro`. Subir `versionCode` a 8.

- [ ] **Step 2: Registrar el nuevo fingerprint.** Obtener el `runtimeVersion`/fingerprint del build vc8 (`bunx --bun eas-cli fingerprint:generate` o el reportado por el build) y anotarlo como el NUEVO target de OTA. A partir de vc8, todo `eas update` debe matchear este fingerprint (ya no `aeaa36d9…`).

- [ ] **Step 3: Publicar el release (MUTACIÓN EXTERNA — confirmar puntual con el usuario).**
```bash
gh release create mobile-vc8 <ruta-al-apk> --title "Pulsia vc8" --notes "Campana en background"
```

- [ ] **Step 4: Activar vc8 (MUTACIÓN EXTERNA — confirmar puntual).** `PUT /app/latest`. Ojo: `/app/latest` está detrás de `auth` → hace falta **token de sesión del owner además** del `X-Admin-Token`. Loguearse como owner para obtener el token de sesión y mandar ambos:
```bash
curl -X PUT https://pulsia.lahuelladelcaminante.de/app/latest \
  -H "content-type: application/json" \
  -H "Authorization: Bearer <token-de-sesión-del-owner>" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{"versionCode":8,"apkUrl":"https://github.com/thusspokedata/pulsia/releases/download/mobile-vc8/<apk>","label":"vc8 — campana en background"}'
```
Verificar: `curl -s https://pulsia.lahuelladelcaminante.de/download` muestra vc8 y el QR apunta al APK vc8.

- [ ] **Step 5: Actualizar docs/memorias.** `ONBOARDING.md` (estado vc8), memoria `ota-fingerprint-gotcha` (nuevo runtime de vc8), `update-feature-status` (vc8 activo), `local-android-build` si cambió algo del método.

---

## Riesgos

- **Build TS7 (Task 5):** si el toolchain nativo de TS7 complica el typecheck o el build local con gradle, revertir el commit aislado de TS7 (`git revert`) y buildear vc8 solo con la campana. Por eso el bump va en su propio commit.
- **Doble campana:** mitigada por el handler de foreground (Task 8). Validar en device tras instalar vc8 (poner música, empezar descanso, bloquear pantalla → suena; con la app abierta → suena una sola vez).
- **Permiso de notificaciones denegado:** degrada al comportamiento actual (campana solo-foreground); no rompe la sesión.
- **Force-stop/swipe-away:** algunos OEMs cancelan la alarma; fuera de alcance (documentado en el spec).

---

## Self-review — cobertura del spec

- Campana background nativa (`expo-notifications`) → Tasks 6–9. ✓
- Handler foreground anti-doble-campana → Task 8. ✓
- Notif atada a `restUntil` (skip/pausa/reanudar/terminar/cambio-de-ejercicio) → Task 9. ✓
- Sonido `bell.wav` empaquetado + canal → Tasks 6, 8. ✓
- Módulo puro testeable → Task 7 (`restNotificationPlan`). ✓
- TS7 móvil, commit reversible → Task 5. ✓
- `/download` público con QR al APK directo, caso null → Tasks 1–3. ✓
- Render puro testeable → Task 2. ✓
- Dos PRs (B luego A) → Partes 1 y 2. ✓
- Build vc8 + release + activación + `/app/latest` tras auth + fingerprint + docs → Parte 3. ✓
