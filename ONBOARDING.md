# Pulsia — Onboarding / Handoff

> Documento de contexto para retomar el proyecto en una sesión nueva. Última actualización: **2026-07-12** (sesión larga: **APK vc8 (campana en background) + página `/download` con QR + fixes de sesión + nombres de ejercicios en español + datos de actividad/salud (pasos/sueño/etc con backfill) + peso single-source + sexo**). Todo en `main`, backend deployado y **entregado (APK vc8 + OTAs)**. **Fingerprint nuevo vc8 = `88cc46dd…`** (ya no `aeaa36d9`). Ver §0a-next. **0 PRs abiertos, prod sano.**

## 0. Estado en una línea

**Pulsia está EN INTERNET, multi-usuario, con login.** Backend en **`https://pulsia.lahuelladelcaminante.de`** (VPS nginx → Wireguard → Pi:3011, HTTPS por certbot, rate-limit en `/auth/`). La app (Android, **APK vc8** con login + **campana en background**; todo lo nuevo llega por **OTA** a vc8) registra/resume/revisa entrenamientos, HR por banda BLE, resumen con mapa corporal + FC por ejercicio + curva de FC de la sesión, **nombres de ejercicios en español + inglés**, notas, sustitución, memoria del atleta, % cumplimiento, peso sugerido, entreno puntual expandido, genera programas async, y trae un tab **"Progreso"** con seguimiento cuantitativo (composición corporal + presión arterial + **actividad/recuperación: pasos/pisos/sueño/FC reposo** + **bienestar: estrés/ánimo/energía**, con **backfill por fecha**) + tendencias de fuerza/volumen/PRs + heatmap anual, que **la IA observa al generar** (actividad/sueño como promedio + alertas). El perfil tiene **sexo** (opcional) y el **peso es single-source** (canónico desde Progreso). Owner: `a.saleme@pm.me`. La familia baja el APK vc8 desde **`pulsia.lahuelladelcaminante.de/download`** (QR) + se registra con el **`INVITE_CODE`**. Un merge a `main` **auto-deploya el backend a la Pi**.

## 0a. Estado de la sesión 2026-07-10/11 (sesión PREVIA — la MÁS reciente es §0a-next, arriba)

> Contexto de la sesión anterior (progreso cuantitativo Fase 1, presión, HR, visualizaciones). El estado actual/último está en **§0a-next**. Ojo: acá se habla de vc7/`aeaa36d9…`, ya superado por vc8/`88cc46dd…`.

**Todo mergeado en `main`, backend deployado, y entregado por OTA a vc7** (runtime `aeaa36d9…`). **0 PRs abiertos, prod sano.**

### Seguimiento de progreso cuantitativo (Fase 1) — norte [[athlete-ai-memory]], [[progress-tracking-status]]
Spec `docs/superpowers/specs/2026-07-10-seguimiento-progreso-design.md`, plan `docs/.../plans/2026-07-10-seguimiento-progreso.md`.
- **#86 backend datos & tendencias** — tabla tipada `body_metric` (migración **0007**), endpoints bajo `auth` `POST/GET /metrics`, `/metrics/latest`, `DELETE /metrics/:id`, `GET /progress/performance`. Cómputo **puro en `shared/`** (`computePerformanceTrends`: 1RMe Epley, volumen/sesión, PRs).
- **#87 la IA observa el progreso** — `buildProgressSummary` (deltas ~8 sem por **fecha** vía `getSessionsSince`, IMC derivado, fuerza top-5, volumen) inyectado en el prompt de generación + refresh de memoria — **solo al generar/refrescar, NUNCA reactivo** (cargar datos NO regenera). Ambos caminos (`/generate` sync + async).
- **#88 tab "Progreso" móvil** — `app/(tabs)/progreso.tsx`: valores actuales, chart de tendencia, fuerza (1RMe) top-5, volumen, form de carga. Charts SVG.
- **Modelo tipado extensible** = clave: sumar métricas nuevas = sumar tipos en `shared/src/schemas/metrics.ts` (`BODY_METRIC_TYPES` + `BP_METRIC_TYPES`), sin migración de columnas.

### Presión arterial (#94) — [[progress-tracking-status]]
`bp_systolic`/`bp_diastolic`/`bp_pulse` (mmHg/bpm). El backend redeployó para aceptarlos (modelo genérico, sin cambio de código). Sección propia en Progreso: carga agrupada "120/80@bpm" + `MultiLineChart` combinado (2 líneas). Refine cruzado: alta > baja.

### HR #9 (ambas partes) — [[progress-tracking-status]]
- **(a) #97 FC por ejercicio** en el resumen (roll-up de `hrAvg`/`hrMax` por serie → por ejercicio en `summary.ts` + sección "Por ejercicio" en `SessionSummary.tsx`).
- **(b) #98 curva de FC de toda la sesión** — captura **continua** (incl. descansos): `useHeartRate` guarda `fullLogRef` (sobrevive los resets por-serie); `buildHrSeries` downsamplea a buckets de 5s; se sube en `hr_series` jsonb (**migración 0008**) y se muestra como curva (`LineChart`) en el resumen. El `LineChart` ahora muestra **escala** (mín/máx + unidad).

### Visualizaciones (Batch 2)
- **#93** heatmap anual estilo GitHub ("Días entrenados", intensidad = minutos/día, selector de año) + barras de tiempo por día (últimas 4 semanas). Mobile-only (datos de `GET /sessions`). En el tab Progreso.
- **#95/#96** el heatmap **no muestra días futuros** del año en curso (la grilla se recorta a la semana de hoy, solo el año en curso) y **arranca scrolleado a lo reciente** (auto-scroll al final).

