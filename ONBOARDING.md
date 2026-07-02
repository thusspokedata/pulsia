# Pulsia — Onboarding / Handoff

> Documento de contexto para retomar el proyecto en una sesión nueva. Última actualización: 2026-07-01.

## 1. Qué es Pulsia

App para registrar actividad física y de vida (entrenamiento, y a futuro comidas con foto+IA,
descanso, salud, meditación), integrada con Garmin/Polar. **Foco actual: el generador de rutinas
con IA** — a partir de un perfil, la IA arma un programa de gimnasio + su equivalente para casa,
con nombres de ejercicios compatibles con Garmin (para cargarlos y ejecutarlos desde el reloj).

El usuario (kilo) es dev, hostea en una Raspberry propia (acceso LAN/VPN), y prefiere control y
privacidad. Posible salida comercial a futuro.

## 2. Arquitectura (monorepo Bun)

Workspaces en `/Users/kilo/desarrollo26/pulsia`:
- **`shared/`** (`@pulsia/shared`): schemas Zod (fuente de verdad de tipos + validación):
  `TrainingProfileSchema` (incluye age/weightKg/heightCm opcionales), catálogo de ejercicios
  (`EXERCISE_CATALOG`, ~230 generados desde el FIT SDK), `ProgramSchema`. Tests con `bun test`.
- **`backend/`** (`@pulsia/backend`): Hono sobre Bun + Postgres (pgvector) + Drizzle ORM.
  Genera programas llamando a Claude (`claude-sonnet-4-6`, structured output/tool use). Tests `bun test`.
- **`mobile/`** (`@pulsia/mobile`): Expo SDK 57 + expo-router + TanStack Query + AsyncStorage.
  Reutiliza `@pulsia/shared`. Tests con **jest** (`jest-expo`), NO `bun test`.

Estilo visual mobile: **"C" (coral)** — acento `#D85A30`. Tokens en `mobile/src/theme/tokens.ts`.

## 3. Estado actual (qué anda)

**En `main`:**
- Backend generador funcional end-to-end (probado en vivo: genera rutinas reales gym+casa).
- Deps al día (zod 4, @anthropic-ai/sdk 0.107, drizzle 0.45).
- Mobile **Fase 1** (config: URL backend + API key) y **Fase 2** (perfil con edad/peso/altura +
  generación + pantalla de espera). El perfil se guarda LOCAL (AsyncStorage).
- **Auth PR 1** (#22, mergeado): esquema `users`(+email/passwordHash) + tabla `sessions`, hasheo
  `Bun.password`. ⚠️ Ver "estado roto" abajo.
- Dependabot configurado.

**En PRs abiertos (esperar CodeRabbit antes de mergear — regla del usuario):**
- **#25** — `fix: re-seed default single-user`. Destraba el backend (ver abajo).
- **#28** — **Mobile Fase 3: viewer del programa** (semanas, toggle gym/casa, ejercicios,
  "Copiar a Garmin"). Lee el programa local. Es lo que hace la app usable.
- **#26** — plan de la Fase 3 (docs).
- **#23 / #24** — auth backend (endpoints/middleware + scoping por usuario). **PAUSADOS** (ver abajo).

**⚠️ Estado roto a destrabar:** el PR #22 (auth schema) quitó el seed del usuario fijo
`SINGLE_USER_ID`, pero `settings.ts`/`programs.ts` en `main` todavía lo usan → guardar API key o
generar fallan por FK (el usuario no existe). **PR #25 lo arregla** (re-agrega el usuario por
defecto al seed). Mergear #25 restaura el single-user. Localmente ya se insertó el usuario a mano
para poder probar.

## 4. Decisión de rumbo vigente

El usuario quiere la app **funcional lo antes posible** para empezar a usar SU plan de
entrenamiento e iterar. Por eso:
- **Auth (multi-usuario) está PAUSADO** (#23/#24 quedan abiertos). No bloquea al usuario (es de un
  solo usuario por ahora). Se retomará como esfuerzo coordinado backend+mobile cuando quiera sumar
  a su pareja. Diseño en `docs/superpowers/specs/2026-07-01-auth-multiusuario-design.md`.
- **Prioridad: mergear #25 + #28** (tras CodeRabbit) → app usable single-user.

## 5. Cómo correr (dev)

