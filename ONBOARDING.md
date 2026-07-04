# Pulsia — Onboarding / Handoff

> Documento de contexto para retomar el proyecto en una sesión nueva. Última actualización: 2026-07-04 (sesión larga: sub-proyecto B HR completo + experiencia de sesión v2 + resumen post-entrenamiento (C2) + historial (C4) + eliminar sesión + workflow @claude).

## 0. Estado en una línea

**La app anda de punta a punta desde el teléfono (Android), y ya se registra + resume + revisa el
historial de entrenamientos con HR por banda BLE.** APK/preview (EAS) → backend en la **Pi**
(`http://192.168.178.47:3011`). En `main`: sub-proyecto A (registro), **B (HR por banda BLE)**,
**Sesión v2** (lista con ✓, ±reps, descanso+campana), **C2 (resumen post-entrenamiento)** y **C4
(historial)**. **Próximo:** C3 (mapa corporal en el resumen), C1 (pausar + indicador), C5/C6.

## 0b. Estado de la sesión 2026-07-04 (leer primero)

**Todo mergeado en `main` (revisado por CodeRabbit salvo donde se aclara):**
- **Sub-proyecto B — HR por banda BLE:** perfil estándar `0x180D`, avg/max por serie. `mobile/src/ble/`
  (`hrParser`, `hrAggregate`, `bandManager` con `react-native-ble-plx`, hook `useHeartRate`), storage
  `pairedBand`, permiso runtime (`ble/permissions.ts`). Emparejar en Configuración → auto-conecta en
  sesión. **Verificado en dispositivo con banda real.** Requiere preview/dev build (BLE no anda en Expo Go).
