# Web de Pulsia — subida de archivos + dashboard (v1) — Diseño

**Fecha:** 2026-07-31
**Estado:** aprobado (brainstorming) — pendiente de plan de implementación

## 0. Resumen en una línea

Una app web (React + Vite SPA) servida desde la Pi por el backend Hono existente, con
login por cookie httpOnly, subida **batch** de `.fit`/`.csv` (arrastrar y soltar) contra los
endpoints que ya existen, y un dashboard con 4 gráficos (peso, sueño, pasos, constancia de
entrenos).

## 1. Contexto y premisa

El backend (Hono + Bun + Postgres en la Pi) **ya sabe** recibir y parsear estos archivos:

- `.fit` → `POST /cardio` con `{ fitBase64 }` (cardio + fuerza; tope 5 MB).
- `.csv` → endpoints de métricas por tipo (peso/pasos/sueño) con `{ csvBase64 }` (tope ~2,2 MB),
  con deduplicación idempotente que devuelve `{ imported, duplicates }`.

Y ya expone los GET que alimentan los gráficos: `/metrics` (+ `/metrics/latest`), `/sessions`,
`/cardio`. Auth actual: **Bearer token** (sesión opaca en DB) validado por `requireAuth`.

Por lo tanto la web **no arranca de cero**: es un **frontend nuevo** que se loguea contra ese
backend, le manda archivos y lee sus datos. El backend recibe solo dos cambios chicos (auth por
cookie + servir la SPA). Nada de Supabase ni servicios externos: todo corre en la Pi.

**Restricción explícita del owner:** tiene que ser seguro (son datos de salud de la familia).

## 2. Alcance de la v1 (decidido en brainstorming)

Incluye: **login + subida batch + dashboard básico** con 4 gráficos.

Fuera de alcance (v-next, spec propio): el visor "rico" completo de mucha más información
(nutrición, cardio detallado, presión, ECG, memoria del atleta), registro de usuarios desde la
web (sigue por la app con `INVITE_CODE`), edición/borrado de datos desde la web.

## 3. Stack y arquitectura

**Workspace nuevo `web/`** en el monorepo Bun, agregado a `workspaces` del `package.json` raíz
(junto a `shared`/`backend`/`mobile`).

- **`web/`: React + Vite + TypeScript (SPA).**
  - Reusa **`@pulsia/shared`** (schemas Zod) para validar las respuestas del API.
  - **TanStack Query** para fetching/caché (mismo patrón que mobile).
  - Router: **react-router**.
  - Charts: **Recharts** (declarativo, liviano, encaja con React). Si algún gráfico futuro
    necesita series muy grandes, se evalúa uPlot puntualmente — no en la v1.
  - Identidad visual "clínico fresco" (teal `#0E7C86` + slate), consistente con la app.
- **Backend Hono: dos cambios chicos, sin cambiar su forma.**
  1. **Auth por cookie** (ver §5).
  2. **Servir la SPA** (ver §6).

### Flujo de datos

```
login (web) ──► cookie de sesión httpOnly (same-origin)
                     │
   toda llamada al mismo origen lleva la cookie automáticamente
                     │
   ├─ uploads ──► POST /cardio (.fit) · POST /metrics/<tipo> (.csv)   [YA EXISTEN]
   └─ charts  ──► GET /metrics · /sessions · /cardio                   [YA EXISTEN]
```

## 4. Subida batch (drag-and-drop)

**UI:** zona de arrastrar-y-soltar (+ selector de archivos) que acepta varios archivos mezclados.

**Clasificación por archivo (en el cliente):**

- Extensión `.fit` → import de cardio/fuerza (`POST /cardio`).
- Extensión `.csv` → se lee la **fila de cabecera** y se matchea contra las firmas conocidas:
  - peso/grasa/músculo/agua/hueso → CSV de **peso**.
  - cabeceras de **pasos**.
  - cabeceras de **sueño**.
  - Si no matchea ninguna → archivo marcado como **tipo desconocido**: el usuario le elige el
    tipo de un desplegable, o lo saltea. (No se adivina ni se manda a ciegas.)

**Envío:** cada archivo en base64 (contrato que ya esperan los endpoints), respetando los topes
del backend (5 MB `.fit`, ~2,2 MB CSV) — se validan **en el cliente** antes de mandar para dar un
error claro por archivo. Subida con **concurrencia limitada** (pocos a la vez) para no saturar la Pi.

**Resultado por archivo (lista en vivo):** nombre + tipo detectado + estado →
`✓ N importados / M duplicados` o `✗ error (motivo)`. La **deduplicación la hace el backend**
(imports idempotentes): re-subir el mismo export no duplica. **Un archivo que falla no frena el
lote** — los demás continúan; al final, resumen agregado.

**Sin paso de preview/confirmar** en la v1: se sube directo porque el backend dedupe y no borra
nada. (Si más adelante se quiere un preview antes de escribir, es un incremento acotado.)

## 5. Seguridad y auth

**Objetivo:** que un XSS no pueda robar la sesión, y que la web no amplíe la superficie expuesta a
internet más allá del dominio ya endurecido.