### Arreglos de sesión en vivo (Batch 1, #91)
#1 la campana ya no pausa música/podcast (`setAudioModeAsync mixWithOthers`); #4 cambiar de ejercicio NO corta el descanso; #5 auto-reanuda al tocar reps si estaba pausado; #3 la burbuja de reps arranca con las reps del plan (`parsePlannedReps`), el tap sigue +1.

### ⚠️ GOTCHA CRÍTICO — OTA fingerprint (memoria [[ota-fingerprint-gotcha]])
Bumpear CUALQUIER dep del móvil (hasta un devDep) cambia el `runtimeVersion` (fingerprint) y **rompe el OTA hacia el APK instalado**. **ACTUALIZADO (vc8, 2026-07-11):** la versión activa es **vc8 = `88cc46dd4ea6139e6c39bf0cf50664675615491f`** (re-basado por `expo-notifications` + TS7). **Verificar SIEMPRE** que `eas update` reporte runtime android **`88cc46dd…`** (ya NO `aeaa36d9`, que era vc7). Los que sigan en vc7 no reciben OTAs de 88cc46dd hasta instalar vc8. `.github/dependabot.yml` ignora las deps del móvil (typescript, react, react-native-*, expo*, async-storage, babel major, jest major).

### Dependabot (limpio)
#73 (checkout 4→7) + #83 (grouping + `@anthropic-ai/sdk` 0.110) mergeados; #78 + #84 (@babel/runtime 8, HOLD tras eval empírica en worktree) cerrados; #89 (ignore babel-major) mergeado; #85→#90 (typescript 7) **revertido** por el fingerprint. Sin PRs de dependabot abiertos.

### ⚠️ Lección: subagentes que re-delegan (memoria [[execution-subagent-driven]])
En #98 un subagente `general-purpose` con tarea multi-capa **re-delegó en cadena** → los hijos corrieron en el MISMO working tree en paralelo con el controlador (commits/amends/pushes/checkouts cruzados). Convergió bien pero es peligroso. Para tareas multi-archivo: inline, o **un subagente por capa** (shared/backend/mobile secuenciales), o `isolation:"worktree"`. Siempre verificar el estado real (git log/tests), no el reporte.

## 0a-next. ✅ HECHO esta sesión (2026-07-11/12): vc8 + /download + fixes de sesión + español + datos de salud

Todo mergeado en `main`, backend deployado, y entregado (APK vc8 + OTAs). Specs/planes en `docs/superpowers/` (fechados 2026-07-10/11). **0 PRs abiertos, prod sano.**

- **#100 campana en background** — `expo-notifications` (NATIVO → forzó vc8): notif local al fin del descanso (`mobile/src/session/restNotification.ts` + `src/notifications/setup.ts` con handler que suprime el sonido en foreground → sin doble campana; la campana JS de `expo-audio` sigue para foreground). Atada al ciclo de vida de `restUntil` (skip/pausa/reanudar/terminar cancelan; cambiar de ejercicio la mantiene). Incluye el bump **TS7 en el móvil** (esta vez a propósito; el build nativo re-basa el fingerprint igual). Limitación: force-stop/swipe-away puede matar la alarma en algunos OEMs.
- **APK vc8** — buildeado local (método [[local-android-build]]; `eas build --local` anduvo por el camino primario), cert `0470…769f7` (instala como update sobre vc7), versionCode 8, fingerprint `88cc46dd…`. Release público `mobile-vc8`: `https://github.com/thusspokedata/pulsia/releases/download/mobile-vc8/pulsia-vc8.apk`. Activado con `PUT /app/latest`.
  - **Gotcha de activación:** `/app/latest` está detrás de `auth` → el PUT necesita **token de sesión válido ADEMÁS** del `X-Admin-Token`. Vía usada: registrar un **usuario ops descartable** (`POST /auth/register` con `INVITE_CODE` → token) + `X-Admin-Token` de `deploy/app.env`. Usuario ops creado: **`ops-releases@pulsia.internal`** (el usuario pidió DEJARLO para futuras activaciones). Alternativa más limpia a futuro: sacar el PUT de `auth`.