**Backend** (desde la raíz, con Bun en PATH: `export PATH="$HOME/.bun/bin:$PATH"`):
```bash
docker compose up -d                        # Postgres+pgvector (arm64 ok)
cd backend && bun run db:migrate && bun run db:seed   # seed: usuario por defecto + catálogo
bun run start                               # server en :8787
```
> ⚠️ Docker Hub pide auth en la máquina del usuario; la imagen `pgvector/pgvector:pg16` se
> re-taggeó de un `postgres:16-alpine` local (la DB dev NO tiene la extensión pgvector todavía —
> no afecta hoy, sí para la memoria con embeddings a futuro).

**Mobile** (simulador iOS — hay Xcode con iPhone 17 Pro):
```bash
cd mobile && export PATH="$HOME/.bun/bin:$PATH"
bunx expo start --host lan --clear          # NO usar --localhost (bindea sólo IPv6 → la app no conecta)
# luego, con el simulador booteado:
xcrun simctl openurl <UDID> "exp://<IP-LAN>:8081"
```
En la app: Configuración → URL `http://localhost:8787` → Guardar → API key → Guardar. Perfil →
Guardar → Generar (~50s). La generación tarda ~50s (síncrona).

## 6. Convenciones (IMPORTANTE)

- **Flujo por PRs revisados por CodeRabbit.** Rama por PR; NUNCA commitear features directo a `main`.
  **Siempre esperar a CodeRabbit** y corregir sus comentarios antes de mergear (el usuario es firme
  con esto). PRs apilados: CodeRabbit saltea los que no tienen base `main` → reapuntar a `main` tras
  mergear el de abajo.
- **Commits firmados: `git commit -S`.** NUNCA agregar atribución a Claude/Anthropic ni Co-Authored-By.
- **TDD** siempre. Desarrollo con **subagent-driven-development** (subagente por tarea) + checkpoint por PR.
- Specs en `docs/superpowers/specs/`, planes en `docs/superpowers/plans/`.
- Mergeo de stacks: **merge commit** (no squash) para no romper el retargeting; no borrar la rama
  base mientras un hijo apunta a ella (cierra el hijo).

## 7. Gotchas de tooling (ya resueltos — no volver a tropezar)

- **Bun + jest + React Native:** `jest` pinneado a **29** (jest-expo 57 fija jest 29; con 30
  crashea). `transformIgnorePatterns` adaptado al store de Bun (`node_modules/.bun/...`). Deps que
  Bun no hoistea, agregadas explícitas: `babel-preset-expo`, `@babel/runtime` (7.x), `@types/jest`,
  `@types/node`, `@expo/metro-runtime`. `tsconfig` con `types: ["jest","node"]`.
- **`metro.config.js`**: SIN `disableHierarchicalLookup` (rompe resolución de transitivas en Bun).
- **Tests de pantallas/componentes van en `mobile/__tests__/`, NUNCA en `mobile/app/`** (expo-router
  toma los archivos de `app/` como rutas y los bundlea).
- Componentes que importan `expo-router` en tests → `jest.mock("expo-router", ...)`. Variables usadas
  dentro de `jest.mock()` deben prefijarse con `mock` (regla de babel-jest).
- RNTL v14: `render`/`fireEvent` son **async** → usar `await`.
- `test:mobile` (root) usa `bun run --filter @pulsia/mobile test` (con `run`, si no corre el runner nativo).
- Root `bun test` acotado a `shared backend` (los tests de mobile son jest).
- **Auth deploy/DB:** cambiar el esquema de auth requiere resetear la DB dev (`docker compose down -v`).

## 8. Backlog (pendientes / ideas)

- **[FEATURE] Datos ambientales para estudio de rendimiento** (pedido del usuario): la app debe
  guardar **temperatura, humedad, presión, calendario lunar** (y quizá más) asociados a cada sesión,
  para analizar cómo afectan el rendimiento. Diseñar de dónde salen (API de clima por ubicación +
  efeméride lunar) y cómo se registran/visualizan. → merece su spec.
- **[UX] Feedback al guardar perfil:** hoy "Guardar perfil" no muestra confirmación visible (solo
  aparece el botón "Generar"). Agregar un mensaje "Perfil guardado ✓".
- **[Fase 4 mobile] Detalle de ejercicio**: imágenes open-source (free-exercise-db, matcheo por
  nombre) + músculos/equipamiento (ya están en el catálogo) + cues. Requiere `GET /catalog`
  enriquecido en el backend.
- **[Auth] Retomar multi-usuario**: mergear #23/#24 + construir el mobile de auth (login/registro,
  token en secure-store, navegación gateada, perfil vía API). Spec ya escrito.