- **Cookie de sesión httpOnly.** `/auth/login` setea la sesión (el mismo token opaco que hoy va en
  el body) en una cookie con flags `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`. El JS de la
  página **no puede leerla**. `/auth/logout` la limpia.
- **`requireAuth` lee ambos:** `Authorization: Bearer <token>` **o** la cookie de sesión. El móvil
  sigue con Bearer sin ningún cambio; la web usa la cookie. Precedencia: si viene el header, se usa
  el header; si no, la cookie.
- **Same-origin:** la SPA se sirve desde el mismo origen que el API (ver §6) → la cookie viaja sola,
  sin CORS y sin exponer el token a JavaScript.
- **CSRF (defensa en profundidad):** con `SameSite=Strict` el riesgo ya es bajo. Además, las
  llamadas que **mutan** (uploads, logout) exigen un header custom `X-Requested-With: fetch`, que un
  `<form>` cross-site no puede setear. Los GET no mutan y no requieren el header.
- **Login-only en la web:** no hay registro desde la web en la v1. El registro con `INVITE_CODE`
  sigue por la app.
- **Sin secretos nuevos en el cliente:** la web nunca ve la `ANTHROPIC_API_KEY` ni tokens de infra.
- **Nota:** el backend público ya está detrás de nginx/HTTPS con `limit_req` en `/auth/`. La web no
  cambia esa topología (mismo dominio).

## 6. Servir la SPA y deploy

- **Prod:** el build de Vite (`web/dist`) lo sirve el **mismo backend Hono** como estáticos, con
  catch-all → `index.html` para las rutas del SPA. Se sirve en el mismo origen que el API, en las
  rutas **no** tomadas por el API (`/auth`, `/cardio`, `/metrics`, `/sessions`, `/download`, …).
  → La web queda publicada automáticamente en el mismo dominio HTTPS que ya expone la Pi.
- **Docker:** el `backend/Dockerfile` (o el compose de `deploy/`) buildea `web/` y copia `web/dist`
  a la imagen para que Hono lo sirva. El deploy sigue siendo el mismo (push a `main` →
  runner self-hosted → `docker compose up -d --build`).
- **Dev local:** `vite dev` con proxy de `/api` (o de las rutas del API) al backend en `:8787`, para
  trabajar con hot-reload sin CORS.

## 7. Testing (TDD + verificación por mutación)

- **`shared/`** (si se agrega el clasificador de archivos por cabecera como helper compartido):
  test puro que mapea cabeceras → tipo, incluyendo el caso "desconocido".
- **`backend/`:**
  - `requireAuth` acepta la cookie además del header; precedencia header > cookie; 401 sin ninguno.
  - `/auth/login` setea la cookie con los flags correctos; `/auth/logout` la limpia.
  - (Los parsers de `.fit`/`.csv` ya están testeados — no se tocan.)
- **`web/` (Vitest + Testing Library):**
  - clasificador (fit vs csv-peso/pasos/sueño vs desconocido);
  - batch: un archivo que falla no frena el lote; conteo de resultados correcto;
  - auth: ante 401 redirige a login;
  - charts: "recibe estos datos → arma estas series" (sin snapshots de píxeles).

## 8. Fases de entrega (cada una un PR)

1. **Andamiaje + auth:** workspace `web/`, cookie httpOnly en el backend, Hono sirve la SPA, login
   end-to-end.
2. **Upload batch:** pantalla drag-and-drop con clasificación y resultados por archivo.
3. **Dashboard:** layout barra lateral + grilla, con los 4 gráficos leyendo de los GET existentes.
4. **Deploy:** build de Vite en la imagen Docker; publicado en el dominio HTTPS de la Pi.

## 9. Gráficos de la v1

Layout: **barra lateral (nav) + grilla de tarjetas** (dirección A del brainstorming). Selector de
**rango de fechas** global. Las 4 tarjetas:

1. **Peso / composición:** tendencia de peso (y composición si hay dato) en el tiempo. Fuente: `/metrics`.
2. **Sueño:** horas por noche (+ fases si el dato lo permite), tendencia. Fuente: `/metrics`.
3. **Pasos / actividad:** pasos diarios con promedio y tendencia. Fuente: `/metrics`.
4. **Constancia de entrenos:** heatmap anual estilo "contribuciones de GitHub" (celda = día,
   intensidad por volumen/series o hecho/no) con selector de año. Fuente: `/sessions` (+ `/cardio`
   si se cuentan las actividades). Pedido explícito del owner (backlog).

## 10. Decisiones cerradas (no re-litigar)

- SPA React+Vite, **no** SSR/Next (más pesado en la Pi, duplicaría API que ya existe).
- Cookie httpOnly, **no** token en localStorage (datos de salud → no exponer a XSS).
- Batch upload con auto-detección, **no** de a un archivo.
- La web se sirve del mismo Hono/mismo origen, **no** contenedor/subdominio aparte (simplifica la cookie).
- Login-only en la web (registro sigue por la app).