- **#99 página `/download` con QR** — ruta pública en el backend (registrada FUERA de `auth` en `app.ts`), lee `app_release`, renderiza HTML self-contained + **QR SVG** (`qrcode`) al APK directo. En vivo: `pulsia.lahuelladelcaminante.de/download`. Escapa/valida `apkUrl` (solo http/https; anti-XSS aunque sea admin-only).
- **#101 fixes de sesión (OTA)** — "Terminar serie" **guarda directo** con las reps del plan (antes había que tocar +1/−1: `endSet` era no-op sin serie abierta → ahora `onEndSet` materializa la serie); el "Sugerido" ya no desalinea el input RPE (`alignItems: flex-start`). CodeRabbit encontró un bug real (la notif nativa disparaba en la pantalla de resumen porque `onFinish` no limpiaba `restUntil`) → arreglado.
- **#102 nombres de ejercicios en español (OTA)** — mapa `EXERCISE_NAMES_ES` (230, en `shared/src/catalog/exercises.es.ts`, **separado del catálogo auto-generado** para que regenerarlo no lo pise) + helper `exerciseNameEs` (con guard de own-property). La sesión muestra **español (principal) + inglés (secundario)**; el inglés estándar sirve para buscar en el reloj.
- **#103 datos de actividad/salud (OTA + deploy)** — métricas nuevas SIN migración (modelo tipado extensible): `steps`/`floors`/`sleep_hours`/`sleep_quality`/`resting_hr` (`ACTIVITY_METRIC_TYPES`) + `stress`/`mood`/`energy` (`SUBJECTIVE_METRIC_TYPES`), en `shared/src/schemas/metrics.ts`. Progreso: **dos secciones nuevas** + **selector de fecha JS puro** (`◀ día ▶` + "Hoy", mediodía como `measuredAt`, sin días futuros) para **backfillear días olvidados** — SIN dep nativa (OTA-safe; `MetricReading.measuredAt` ya lo soportaba). `buildProgressSummary` ahora separa **tendencia** (delta, composición/presión) de **flujo diario** (`FLOW_METRIC_TYPES` → promedio últimos 7 días + alertas: `3 de 7 noches < 6 h`, `días < 8.000` pasos; umbrales como constantes en `progress.ts`). **Peso single-source**: sacado del prompt (`prompt.ts`), el perfil queda como semilla/fallback en `buildProgressSummary`. **Sexo** opcional en el perfil (`sex` enum en `TrainingProfileSchema`, chips en `perfil.tsx`, una línea en el prompt).

