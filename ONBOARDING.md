# Pulsia — Onboarding / Handoff

> Documento de contexto para retomar el proyecto en una sesión nueva. Última actualización: **2026-08-23**.
>
> El **historial detallado de sesiones** (los bloques `§0-*` fechados, "✅ HECHO …", del 2026-07-09 al 2026-08-22) se archivó en **[`docs/ONBOARDING-HISTORY.md`](docs/ONBOARDING-HISTORY.md)** para mantener este handoff enfocado en lo durable. Acá quedan el **estado actual** (§0, abajo) y la **referencia estable** (§1–§11). Para el "porqué" y el detalle de cada feature entregada: el historial, el `git log`, o la memoria persistente (§11).

## 0. Estado en una línea

**Pulsia está EN INTERNET, multi-usuario, con login.** Backend en **`https://pulsia.lahuelladelcaminante.de`** (VPS nginx → Wireguard → Pi:3011, HTTPS por certbot, rate-limit en `/auth/`). La app (Android, **APK vc10**; los cambios **JS-only** llegan por **OTA**, los nativos requieren un APK nuevo; **abre por defecto en la pestaña Nutrición**, la más usada — §0-DEFAULT-TAB) tiene 3 dominios grandes (más un **perfil** que ya sirve a quien **no quiere entrenar**: un modo **"solo seguimiento"** que oculta el plan y la tab Programa, **fecha de nacimiento** con edad auto-derivada, y el objetivo **"Recomposición"** — §0-PERFIL): **(1) Entrenamiento** — genera programas async —con una capa que **explica el porqué del plan** (objetivo de trabajo editable + rationale determinista de la meta calórica + rationale de la IA por día y global del programa, ver [[coach-1-plan-explicado-status]])—, registra/resume/revisa sesiones (a mano en la app **o importando un `.FIT` de fuerza del reloj**, que se guarda como `workout_session` con ejercicios/series y entra a 1RM/volumen/informe — ver §0-FIT-FUERZA; un import ya muestra el **resumen completo** —tiempo, volumen, reps, FC media/máx, curva de FC, detalle por serie y mapa corporal— igual que una sesión registrada en la app, ver §0-FIT-RESUMEN); **el registro de sesión sincroniza de forma fiable** —re-flush al abrir/enfocar la app + estado visible "Guardado ✓ / Pendiente" con reintento, ver [[ses-1-sync-fiable-status]]—, HR por banda BLE, resumen con mapa corporal + FC, español+inglés, memoria del atleta, entreno puntual, **cardio/actividades** (manual o import `.FIT`, ya entra al balance de nutrición, con **pantalla de detalle** —tiles, gráficos de FC/cadencia/respiración/Body Battery y tiempo en zonas— y **reprocesamiento** del `.FIT` guardado), y un **catálogo de 273 ejercicios** (auto-generado del SDK de Garmin) con **demostraciones animadas + cues de técnica** en 86 de ellos, accesibles desde el Programa, la sesión, un buscador y el selector de alternativas; **(2) Nutrición** (tab "Nutrición", **COMPLETO** — ver §0-HOY-PREVIA): alta de alimentos por **foto + IA** (Opus visión) **o escribiendo el nombre** ("almendra"; la búsqueda es **insensible a acentos** — "platano" encuentra "plátano") → catálogo personal (con chip **etiqueta/estimado/USDA** —el catálogo compartido ya trae los **~114 ingredientes base** de las listas de intercambios, sembrados desde USDA con procedencia `usda`, §0-SEED-CATALOGO— y **semáforo nutricional** por alimento: chips de alto/medio en grasa, saturadas, azúcar, sal y colesterol, fibra como positivo, con filtro "mostrame los altos en X" — ver §0-SEMAFORO; y si el alimento **no está en USDA o el match es malo**, un botón **"que la IA complete"** estima las vitaminas/minerales con **web search**, marcados como **micros IA** — ver §0-IA-MICROS; y **crear comidas/recetas reutilizables**: armás un plato con sus ingredientes y pesos → queda como un `Food` per-100g (con **peso cocido opcional** para el agua de los guisos, y el server re-deriva la per-100g desde los ingredientes), y registrás las porciones pesándolas, reusando "+ nueva comida" — ver §0-CREAR-COMIDA; y al registrar **cualquier alimento sólido** podés marcar que **lo pesaste cocido** y la app lo convierte a crudo/seco con un **factor de cocción**, ver [[nut-11-crudo-cocido-status]]) → registrar en gramos/ml/unidad con snapshot de macros/micros/colesterol/agua, **metas calóricas + de macros** desde el perfil (BMR Mifflin-St Jeor + objetivo + gasto de entrenamiento = **net calories**; el gasto además **sube la meta de carbos**, nunca la de proteína/grasa ni ningún límite de salud — ver §0-BARRAS), **barras que al pasarte muestran turquesa hasta la meta y ámbar solo el excedente**, **dashboard del día con 4 pestañas** (Resumen / Calorías con torta por comida / Nutrientes vs referencias OMS / Macros con dona), **qué alimentos aportan cada nutriente** + **su evolución en el tiempo**, **suplementos** (catálogo por foto + plan IA semanal + checklist + ajuste dinámico + **tomas ad-hoc** —un suplemento suelto ese día, con stepper de dosis— + **pausar un suplemento** momentáneamente, ver [[sup-2-flexibilidad-plan-status]]; **los micros de los suplementos tomados ahora suman al diario de nutrientes en un segmento violeta**, distinto de la comida — ver §0-SUPLEMENTOS-MICROS), tracker de líquido, un **agente de informes** (diario/semanal/quincenal/mensual con consejos, opt-in) que ahora incluye un **bloque de cobertura de micros por período** (clasifica cada vitamina/mineral en cubierto-desde-la-comida / gracias-al-suplemento / sin-cubrir, con "% solo con comida" + evolución, para ir dejando la suplementación — ver §0-COBERTURA); **(3) Progreso/Salud** — seguimiento cuantitativo (composición/presión/actividad/bienestar con backfill) + tendencias + heatmap, y **ECG (KardiaMobile)** (interpretación IA no-diagnóstica). **La IA observa** (progreso, ECG, y ahora los informes de nutrición → memoria del atleta). Owner: la cuenta principal. La familia baja el APK **vc10** desde **`pulsia.lahuelladelcaminante.de/download`** (QR) + se registra con el **`INVITE_CODE`** (valor real solo en `/home/kilo/pulsia/deploy/app.env` de la Pi). Un merge a `main` **auto-deploya el backend a la Pi**. **⚠️ El runtime OTA del móvil pasó de fingerprint a MANUAL `"11"`** (`app.json`, desde #212); todo OTA JS-only nuevo va a **runtime `11`** (verificar en la salida de `eas update`).
>
> **Además existe un FRONTEND WEB** (SPA React + Vite en el workspace `web/`, TanStack Query + Tailwind/shadcn + Recharts, auth por **cookie** httpOnly): **subís CSV de Garmin** (peso/pasos/sueño, con probe por tipo) y ves **dashboards** — métricas con **tendencias** (media móvil), el heatmap **"Días entrenados y gasto"** a **paridad con el móvil** (ver §0-WEB-HEATMAP) y el **dashboard de nutrición** (pestañas **Resumen / Diario / Suplementos** en prod; **Agua + Informes** pendientes, ver §0-WEB-HEATMAP) — reusando la **misma lógica de `@pulsia/shared`** que el móvil (coverage, metas, semáforo, motor del heatmap). Arco web (PRs #199→#216) en [[web-v1-status]] / [[web-alimentacion-status]] / [[heatmap-web-parity-status]]. El backlog operativo se migró de Fizzy a **Kan** (kanban self-hosted en la Pi; ver [[kan-kanban-pi]] — reemplaza a §0-BACKLOG-FIZZY). El **token de la REST API de Kan** (para leer/mover cards por `curl`) se lee de **`~/.kan_token`** en la Mac del owner; los valores concretos (URL LAN, token) viven en la memoria persistente [[kan-kanban-pi]], fuera de este repo público.


## 0-HISTORIAL. Historial de sesiones (archivado)

Los bloques `§0-*` con el detalle cronológico de cada sesión entregada (`✅ HECHO`, del 2026-07-09 al 2026-08-17) se movieron a **[`docs/ONBOARDING-HISTORY.md`](docs/ONBOARDING-HISTORY.md)** — ahí está el "porqué" de cada feature, los PRs, los bugs cazados y las lecciones. Este documento sigue con la referencia estable (§1 en adelante). **Nota:** cualquier mención `§0-…` que aparezca a lo largo de este handoff (p.ej. `§0-PERFIL`, `§0-WEB-HEATMAP`, `§0b`) refiere a una sección de ese archivo de historial, no de este documento.

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
  da timeouts flaky por contención). Identidad visual **"clínico fresco"** (teal `#0E7C86` + slate sobre gris frío, desde 2026-07-13; antes coral `#D85A30`), tokens en `mobile/src/theme/tokens.ts`.

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
- **Worktrees para trabajo en paralelo (preferido sobre cambiar de rama).** Cuando corren varias tareas o
  sesiones a la vez, cada una en su **git worktree** — un directorio aislado bajo `.claude/worktrees/` (vía
  `EnterWorktree`, basado en `origin/main`) —, NO cambiando de rama en el checkout compartido. Así se trabaja
  en paralelo sin pisarse: cada worktree tiene su rama y su árbol propio. ⚠️ El **snapshot de git del arranque
  puede mentir** y otra sesión puede haber tomado el checkout principal con una rama de feature y el árbol
  **sucio** (pasó el 2026-08-17: una sesión estaba en `feat/sup-2-…` con cambios sin commitear). **Antes de
  ramificar**, verificar `git status` / `git branch` y aislar en un worktree; nunca `reset --hard`/`stash`
  sobre un árbol ajeno. Memorias: `git-snapshot-stale-concurrent-session`, `subagent-parallel-writes`.
- **Commits firmados `git commit -S`.** NUNCA atribución a Claude/Anthropic ni Co-Authored-By.
- **TDD** siempre, con **verificación por mutación de cada test nuevo** (romper el código a propósito
  y confirmar que el test se queja). Specs en `docs/superpowers/specs/`, planes en `docs/superpowers/plans/`.
- **Los nombres en inglés NO son un bug.** La app mezcla español e inglés **a propósito** según la
  pantalla: la sesión muestra español (principal) + inglés (secundario), y la card del Programa
  muestra el nombre **en inglés**, porque el nombre estándar de Garmin es el que sirve para buscar
  el ejercicio **en el reloj**. Si ves `garminName` sin pasar por `exerciseNameEs`, **no lo
  "arregles"**: está así queriendo (confirmado por el owner el 2026-07-19, después de que un plan
  lo propusiera como fix).
- **El catálogo de ejercicios es AUTO-GENERADO.** `shared/src/catalog/exercises.data.ts` se regenera
  con `bun run shared/scripts/generate-catalog.ts`. **Nunca editarlo a mano**: un fix a mano se pierde
  en la próxima regeneración, y eso ya pasó (§0-ANTES-HOY). Para forzar un ejercicio usar `MUST_INCLUDE`;
  para corregir su equipamiento, `MUST_EQUIPMENT`. Las traducciones (`exercises.es.ts`) SÍ son a mano
  y están separadas a propósito. Tras regenerar: revisar el equipamiento de los nuevos y que no se
  haya perdido ningún id congelado (`catalogIds.frozen.ts`).

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
- **El SDK de Garmin descarta en silencio los campos que no reconoce.** Hay que pasarle
  `read({ includeUnknownData: true })` para que exponga los de clave numérica (`135`, `136`, `143`, `144`).
  **`143` es Body Battery** (decrece de forma monótona durante la sesión); `144` duplica `heartRate`.
  Se guardan crudos, **sin interpretar**. Y el `Encoder` del SDK **no puede sintetizarlos** (resuelve por
  nombre de perfil), así que esa cobertura se testea contra records armados a mano.
- **Las zonas de FC del `.FIT` NO están alineadas índice a índice.** `secondsPerZone` tiene 2 entradas
  más que zonas (la 0 es "por debajo de Z1", la última "por encima") y `hrZoneHighBoundary` tiene 1 más
  (termina en la FC máx). La zona `n` (1-based) usa `secondsPerZone[n]` y va de `highBoundary[n-2] ?? 0`
  a `highBoundary[n-1]`. Mapearlos 1:1 inventa una Z0 y una Z6 y corre cada rango un escalón.
  Ver `buildZoneRows` en `mobile/app/actividad.tsx` (exportada y testeada).
- **`timeInZoneMesgs` trae DOS entradas** (una por `session`, otra por `lap`): filtrar por
  `referenceMesg === "session"`, no tomar `[0]`.
- **El `.FIT` trae su propia zona horaria** (`activityMesgs.localTimestamp − timestamp`). Para cardio se
  usa ésa y NO el offset del cliente: sigue siendo correcta aunque importes desde otro huso.
- **`LineChart` renderiza "Sin datos todavía." con `data` vacío** → no montarlo para canales sin datos,
  en vez de dejar ese texto suelto.

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
- **[UX] Feedback al guardar perfil** ("Perfil guardado ✓"). **[Cosmético] Ícono/logo** (hoy
  placeholder de Expo).
- ~~**[Fase 4] Detalle de ejercicio** (imágenes free-exercise-db + cues)~~ → **REEMPLAZADO**. La
  feature sigue viva (spec `2026-07-18-gifs-ejercicios-design.md`, §0-ANTES-HOY) pero **`free-exercise-db`
  quedó DESCARTADA**: sus imágenes son scrapeadas y su licencia no es válida. No usarla.
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
el dominio público del backend. Patrón (reusa el de las otras apps de la Pi): un **VPS** (alias `ssh vps`,
Ubuntu) corre **nginx** público (:80/:443) que hace `proxy_pass` a la Pi por **Wireguard**
+ **HTTPS por certbot** (Let's Encrypt, auto-renueva) + `limit_req` en `/auth/`.
El site de nginx vive en el VPS. **Firewall de la Pi**: un script de firewall (systemd) permite
wireguard solo a un **rango acotado de puertos** (incluido el de Pulsia; persiste en reboot). DNS:
el dominio resuelve a la IP del VPS (en el proveedor de DNS). La app usa esa URL HTTPS por default.

<!-- NOTA (repo público): IPs/paths/topología concretos scrubbeados a propósito — valores reales en la memoria persistente fuera del repo. -->
<!-- Ver §0-BACKLOG-FIZZY sobre por qué este archivo NO debería llevar infra sensible. -->

Detalles concretos (IP del VPS, IP wireguard de la Pi, path del site nginx y del script de firewall,
rango de puertos, proveedor) están **fuera del repo**, en la memoria persistente.
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