- **Sesión v2** (`app/sesion.tsx`): ejercicio activo explícito + lista con ✓ (arregla "última serie no
  editable"), botones ±1/±5 reps, rótulos Peso(kg)/RPE, **descanso con cuenta regresiva + campana**
  (`assets/bell.wav`, `expo-audio`) con toggle "Sonidos" en Configuración, botón **Cancelar** con confirmación.
- **C2 — resumen post-entrenamiento** (`src/session/summary.ts` puro + `components/SessionSummary.tsx`):
  al Terminar → tiempo/work/rest, % cumplimiento, series/reps/volumen, carga, avg/max HR, por músculo,
  tabla por serie. Se muestra al terminar y en el historial.
- **C4 — historial** (`app/(tabs)/historial.tsx`, tab nueva): lista (día/fecha/duración) desde
  `GET /sessions` (proyección LIVIANA sin exercises), tap → `GET /sessions/:id` (completa) → resumen.
  ⚠️ **Gotcha:** `listSessions` NO trae exercises; NO llamar `summarize` sobre la lista (crashea) —
  usar `getSessionById` al tocar.
- **`.github/workflows/claude.yml`** (#51): Action de `@claude` on-demand. **Fix de permisos pendiente** (ver PRs abiertos).

**PRs ABIERTOS (mergear al retomar, en este orden):**
- **#53** `fix/claude-workflow-permisos`: sube `pull-requests`/`issues` a `write`. **Sin esto `@claude`
  se queda en el placeholder "I'll analyze this and get back to you" y termina en ~2s sin revisar.**
  Mergear PRIMERO para que `@claude` funcione.
- **#52** `feat/eliminar-sesion`: **eliminar entrenamiento** (`DELETE /sessions/:id` con cascade + 🗑
  por fila en historial con confirmación). Implementado + tests verdes + diff revisado por mí, **falta
  el review-gate** (CodeRabbit estaba throttled; disparar `@claude` una vez que #53 esté en main, o
  CodeRabbit cuando libere) y mergear.
- **#54** (este): update del ONBOARDING.

**Gotchas de tooling nuevos de esta sesión:**
- **`eas-cli` con `bunx` ROMPE** (`Cannot find module 'wrap-ansi'`). Usar **`npx eas-cli`** o `npm i -g eas-cli`. `bunx expo start --dev-client` SÍ anda.
- **`expo start` en el teléfono (dev build):** el error "Failed to open app" es normal si no hay Metro corriendo. `bunx expo start --dev-client --host lan`; el teléfono con **VPN full-tunnel NO alcanza el Metro de la Mac** (sí la Pi) → probar en la MISMA WiFi sin VPN, o `--tunnel`, o USB+`adb reverse`. La Mac es `192.168.178.30`.
- **CodeRabbit throttle:** ver memoria [[coderabbit-rate-limits]] y [[workflow-prs-coderabbit]]. Repo tiene `.coderabbit.yaml` (`auto_incremental_review: false`). Un review LIMPIO de CodeRabbit NO deja el marcador "Actionable comments posted" — no confundir con "no revisó". **`@claude` review = gate válido** (aceptado por el usuario) cuando CodeRabbit está throttled.

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
  con Claude (`claude-sonnet-4-6`, tool use, `max_tokens` 16000, ~130-150s síncrono). Auth con
  sesiones + `requireAuth` (ver §3). **Dockerizado** (`backend/Dockerfile`, `deploy/`). Tests `bun test`.
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
- **Auth backend (mergeado, #23/#24/#33)**: sesiones + middleware `requireAuth` en
  `/settings`/`/programs`/`/profile`, scoping por usuario, hardening. **PERO** el auth mobile
  (login/registro) **NO existe** → se corre con el flag de abajo.
- **`SINGLE_USER_MODE` (#39, en la Pi ya activo)**: flag en `backend/src/config.ts`/`app.ts`. Con
  `SINGLE_USER_MODE=true` el middleware usa el usuario por defecto (`SINGLE_USER_ID`) en vez de
  exigir token → la app single-user sin login funciona. El auth queda intacto para el multi-usuario.
  ⚠️ **PR #39 puede estar aún abierto** (verificar/mergear; el código YA está desplegado en la Pi vía rsync).

## 4. Rumbo vigente

- **App usable single-user: LOGRADO** y desplegado (Pi + APK). El usuario ya la usa.
- **Auth multi-usuario: PAUSADO** — falta el mobile de auth (login/registro, token en secure-store,
  navegación gateada). Se retomará al sumar a su pareja. Mientras: `SINGLE_USER_MODE=true`.
- **Próximo**: **sub-proyecto B** = HR en vivo con **banda Polar** (BLE) → requiere salir de Expo
  Go/APK-preview a un **dev build** con `react-native-ble-plx`. También sirve la **ingesta Garmin
  Health** (sueño/HRV/estrés/balanza) como track paralelo. El hueco de HR ya está reservado en la UI.
- Specs/planes ya escritos: registro de entrenamiento, async/streaming de generación, mobile 2a/2b.

## 5. Cómo correr / operar

**Dev local** (Mac, con `export PATH="$HOME/.bun/bin:$PATH"`):
```bash
docker compose up -d                         # Postgres+pgvector dev (raíz)
cd backend && bun run db:migrate && bun run db:seed && bun run start   # :8787
cd mobile && bunx expo start --host lan --clear   # NO --localhost (bindea IPv6)
```
Tests: root `bun test shared backend`; mobile `cd mobile && npm test -- --runInBand`.

**Producción (la Pi, YA desplegado):** ver §9. Backend en `http://192.168.178.47:3011`.

**APK Android:** config EAS en `mobile/` (`eas.json` perfil `preview` → APK; `app.json` con
`android.package` + `projectId` + `usesCleartextTraffic:true`). Build:
```bash
cd mobile && bunx eas-cli build -p android --profile preview   # cuenta Expo: belregistro
```
En la app: Configuración → `http://192.168.178.47:3011` → Guardar ("Conexión OK") → API key →
Guardar → Perfil → Generar (~2 min).

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
- **Ejecución subagent-driven siempre** (memoria `execution-subagent-driven`). Nota: los subagentes
  a veces re-delegan y no terminan → verificar el estado real (git log/tests) y completar directo si hace falta.
- **Commits firmados `git commit -S`.** NUNCA atribución a Claude/Anthropic ni Co-Authored-By.
- **TDD** siempre. Specs en `docs/superpowers/specs/`, planes en `docs/superpowers/plans/`.

## 7. Gotchas de tooling (ya resueltos)

- **Bun + jest + RN:** `jest` pinneado a 29; `transformIgnorePatterns` al store de Bun. Correr jest
  **`--runInBand`** (en paralelo, timeouts flaky). Tests en `mobile/__tests__/`, NUNCA en `mobile/app/`.
- **Worktrees no comparten `node_modules`** → `bun install --force` en cada worktree nuevo antes de tests/eas.
- Tests que importan `expo-router` → `jest.mock`; vars dentro de `jest.mock()` con prefijo `mock`.
- **`zod` no resuelve desde `mobile/`** (layout del store de Bun) → validar con `WorkoutSessionSchema.safeParse`, no `import { z }`.
- **Android bloquea HTTP cleartext** en release → `expo-build-properties` con `usesCleartextTraffic:true` (ya puesto).
- **Backend requiere `INVITE_CODE`** (auth) al boot → está en `app.env` de la Pi.
- `z.string().uuid()` de zod 4 exige UUID RFC 4122 válido (los ids de sesión son v4 de `expo-crypto`).

## 8. Backlog (pendientes / ideas)

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
  - **C3 — Mapa corporal (PRÓXIMO)**: silueta que resalta músculos trabajados. Datos: catálogo tiene
    `primaryMuscles` **Y `secondaryMuscles`** (11 valores: abs, back, full_body, glutes, shoulders,
    chest, quads, hamstrings, triceps, calves, biceps — ojo `full_body`). ⚠️ **`react-native-svg` NO
    está instalado** → agregarlo = nuevo preview build. Vive dentro del resumen C2 (reemplaza la lista
    "por músculo"). Estaba arrancado el brainstorming (se ofreció visual companion, sin responder).
  - **C1 — Controles de sesión en vivo**: Pausar/Reanudar (el timer no cuenta el descanso del baño) +
    **indicador global de "sesión en curso / tiempo corriendo"** al salir de la pantalla de entrenamiento.
    (El "descartar/cancelar la sesión en curso" YA está en Sesión v2.)
  - **C4 — Historial — HECHO ✓ en `main`** (#50) + **eliminar en curso (#52, sin mergear)**. Lista →
    tap → resumen. Backend `GET /sessions` (liviano) y `GET /sessions/:id` (completo) ya existen.
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

## 9. Deployment en la Pi (HECHO — deploy manual v1)

La Pi es `nextcloud` en `~/.ssh/config` (`ssh nextcloud`, aarch64, user `kilo`, Docker 29 + Compose v5,
SSH por on-disk keys). Corre apps como docker-compose en `/home/kilo/<app>/`. Tiene un GitHub Actions
self-hosted runner (`/home/kilo/actions-runner`).

**Pulsia desplegado en `/home/kilo/pulsia/`:**
- `deploy/docker-compose.yml`: `backend` (build `backend/Dockerfile`, Bun arm64, **usuario no-root**)
  + `db` (pgvector, healthcheck, volumen `deploy_pulsia_pgdata`, 5432 NO expuesto). Publica **`3011`**.
- `deploy/app.env` (solo en la Pi, no versionado): `DATABASE_URL` (host `db`), `ENCRYPTION_KEY`
  (propio de la Pi, `openssl rand -hex 32`), `PORT=8787`, `INVITE_CODE`, **`SINGLE_USER_MODE=true`**.
  La API key de Anthropic NO va acá (se guarda encriptada en la DB desde la app).
- **Deploy/redeploy manual**: `rsync` del repo (sin `mobile`/`node_modules`, sin pisar `app.env`) →
  `cd /home/kilo/pulsia && docker compose -f deploy/docker-compose.yml up -d --build`.
- La DB es **separada de la de Nextcloud** (esa es MariaDB `nextcloud-db-1`); Pulsia usa su propia Postgres.

**Red / cómo llega el teléfono (RESUELTO):** el teléfono está siempre en la VPN de casa (WireGuard,
`Allowed IPs 0.0.0.0/0`) y alcanza la Pi por su **IP de LAN `192.168.178.47`** (la misma por la que
el usuario entra a Nextcloud). La IP de WG de la Pi (`10.8.0.2`) NO sirve (el VPS no reenvía entre
peers). Se corrigió el `AllowedIPs` del peer WG de la Pi de `10.8.0.1/32` → `10.8.0.0/24`
(`/etc/wireguard/wg0.conf`, backup `.bak`) para que la Pi pudiera responder — pero el camino que
funciona es `.47` (LAN). **La app usa `http://192.168.178.47:3011`.**

## 10. Índice de docs

- Specs: `2026-06-29-generador-rutinas-design.md`, `2026-06-30-app-mobile-design.md`,
  `2026-07-01-auth-multiusuario-design.md`, `2026-07-01-registro-entrenamiento-design.md`,
  `2026-07-01-generacion-async-jobs-design.md` (async, rama local).
- Planes: `docs/superpowers/plans/*` (backend, mobile fases 1-3, auth, **registro-entrenamiento
  backend + mobile 2a/2b**).

## 11. Memoria persistente (fuera del repo)

`~/.claude/projects/-Users-kilo-desarrollo26-pulsia/memory/` → `MEMORY.md` (índice):
`workflow-prs-coderabbit` (PRs + CodeRabbit + **auto-merge**), `execution-subagent-driven`,
`product-roadmap`. Revisar al arrancar.