### Coros / push a relojes (decidido: FUTURO, spec propio)
El usuario quiere a futuro (a) que los nombres coincidan con Coros cuando use Coros y (b) mandar el programa al reloj. Investigado: **viable** para ambos (Garmin Training API / Coros Training Hub API — hasta hay un [MCP comunitario que empuja fuerza a Coros](https://github.com/cygnusb/coros-mcp)), pero requiere **acceso de partner/dev + OAuth** → proyecto propio, no ahora. Los nombres del catálogo ya son estándar (Coros los reconoce), por eso NO se armó un catálogo Coros.

### Backlog / próximo
- **Datos de salud — Next** (un agente hizo un catálogo priorizado, ver la conversación): seguir con **nutrición** numérica (protein/kcal/agua como métricas, antes del pipeline de fotos — fase 2); a futuro **auto-captura** vía Health Connect / Garmin / Coros (las métricas manuales se auto-llenan, misma tabla) + HRV + **readiness score** compuesto (norte [[athlete-ai-memory]]); check-in subjetivo ya está.
- **Menores pendientes:** mostrar el último peso de Progreso EN el perfil (se relabeló el campo pero no se muestra el valor live); upsert-por-día de métricas diarias (hoy append); escalas 1–5 con selector visual; extender el selector de fecha a composición corporal/presión.
- **Batch 3 — rutinas propias:** constructor manual (elegir ejercicios del catálogo + series/reps/descanso). Feature grande, spec propio.
- **Fases de progreso:** Fase 2 = comidas (foto + IA); Fase 3 = respiración/relajación + coach proactivo.

## 0b. Estado de la sesión 2026-07-09 (leer primero)

Arranque: la app era single-user (`SINGLE_USER_MODE=true`), solo LAN (`http://192.168.178.47:3011`), sin login. Esta sesión la llevó a **producción multi-usuario en internet**. Todo mergeado en `main` (con review CodeRabbit; `@claude` si throttled) y deployado.

**Mergeado esta sesión, en orden:**
- **Entreno puntual expandido** (#71 backend + #72 mobile): el one-off pasó de 1 músculo + gym/casa a **multi-músculo + tiempo elegible (chips+custom) + equipo explícito (multi-select sembrado por lugar) + notas libres** ("me duele la cintura"). `OneOffRequestSchema` tolerante a version-skew; `buildOneOffPrompt` expandido. Spec/plan `2026-07-06-oneoff-expanded-*`.
- **Feature de updates in-app ACTIVADO**: deps+config (`expo-updates`, `expo-application`, app.json updates url + `runtimeVersion` fingerprint, eas.json `channel:preview` + `autoIncrement`) + primer APK OTA-capable buildeado/hosteado. `GET/PUT /app/latest` (PUT con `X-Admin-Token` = `ADMIN_TOKEN`, timing-safe). **OJO:** la UI de "buscar actualización" NO se mergeó (solo deps+config) → el OTA llega por **auto-check nativo al abrir** (cerrar/reabrir la app 2x).
- **Auto-deploy a la Pi**: `.github/workflows/deploy.yml` ACTIVO (push a `main` → runner self-hosted `pi-nextcloud-pulsia` → rsync + `docker compose up -d --build` + health check). Un merge a `main` **deploya solo el backend**.
- **Fix del banner de sesión en curso** (#75, entregado por **OTA**): estaba bajo la barra de estado (intocable) → safe-area + botón claro + días no-activos deshabilitados.
- **MULTI-USUARIO GO-LIVE** (lo grande):
  - #76 backend: key de IA **del server** (`ANTHROPIC_API_KEY`) con override por usuario (`resolveAiKey`, en `backend/src/ai/resolveKey.ts`); script `backend/src/scripts/claim-single-user.ts <email>` (migra los datos del usuario por defecto al owner, atómico).
  - #77 mobile: **login/registro/logout** (token en `expo-secure-store`, `Authorization: Bearer` en `apiFetch`, guard en `app/_layout.tsx`, manejo de 401 vía `src/auth/unauthorized.ts`), URL default `https://pulsia...`, `usesCleartextTraffic:false`. → **APK vc7**.
  - **Cutover**: `SINGLE_USER_MODE=false` + `ANTHROPIC_API_KEY` en `deploy/app.env` de la Pi → redeploy; owner (`a.saleme@pm.me`) se registró + se corrió `claim-single-user` (6 programas + 3 sesiones migrados); exposición a internet (ver §9).
- **Fix de seguridad de `/sessions`** (#79): estaba FUERA del middleware `auth` (público al exponer) + usaba `SINGLE_USER_ID` hardcodeado (el historial daba vacío tras migrar). Ahora `app.use("/sessions", auth)` + `c.get("userId")` + 409 si el id de sesión es de otro usuario. **LECCIÓN**: al salir de single-user, revisar que TODOS los routes estén en `auth` y usen `c.get("userId")`, no `SINGLE_USER_ID`.
- **Generación asíncrona** (#80 parcial → #81 backend + #82 mobile, definitivo): generar daba "no se pudo conectar" en el móvil (la request de ~60-130s la cortaba okhttp/NAT → **HTTP 499**). Solución: `POST /programs/generate-async` → `{jobId}` al instante + genera en background (`runGenerationJob`, floating promise) + `GET /programs/generate-async/:jobId` para pollear (valida UUID + stale-job fallback >10min). Mobile: `generando.tsx` pollea cada 3s (resiliente a blips), entregado por **OTA**. El `POST /programs/generate` sync quedó por back-compat. Spec/plan `2026-07-09-async-generation-*`.

**Distribución de la app:** APK **vc7** con login en el release `mobile-vc7`: `https://github.com/thusspokedata/pulsia/releases/download/mobile-vc7/pulsia-vc7-login.apk` (versionCode 7, firmado con keystore EAS, canal `preview`, runtime `aeaa36d9d2804bb839034776f9929c94bfca26d0`). Cambios de **JS puro → OTA**; cambios nativos → build nuevo (ver gotcha de build local). La familia: ese APK + el `INVITE_CODE`.

**Pendientes / decisiones abiertas:** (a) "recuperar el programa viejo" — al borrar datos de la app se pierde el plan local; no hay `GET /programs/latest` para re-bajarlo del backend → hoy la vía es regenerar. (b) Async para `/programs/generate-oneoff` (mismo patrón, YAGNI hasta que moleste). (c) `/app/latest` quedó detrás de `auth` (solo post-login) y apuntando a vc4 — un PUT a vc7 requiere token de sesión además del `X-Admin-Token`.

> Working tree: ` M .gitignore` (`.superpowers/`, modif PRE-EXISTENTE del usuario) y ` M ONBOARDING.md`
> (este doc) — **NO commitear** (dejar como working-tree). Rama al cerrar: `main`. **Sin PRs abiertos.**

**Gotchas de tooling (vigentes 2026-07-09):**
- **`eas-cli` + red flaky (importante):** `bunx eas-cli` (corre bajo Node) falla intermitente con
  `GraphQL request failed` / `ETIMEDOUT` — IPv6 roto a `api.expo.dev` (curl y bun andan por IPv4).
  Usar **`bunx --bun eas-cli`** (runtime bun) para `update`/`whoami`. Para `build --local` bajo bun
  rompe el spawn del plugin → **build 100% offline con gradle** (extraer el keystore de EAS del job spec
  + prebuild + `gradlew assembleRelease` con firma inyectada). Todo el método en la memoria
  [[local-android-build]] (incluye el fix `~/.gradle/gradle.properties` con `MaxMetaspaceSize=1536m` sin
  el cual el build revienta por Metaspace, y restringir ABIs a `arm64-v8a,armeabi-v7a`). Build local gratis
  = bypass de la cuota de EAS cloud. Cuenta EAS: `belregistro`.
- **OTA (JS puro):** publicar con `cd mobile && bunx --bun eas-cli update --branch preview --environment
  preview --message "..." --non-interactive`. El **runtime version del update debe matchear el fingerprint
  del APK instalado** (vc7 = `aeaa36d9…`); un cambio JS-only NO cambia el fingerprint. No hay UI de
  "buscar actualización" → el usuario **cierra/reabre la app 2 veces** (chequeo nativo al abrir: 1ra baja,
  2da aplica). Ver [[update-feature-status]].
- **usesCleartextTraffic ahora FALSE** (vc7): la app habla **HTTPS** a `pulsia.lahuelladelcaminante.de`.
  Al upgradear desde un APK viejo puede quedar una URL LAN `http://192.168.178.47:3011` guardada en
  AsyncStorage → error "CLEARTEXT communication not permitted" y no se puede cambiar (login bloquea
  Configuración) → **borrar datos de la app** (o reinstalar). Instalación fresca no lo sufre.
- **Generaciones largas de la IA:** ya NO se hacen síncronas desde la app (async con polling). El límite
  no era nginx (`proxy_read_timeout 300s`) sino el cliente móvil (okhttp/NAT cortan a ~60s → 499).
- **CodeRabbit / review (memorias [[coderabbit-rate-limits]], [[code-review-polling]], [[workflow-prs-coderabbit]]):**
  `.coderabbit.yaml` con `auto_incremental_review: false` → tras un push nuevo, `@coderabbitai review`
  dispara el review incremental. **Severidad**: menores → fix + merge; **mayores → fix + NUEVO review**.
  `@claude review` si CodeRabbit está caído. Nunca mergear sin al menos un review. Un review limpio no
  deja el marcador "Actionable comments posted".
- **Deploy:** un merge a `main` **auto-deploya el backend a la Pi** (workflow `deploy.yml`; el contenedor
  auto-migra: CMD `db:migrate && db:seed && start`). Tras mergear un PR de backend, verificar la salud del
  deploy (`ssh nextcloud 'curl -s localhost:3011/health'` o por el VPS: `ssh vps 'curl -s http://10.8.0.2:3011/health'`).
  La Pi (`ssh nextcloud`) a veces da "Host is down" transitorio → reintentar. Ver [[autonomous-deploy-boundary]].
- **Firma de la app:** todos los builds (vc4/vc6/vc7) usan el **mismo keystore de EAS** (cert SHA-256
  `0470…769f7`) → instalan como update uno sobre otro. Mantenerlo.

## 1. Qué es Pulsia

App para registrar actividad física y de vida, integrada con Garmin/Polar. **Foco actual:
entrenamiento** (generador de rutinas con IA + registro de sesión en vivo). El generador, a partir
de un perfil, arma un programa de gimnasio + su equivalente para casa, con nombres de ejercicios
compatibles con Garmin.

**Roadmap del producto (orden del usuario, guardado en memoria `product-roadmap`):**
1. **Entrenamiento** (foco actual). 2. **Comidas** (foto + IA). 3. **Estrés** (meditación/respiración
+ métricas de estrés de Garmin). 4. **Estado holístico** — cruzar todos los datos y sacar
conclusiones. Todo converge en un registro por día/sesión reutilizable por el análisis.

El usuario (kilo) es dev, hostea en su Raspberry propia (`nextcloud`, acceso por LAN/VPN WireGuard),
prefiere control y privacidad (NO exponer la Mac). Posible salida comercial a futuro. Tiene Android.

## 2. Arquitectura (monorepo Bun)

Workspaces en `/Users/kilo/desarrollo26/pulsia`:
- **`shared/`** (`@pulsia/shared`): schemas Zod (fuente de verdad): `TrainingProfileSchema`,
  `ProgramSchema`, **`WorkoutSessionSchema`/`SessionExerciseSchema`/`SetLogSchema`** (registro de
  sesión), catálogo `EXERCISE_CATALOG` (~230, generado del FIT SDK). Tests `bun test`. Ojo: `zod` NO
  se resuelve directo desde `mobile/` (usar los schemas de `@pulsia/shared`, no `import { z }`).
- **`backend/`** (`@pulsia/backend`): Hono + Bun + Postgres (pgvector) + Drizzle. Genera programas
  con Claude (`claude-sonnet-4-6`, tool use, `max_tokens` 16000, ~60-130s) — la generación es
  **asíncrona** (`POST /programs/generate-async` → job + polling, tabla `generation_jobs`; el POST sync
  sigue por back-compat). Auth multi-usuario con sesiones + `requireAuth` (ver §3). **Dockerizado**
  (`backend/Dockerfile`, `deploy/`; auto-migra al arrancar). Tests `bun test`.
- **`mobile/`** (`@pulsia/mobile`): Expo SDK 57 + expo-router + TanStack Query + AsyncStorage. Target
  **Android** (APK vía EAS). Tests con **jest** (`jest-expo`), correr con `--runInBand` (en paralelo
  da timeouts flaky por contención). Acento coral `#D85A30`, tokens en `mobile/src/theme/tokens.ts`.

## 3. Estado actual (todo en `main`)

- **Generador** funcional end-to-end (probado en vivo desde el teléfono).
- **Mobile**: config (URL+API key), perfil, generación (timeout cliente **240s**, ver #29), **viewer
  del programa** (#28: semanas, toggle gym/casa, ejercicios, "Copiar a Garmin").
- **Sub-proyecto A — registro de entrenamiento (COMPLETO):**
  - **#31 backend**: tablas `workout_session`/`session_exercise`/`set_log` (cascade), endpoints
    `PUT /sessions/:id` (upsert idempotente) + `GET`. `hr_avg`/`hr_max` por serie reservados (nulos)
    para el sub-proyecto B.
  - **#32 mobile datos**: `putSession`, storage (sesión activa + cola de pendientes upsert-por-id),
    **motor puro** (`src/session/engine.ts`: tapRep/tempo, endSet, editSet, skip, finish), flush de sync.
  - **#35 mobile UI**: pantalla `app/sesion.tsx` (Layout A — tap por rep, timers, peso/RPE, editar
    series, terminar → persist + sync), entrada "Empezar entrenamiento" + banner de resume, seam
    `newSessionId` (expo-crypto), y `programId` guardado al generar.
  - Diseño offline-first: se captura en el teléfono, se sincroniza al reconectar (idempotente por id).
- **Auth MULTI-USUARIO: LIVE (2026-07-09).** Backend: sesiones + `requireAuth` en
  `/settings`/`/programs`/`/profile`/`/memory`/`/app`/**`/sessions`**, `/auth/register|login|logout`
  (registro con `INVITE_CODE`), scoping por usuario. Mobile (vc7): login/registro/logout, token en
  `expo-secure-store`, guard en el layout, manejo de 401. **`SINGLE_USER_MODE=false`** en la Pi (el flag
  sigue en `config.ts`/`app.ts` por si se quiere volver a single-user en dev). Key de IA: del server
  (`ANTHROPIC_API_KEY`) con override por usuario (`resolveAiKey`). Ver §0b + memoria [[multiuser-auth-status]].

## 4. Rumbo vigente

- **App en producción multi-usuario en internet: LOGRADO.** El owner y la familia la usan por
  `https://pulsia.lahuelladelcaminante.de` con el APK vc7.
- **HR en vivo por banda BLE: HECHO** (sub-proyecto B, avg/max por serie, verificado en device).
- **Próximo (a elección del usuario):** (a) "recuperar programa" (endpoint + carga desde backend);
  (b) v-next de la **memoria del atleta** (estructurada/edición/Garmin, ver [[athlete-ai-memory]]);
  (c) **PT agent** conversacional; o (d) **dominio 2 del roadmap: Comidas** (foto + IA). Ver §8 y
  memoria [[product-roadmap]].

## 5. Cómo correr / operar

**Dev local** (Mac, con `export PATH="$HOME/.bun/bin:$PATH"`):
```bash
docker compose up -d                         # Postgres+pgvector dev (raíz)
cd backend && bun run db:migrate && bun run db:seed && bun run start   # :8787
cd mobile && bunx expo start --host lan --clear   # NO --localhost (bindea IPv6)
```
Tests: root `bun test shared backend`; mobile `cd mobile && npm test -- --runInBand`.

**Producción (internet, YA desplegado):** ver §9. Backend público en
**`https://pulsia.lahuelladelcaminante.de`** (multi-usuario, HTTPS). Auto-deploy en push a `main`.

**APK Android (vc7 con login):** config EAS en `mobile/` (`eas.json` perfil `preview` → APK; `app.json`
con `android.package` + `projectId` + `usesCleartextTraffic:false` + `updates.url` + `runtimeVersion`
fingerprint + `channel:preview`). La app ya trae la URL de prod por default (`src/config/backend.ts`);
el usuario solo se registra con el `INVITE_CODE`. Build local gratis (bypass cuota EAS): ver
[[local-android-build]]. Cambios de JS puro se entregan por **OTA** (no requieren build).

**Dev build (necesario para BLE / sub-proyecto B):** el APK `preview` no incluye BLE. Para HR por
banda hace falta un dev client:
`cd mobile && bunx eas-cli build -p android --profile development` → instalar el APK →
`bunx expo start --dev-client`. Emparejar la banda en Configuración → "Banda de pulso".

## 6. Convenciones (IMPORTANTE)

- **Flujo por PRs revisados por CodeRabbit.** Rama por PR; NUNCA commitear features directo a `main`.
- **Auto-merge autorizado** (dado por el usuario esta sesión): tras review REAL de CodeRabbit (no
  solo el aviso de rate-limit) y sin comentarios/threads abiertos, **mergear solo (squash)**. Siempre
  aplicar primero los cambios que pida. Si un PR nuevo no recibe review (rate-limit), **`@coderabbitai
  review`** en el PR lo destraba. (Ver memoria `workflow-prs-coderabbit`.)
- **Ejecución subagent-driven siempre** (memoria `execution-subagent-driven`). **NUNCA preguntar qué modo
  de ejecución** — arrancar directo subagent-driven (pedido explícito del usuario, 2026-07-12). Nota: los
  subagentes a veces re-delegan y no terminan → verificar el estado real (git log/tests) y completar directo si hace falta.
- **Commits firmados `git commit -S`.** NUNCA atribución a Claude/Anthropic ni Co-Authored-By.
- **TDD** siempre. Specs en `docs/superpowers/specs/`, planes en `docs/superpowers/plans/`.

## 7. Gotchas de tooling (ya resueltos)

- **Bun + jest + RN:** `jest` pinneado a 29; `transformIgnorePatterns` al store de Bun. Correr jest
  **`--runInBand`** (en paralelo, timeouts flaky). Tests en `mobile/__tests__/`, NUNCA en `mobile/app/`.
- **Worktrees no comparten `node_modules`** → `bun install --force` en cada worktree nuevo antes de tests/eas.
- Tests que importan `expo-router` → `jest.mock`; vars dentro de `jest.mock()` con prefijo `mock`.
- **`zod` no resuelve desde `mobile/`** (layout del store de Bun) → validar con `WorkoutSessionSchema.safeParse`, no `import { z }`.
- **Android bloquea HTTP cleartext** en release. Ahora la app va por HTTPS (`usesCleartextTraffic:false`
  en vc7). Si se necesita apuntar a un backend LAN `http://` en dev, hay que volver a poner `true` + rebuild.
- **Backend requiere `INVITE_CODE`** (auth) al boot → está en `app.env` de la Pi.
- `z.string().uuid()` de zod 4 exige UUID RFC 4122 válido (los ids de sesión son v4 de `expo-crypto`).

## 8. Backlog (pendientes / ideas)

> ⚠️ **Muchos ítems de abajo ya están HECHOS** (C5 entero, sub-proyecto C, memoria del atleta v1, %
> cumplimiento, sugerencia de peso, C6/entreno puntual **expandido**, sub-proyecto B/BLE, feature de
> **updates in-app**, **generación async**, **auth multi-usuario + exposición a internet**). **El estado
> real 2026-07-09 está en §0b** — esta lista quedó desactualizada; usar §0b como fuente de verdad.

- **[Sub-proyecto B — HECHO ✓]** HR en vivo por banda BLE (perfil estándar 0x180D), avg/max por
  serie. Verificado en dispositivo (preview build + banda Polar/Garmin).
- **[Backlog B]** curva de HR completa (serie temporal), HRV/RR por PMD Polar (dominio estrés),
  marca de calidad de cobertura del dato. Ver spec 2026-07-03-hr-ble-banda-design.md §9.
- **[Polish pass + Sesión v2 — HECHO ✓ en `main`]** (#47, + fixes de review en #49). Polish: permiso
  BLE runtime automático; escaneo con feedback/timeout; ⚙ Configuración al header; íconos de tabs; sin
  botón "Copiar a Garmin". Sesión v2: ejercicio activo explícito + lista con ✓; botones ±1/±5 reps;
  rótulos Peso(kg)/RPE; descanso con cuenta regresiva + campana; **Cancelar** con confirmación.
- **[Sub-proyecto C — experiencia de sesión y post-entrenamiento]** (orden acordado):
  - **C2 — Resumen post-entrenamiento — HECHO ✓ en `main`** (#48): `src/session/summary.ts` (puro) +
    `components/SessionSummary.tsx`. Tiempo/work/rest, % cumplimiento, series/reps/volumen, carga,
    avg/max HR, por músculo, tabla por serie. (El % NO está en la lista del historial todavía — la
    proyección liviana no lo trae; incremento chico de backend si se quiere.)
  - **C3 — Mapa corporal — HECHO ✓ en `main`** (#55): `src/session/muscleMap.ts` (puro, `MUSCLE_MAP`
    `Record<MuscleGroup,…>` exhaustivo sobre los **12** grupos — ojo `forearms`) + silueta con
    `react-native-body-highlighter`/`react-native-svg` dentro del `SessionSummary` (reemplaza la lista
    "por músculo"). Nativo → requiere nuevo preview build para verlo.
  - **C1 — Pausar + indicador global — HECHO ✓ en `main`** (#56): Pausar/Reanudar (el timer no cuenta
    el descanso; el countdown respeta la pausa vía `restRemainingRef`), estado en `storage/pauseState.ts`,
    banner global `components/SessionIndicator.tsx`. (Cancelar la sesión ya estaba en Sesión v2.)
  - **C4 — Historial — HECHO ✓ en `main`** (#50) + **eliminar HECHO ✓** (#52). Lista → tap → resumen.
    Backend `GET /sessions` (liviano) y `GET /sessions/:id` (completo). ⚠️ Fix del cartel "No se pudo
    eliminar" SIN commitear (ver §0b).
  - **C5 — Notas de sesión → IA**: espacio de anotaciones por sesión (el campo `notes` de
    `WorkoutSession` ya existe, sin UI). Las notas recientes deben **alimentar la generación** del
    próximo plan (backend incluye notas + datos reales en el prompt de Claude). Se solapa con el
    ítem de backlog "[PT agent] entrenador conversacional". Toca mobile + backend.
  - **C6 — Entrenamiento puntual (one-off)**: generar un entreno de **un día** eligiendo músculos +
    gym/casa (mismo cuestionario de equipo), **sin tocar el plan vigente**. Para viaje/vacaciones.
    Nuevo flujo/endpoint de generación acotado. Toca mobile + backend.
- **[Deployment] CI para la Pi**: `deploy.yml` (self-hosted runner en `/home/kilo/actions-runner`,
  deploy en push a `main`) + `ci.yml`. Hoy el deploy es **manual** (rsync + `docker compose up -d --build`).
- **[Deployment] Backup de la DB de Pulsia a la pi-respaldo** (pedido del usuario, sin apuro): job
  cron con `pg_dump` → comprimir → `rsync/scp` a la pi-respaldo, con rotación (tipo `nc-db-backup`).
- **[Integración Garmin] Ingesta de datos pasivos**: sueño, composición corporal (balanza Index),
  HRV, FC en reposo, **estrés** → Garmin Health API (OAuth; ⚠️ requiere aprobación del programa dev).
  Alternativa: import `.FIT`. Transversal a entrenamiento/estrés/estado holístico.
- **[Integración Garmin] Empujar workouts (Training API)**: el botón "Copiar a Garmin" (copiaba
  nombres al portapapeles) **se elimina** — Garmin Connect NO permite pegar/importar un entreno, así
  que no servía. El camino real para mandar el programa al reloj es la **Garmin Training API** (OAuth
  + aprobación del dev program). Proyecto aparte, v-next.
- **[FEATURE] Sugerencia de peso inicial por ejercicio**: sobre el historial de kg reales (depende
  del registro A). v1 regla determinista → v2 contexto (RPE/descanso) → v3 IA.
- **[PT agent] Entrenador conversacional** sobre Claude: ajusta el plan según sesiones reales,
  sugiere pesos, responde técnica. Se apoya en A + Garmin. v-next.
- **[Memoria del atleta — NORTE DE PRODUCTO]** La IA debe **construir y persistir en la DB una
  "memoria" evolutiva de la persona** (no el perfil estático): acumular conocimiento real del atleta
  a partir de notas + rendimiento + Garmin, **actualizarla con el tiempo** y usarla en cada generación,
  para tener conocimiento real de la persona. La app debe tener un **botón/pantalla para que el usuario
  vea esa memoria** ("qué sabe la IA de mí"). **C5 (notas + rendimiento reciente → prompt) es el primer
  paso** hacia esto; la memoria persistente/resumida es el sub-proyecto siguiente (tabla de memoria +
  proceso de actualización/summarización periódica + UI de lectura). Se solapa con [PT agent].
- **[Comidas]** dominio 2 del roadmap: registrar alimentación con foto + IA.
- **[Estrés]** dominio 3: meditación/respiración + métricas de estrés de Garmin.
- **[Backend] Generación async/streaming**: hoy síncrona ~130-150s. Spec escrito
  (`docs/.../specs/2026-07-01-generacion-async-jobs-design.md`) — jobs persistidos + polling + barra
  por tiempo. Rama local `docs/generacion-async-spec` (sin PR).
- **[Auth] Mobile de auth**: login/registro (con `INVITE_CODE`), token en secure-store, navegación
  gateada → apaga `SINGLE_USER_MODE`. Spec `2026-07-01-auth-multiusuario-design.md`.
- **[Backend] max_tokens/nº de semanas configurable** en el perfil.
- **[UX] Feedback al guardar perfil** ("Perfil guardado ✓"). **[Fase 4] Detalle de ejercicio**
  (imágenes free-exercise-db + cues). **[Cosmético] Ícono/logo** (hoy placeholder de Expo).
- **[Datos ambientales]** temp/humedad/presión/luna por sesión → estudio de rendimiento (merece spec).
- **[Historial visual — heatmap anual]** Grilla estilo "contribuciones de GitHub": todos los
  entrenamientos realizados **por año**, con **selector de año**. Cada celda = un día; intensidad por
  volumen/series (o simplemente hecho/no). Vista de la constancia de un vistazo. (Pedido del usuario
  con captura de referencia.)

## 9. Deployment en la Pi (HECHO — deploy manual v1)

La Pi es `nextcloud` en `~/.ssh/config` (`ssh nextcloud`, aarch64, user `kilo`, Docker 29 + Compose v5,
SSH por on-disk keys). Corre apps como docker-compose en `/home/kilo/<app>/`. Tiene un GitHub Actions
self-hosted runner (`/home/kilo/actions-runner`).

**Pulsia desplegado en `/home/kilo/pulsia/`:**
- `deploy/docker-compose.yml`: `backend` (build `backend/Dockerfile`, Bun arm64, **usuario no-root**)
  + `db` (pgvector, healthcheck, volumen `deploy_pulsia_pgdata`, 5432 NO expuesto). Publica **`3011`**.
- `deploy/app.env` (solo en la Pi, no versionado): `DATABASE_URL` (host `db`), `ENCRYPTION_KEY`
  (`openssl rand -hex 32`), `PORT=8787`, `INVITE_CODE`, **`SINGLE_USER_MODE=false`**,
  **`ANTHROPIC_API_KEY`** (key del server, fallback si el usuario no cargó la suya), **`ADMIN_TOKEN`**
  (para `PUT /app/latest`). Cada usuario puede overridear su key de IA desde la app (encriptada en la DB).
- **Deploy: automático** en push a `main` (`.github/workflows/deploy.yml`, runner self-hosted en la Pi).
  Manual (fallback): `rsync` del repo (sin `mobile`/`node_modules`, sin pisar `app.env`) →
  `cd ~/pulsia && docker compose -f deploy/docker-compose.yml up -d --build`. El contenedor auto-migra.
- La DB es **separada de la de Nextcloud** (esa es MariaDB `nextcloud-db-1`); Pulsia usa su propia Postgres.

**Exposición a internet (2026-07-09, HECHO):** el backend es público en
`https://pulsia.lahuelladelcaminante.de`. Patrón (reusa el de las otras apps de la Pi): **VPS** (`ssh vps`,
`187.33.155.194`, Ubuntu) corre **nginx** público (:80/:443) que hace `proxy_pass http://10.8.0.2:3011`
(la Pi por **Wireguard**) + **HTTPS por certbot** (Let's Encrypt, auto-renueva) + `limit_req` en `/auth/`.
Site en `/etc/nginx/sites-available/pulsia.lahuelladelcaminante.de` en el VPS. **Firewall de la Pi**:
`/usr/local/sbin/wg0-firewall.sh` (systemd `wg0-firewall.service`) permite wireguard solo a los puertos
`3006:3011` (se extendió de `3006:3010` para incluir el 3011 de Pulsia; persiste en reboot). DNS:
`pulsia.lahuelladelcaminante.de` → `187.33.155.194` (en clouding.io). La app usa esa URL HTTPS por default.
(Quedó `so_keepalive=20s` en el listen 443 y un `pulsia_timed.log` — instrumentación de diagnóstico, inofensivos.)

## 10. Índice de docs

- Specs (`docs/superpowers/specs/`): los viejos (generador, app-mobile, auth-multiusuario, registro) +
  los de esta sesión: **`2026-07-05-app-updates-design`**, **`2026-07-06-oneoff-expanded-design`**,
  **`2026-07-07-multiuser-auth-design`**, **`2026-07-09-async-generation-design`**.
- Planes (`docs/superpowers/plans/`): los correspondientes (`2026-07-06-oneoff-expanded`,
  `2026-07-07-multiuser-auth`, `2026-07-09-async-generation`, etc.). `docs/deploy-ci-setup.md` = setup del
  runner de auto-deploy.

## 11. Memoria persistente (fuera del repo)

`~/.claude/projects/-Users-kilo-desarrollo26-pulsia/memory/` → `MEMORY.md` (índice). Revisar al arrancar:
`workflow-prs-coderabbit` (PRs + CodeRabbit), `execution-subagent-driven`, `product-roadmap`
(entrenamiento → comidas → estrés → estado holístico), `coderabbit-rate-limits`, `athlete-ai-memory`
(norte: memoria evolutiva del atleta), `code-review-polling` (timer + escalar a `@claude` + severidad),
`autonomous-deploy-boundary`, **`multiuser-auth-status`** (estado del multi-usuario + exposición + async
+ el bug de `/sessions`), **`local-android-build`** (build offline gratis + gotcha de red de eas-cli),
**`update-feature-status`** (APK vc4→vc7, OTA, `/app/latest`).