- **[Auth hardening]** (de review de CodeRabbit, corriendo en tarea aparte): borrar sesiones
  expiradas en `validateSession`, validar config de auth al boot, test de aislamiento de perfil.
- **[Deployment] Pi**: ver sección 9.
- **[Backend] Import .FIT de Garmin** → autocompletar logs (Fase 3 del backend original).
- **[Integración Garmin] Ingesta de datos pasivos** (idea del usuario, complementaria a "hacer todo
  desde el teléfono"): traer de Garmin lo que el teléfono no mide — **sueño, composición corporal de
  la balanza Garmin Index, HRV, FC en reposo** — vía **Garmin Health API** (OAuth; ⚠️ requiere
  aprobación en el programa de desarrolladores de Garmin). Alternativa/complemento: import `.FIT`
  para entrenamientos hechos en el reloj. Alimenta el estudio de rendimiento y el PT agent. Sub-proyecto
  propio (dependencia externa) → NO bloquea el registro de entrenamiento (sub-proyecto A).
- **[Backend] Registro de logs editable + memoria a largo plazo** (pgvector) + dashboard de gráficos.
- **[FEATURE] Sugerencia de peso inicial por ejercicio** (pedido del usuario): a medida que la app
  acumule los kg reales por sesión, sugerir un peso de arranque por ejercicio a partir del historial
  (progresión sobre la última vez). **Depende del registro de entrenamiento (sub-proyecto A)** — sin
  kg registrados no hay de dónde sugerir. Escalonado: v1 regla determinista, v2 ajustar por
  RPE/descanso/objetivo, v3 IA sobre el historial.
- **[PT agent] Entrenador personal conversacional** (idea del usuario; versión ampliada del "ajuste
  conversacional"): un agente sobre Claude que ajusta el plan según tus sesiones reales, sugiere
  pesos, responde técnica y motiva. **Es bueno en la medida que tiene datos → se apoya en el registro
  de entrenamiento (A)** + datos Garmin/ambientales. v-next después de A.
- **[Cosmético] Ícono/logo de Pulsia** (hoy usa el placeholder de Expo). Idea: onda de pulso, coral.
- **[Backend] max_tokens/alcance de generación**: hoy fijo en 2 semanas / 5 ej por día en el prompt;
  hacer configurable (nº de semanas en el perfil). La generación síncrona (~50s) debería pasar a
  **async/streaming** para la app.

## 9. Deployment a la Raspberry (contexto, sin empezar aún)

La Pi (`nextcloud` en `~/.ssh/config`, aarch64, user `kilo`, Docker) corre apps como **Docker
Compose** en `/home/kilo/<app>/`. **Ya usa un GitHub Actions self-hosted runner**
(`/home/kilo/actions-runner`) para deploy en push a `main` (ej. `viajarpais`): el `deploy.yml`
hace checkout → copia `app.env` (secrets, viven solo en la Pi) → `docker compose up -d --build`.
Aparte, `ci.yml` valida en PR (`runs-on: ubuntu-latest`). Puertos usados: 3006-3010, nextcloud 8080.

**Plan para Pulsia (local/VPN, sin exponer al VPS):** dockerizar SOLO el backend (el mobile corre
en el celu). Necesita: Dockerfile (Bun, arm64), `docker-compose.yml` (backend + Postgres pgvector +
volumen), `app.env` en la Pi, `deploy.yml` (self-hosted runner) + `ci.yml`. Puerto libre (ej. 3011).
El `backendUrl` de la app apunta a la IP de la Pi por VPN:3011. Webhooks de GitHub NO sirven (la Pi
no es alcanzable desde afuera) → self-hosted runner o pull-based. **Es un sub-proyecto propio (diseñar).**

## 10. Índice de docs

- `docs/superpowers/specs/2026-06-29-generador-rutinas-design.md` — spec v1 (generador backend).
- `docs/superpowers/specs/2026-06-30-app-mobile-design.md` — spec app mobile.
- `docs/superpowers/specs/2026-07-01-auth-multiusuario-design.md` — spec auth (pausado).
- `docs/superpowers/specs/2026-07-01-registro-entrenamiento-design.md` — spec registro de
  entrenamiento (sesión en vivo + logging, sub-proyecto A).
- `docs/superpowers/plans/*` — planes de implementación (backend, mobile fases 1-3, auth backend).

## 11. Memoria persistente (fuera del repo)

`~/.claude/projects/-Users-kilo-desarrollo26-pulsia/memory/` — incluye la preferencia de trabajo
(PRs + CodeRabbit). Revisar `MEMORY.md` ahí.
