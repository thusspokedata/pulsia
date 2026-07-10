# vc8 — Campana en background + página de descarga con QR

> Diseño para el release **vc8**. Dos features independientes (dos PRs) + un paso de ops de build/activación.
> Fecha: 2026-07-10.

## Objetivo

1. **Campana en background** (#2): que la campana del descanso suene aunque la app esté en background o con la pantalla apagada. Hoy el timer es JS (`setInterval` + `restUntil`) y el SO lo suspende → la campana no suena si la app no está en foreground. Requiere un módulo **nativo** (`expo-notifications`) → **no es OTA** → obliga a un APK nuevo (**vc8**).
2. **Página de descarga con QR** (`/download`): una página pública en el backend que muestra la última versión del APK con botón de descarga + un QR que apunta al APK directo. Backend puro (OTA-able; ya sirve a los usuarios de vc7).

Como el build de vc8 re-basa el fingerprint igual, se aprovecha para subir **TypeScript 6→7 en el móvil** (decisión del usuario).

## No-objetivos (YAGNI)

- No se toca el VPS/Pi ni se hostea nada nuevo para la descarga (el repo es público → los APK de GitHub Releases se bajan sin auth).
- No se agrega UI in-app de "buscar actualización" (el OTA/instalación sigue por auto-check nativo al abrir).
- No se cubre el force-stop/swipe-away de Android (ver Limitaciones).
- No se migra backend/shared a TS7 (solo móvil).

## Decisiones cerradas

- **QR → APK directo.** Escanear descarga el `.apk`; el QR se regenera con la última versión en cada carga de `/download`.
- **TS7 en el móvil: sí.** Va como primer commit del PR A (el build nativo re-basa el fingerprint de todos modos). Se mantiene el ignore de `typescript` para móvil en `.github/dependabot.yml` (el bump es manual y deliberado).
- **Dos PRs separados** + un paso de ops.

---

## PR A — Campana en background (mobile, nativo)

### Componentes

**Dependencia + config (`app.json`):**
- Agregar `expo-notifications` (`~57.x`, alineado al SDK 57).
- En `plugins`: `["expo-notifications", { "sounds": ["./assets/bell.wav"] }]`. Esto empaqueta `bell.wav` como sonido nativo (`res/raw`) referenciable por el canal Android.

**Handler global de notificaciones (`app/_layout.tsx`):**
- `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false }) })`.
- El handler **solo corre cuando llega una notificación con la app en foreground** → ahí se suprime el sonido porque la campana JS (`expo-audio`) ya lo maneja. En **background** el handler no corre y el sonido lo pone el OS vía el canal → **no hay doble campana**.

**Canal Android al boot:**
- Crear un canal (p. ej. `rest-bell`) con `sound: 'bell'` e importancia alta. Android hornea el sonido en el canal a la hora de crearlo.

**Permiso:**
- `Notifications.requestPermissionsAsync()` (al montar la sesión o al boot). Si lo niegan, degradación limpia: queda el comportamiento actual (campana solo en foreground). No bloquea la sesión.

**Núcleo — un único `useEffect` en `mobile/app/sesion.tsx` atado a `restUntil`:**
- Dependencias: `[restUntil, soundsEnabled]` (leer `soundsEnabledRef` a estado/valor estable para el effect).
- Cuando `restUntil` es un timestamp **futuro** y los sonidos están habilitados → programar una notif local con trigger de fecha en `restUntil`; guardar el id devuelto en un ref (`restNotifIdRef`).
- En el cleanup del effect (cambia `restUntil`, o el componente se desmonta) → cancelar la notif programada por id (`cancelScheduledNotificationAsync`).
- Esto cubre **automáticamente** todos los casos sin instrumentar cada call-site:
  - **skip-rest** y **pausar** → `restUntil` pasa a `null` → cleanup cancela.
  - **reanudar** → `restUntil` vuelve a futuro → reprograma.
  - **terminar** (unmount de `sesion.tsx`) → cleanup cancela.
  - **cambiar de ejercicio** → NO toca `restUntil` → la notif **sobrevive** (respeta el fix #4; resuelve la contradicción del onboarding que listaba "cambiar de ejercicio" como cancelación).
- **Expiración natural en background:** el OS dispara la notif (sonido). Al volver a foreground, el effect existente (`nowMs >= restUntil`, guardado por `restDoneRef`) ya no reprograma nada porque `restUntil` es pasado; se acepta que pueda sonar la campana JS una vez al reabrir (confirmación inofensiva). Si molesta, se acota con `AppState` en el plan.

### Testabilidad

- Extraer la **decisión** a `mobile/src/session/restNotification.ts` (función pura): dado `{ restUntil, prevId, soundsEnabled }` → `{ action: 'schedule', at } | { action: 'cancel', id } | { action: 'noop' }`. Test unitario puro (sin nativo).
- Wrapper fino y side-effectful que traduce la decisión a llamadas de `expo-notifications`; en jest se mockea `expo-notifications` (patrón existente de mocks de módulos nativos, `--runInBand`).

### Impacto de fingerprint

- `expo-notifications` (nativo) + el bump TS7 cambian el `runtimeVersion` (fingerprint). Es **esperado y necesario**: vc8 es un build nativo nuevo. A partir de vc8, **todo OTA futuro debe matchear el nuevo fingerprint de vc8**, no `aeaa36d9`. Se registra el nuevo runtime en la memoria [[ota-fingerprint-gotcha]] tras el build.

### Limitaciones conocidas

- **Force-stop / swipe-away:** algunos OEMs Android cancelan las alarmas de notificaciones locales si el usuario mata la app a mano. El caso principal (pantalla apagada / app en background / cambio de app) sí funciona. No se mitiga en este release.

---

## PR B — Página `/download` con QR (backend puro)

### Componentes

- **Dependencia:** `qrcode` en `backend/`.
- **Ruta pública `GET /download`:** registrada en `backend/src/app.ts` como `app.route("/download", downloadRoutes(deps))` **sin** un `app.use("/download", auth)`. El middleware `auth` se aplica **por-prefijo** (verificado: `app.use("/settings", auth)`, etc.), así que una ruta nueva sin su `app.use` queda pública. Registrar el nuevo `app.use`/route **fuera** de la lista de prefijos con auth.
- **Handler:** `getLatestRelease(db)` (ya existe, devuelve `{ versionCode, apkUrl, label } | null`) → renderiza HTML `Content-Type: text/html`:
  - Con release: título "Pulsia · última versión vc{N}", `label` si hay, botón/enlace **Descargar** → `apkUrl`, y un **QR SVG inline** generado server-side con `qrcode` (`toString(apkUrl, { type: 'svg' })`) apuntando al **APK directo**.
  - Sin release: mensaje amable ("Aún no hay una versión publicada").
- **Estilo:** HTML self-contained, mobile-first (la mayoría escanea/entra desde el teléfono), acento coral `#D85A30` para matchear la marca. Sin dependencias externas de assets.

### Testabilidad

- Test de backend (`bun test`): `GET /download` → 200, **sin** auth (público), el body contiene la versión y el `apkUrl`; caso `release == null` → 200 con el mensaje de "sin versión". Content-Type html.
- El QR apunta a `apkUrl`, que cambia por release → la página regenera el QR con la última versión en cada carga.

### Independencia

- PR B es backend puro: se puede mergear y deployar **antes** que vc8 y ya funciona para los usuarios de vc7 (la página ofrece lo que haya en `app_release`, hoy vc7).

---

## Build & activación vc8 (ops, tras merge de PR A)

1. **Build local gratis** (bypass cuota EAS), método completo en la memoria [[local-android-build]]: extraer el keystore de EAS del job spec + `prebuild` + `gradlew assembleRelease` con firma inyectada + fix `~/.gradle/gradle.properties` `MaxMetaspaceSize=1536m` + ABIs `arm64-v8a,armeabi-v7a`. **Mismo keystore** que vc4/vc6/vc7 → instala como update. Cuenta EAS `belregistro`.
2. **Registrar el nuevo fingerprint:** verificar el runtime del build y anotarlo (memoria [[ota-fingerprint-gotcha]]) como el nuevo target de OTA.
3. **Publicar (mutación externa → confirmar puntual):** `gh release create mobile-vc8 <apk>` (repo público → descarga sin auth).
4. **Activar (mutación externa → confirmar puntual):** `PUT /app/latest` con `{ versionCode: 8, apkUrl: <url del release>, label }` y `X-Admin-Token: $ADMIN_TOKEN` (en `deploy/app.env` de la Pi). ⚠️ `/app/latest` está detrás de `auth` → el PUT requiere **token de sesión del owner además** del `X-Admin-Token`: loguearse como owner para obtener el token de sesión y mandarlo junto con el admin token. (Alternativa fuera de alcance: sacar `/app/latest` de `auth` ya que está admin-gated por `X-Admin-Token`.)
5. **Actualizar docs/memorias:** `ONBOARDING.md`, [[ota-fingerprint-gotcha]] (nuevo runtime), [[update-feature-status]] (vc8), [[local-android-build]] si cambió algo.

---

## Orden de ejecución

1. **PR B** primero (backend, bajo riesgo, útil ya con vc7).
2. **PR A** (mobile + TS7).
3. **Build & activación vc8** (ops) tras el merge de PR A.

Cada PR: TDD, review de CodeRabbit (`@coderabbitai review` si rate-limited; `@claude review` si caído), squash-merge tras review limpio sin threads abiertos. Ejecución subagent-driven.

## Riesgos

- **Build TS7:** el toolchain nativo de TS7 podría complicar el build local con gradle. Mitigación: si el build revienta por TS7, aislar (revertir el bump y buildear vc8 solo con la campana). El bump va como commit separado para poder revertirlo limpio.
- **Doble campana:** mitigada por el `setNotificationHandler` (foreground suprime sonido). A validar en device.
- **Permiso de notificaciones denegado:** degrada al comportamiento actual (solo foreground); no rompe nada.
