# Generación asíncrona de programas — diseño

> Fecha: 2026-07-09. Estado: aprobado (el usuario propuso la idea y confirmó "dale"). Resuelve el 499 en móvil.

## Problema
`POST /programs/generate` es una request larga (~57s, una llamada a la IA). El cliente móvil (okhttp) / el NAT del celular cortan conexiones ociosas de >~60s → **HTTP 499** → la app muestra "no se pudo conectar con el backend". El keepalive y quitar el refresh de memoria del camino crítico no alcanzaron (sigue al filo).

## Solución: generación asíncrona
La conexión deja de ser larga: el POST responde al instante con un `jobId`, el server genera en background, y la app **pollea** el estado.

### Backend
- Tabla `generation_jobs`: `id` (uuid pk), `userId` (fk), `status` ('pending'|'done'|'error'), `programId` (uuid fk nullable), `error` (text nullable), `createdAt`. Migración drizzle (0006).
- `POST /programs/generate-async`: valida perfil + resuelve key (igual que el sync). Crea el job (`pending`), **dispara la generación en background** (floating promise), y responde `{ jobId }`. NO espera la generación.
- Background (`runGenerationJob`): `generateProgramForProfile` → inserta el programa → `update job set status='done', programId`. Si la IA falla → `update job set status='error', error=msg`. Además dispara el refresh de memoria en background (como ya hace el sync).
- `GET /programs/generate-async/:jobId`: busca el job por `id` + `userId` (scoped). Devuelve `{ status, programId?, program?, error? }` (el programa se trae de `programs` cuando `done`). 404 si no existe o es de otro usuario.
- **El `POST /programs/generate` sync se mantiene** (back-compat para vc7 hasta que llegue el OTA; comparte la lógica de generación).

### Mobile (JS puro → **OTA**, sin build nuevo)
- `api/programs.ts`: `startGeneration(url, profile) → { jobId }` (POST, timeout corto); `getGenerationStatus(url, jobId) → { status, programId?, program?, error? }` (GET, timeout corto).
- `generando.tsx`: `startGeneration` → guarda `jobId` → **pollea `getGenerationStatus` cada 3s** (hasta ~5 min). En `done` → `setStoredProgram(program)` + `setStoredProgramId(programId)` → navega. En `error` → muestra el mensaje (con reintento). Timeout total → reintento. La conexión con el server es corta (POST + polls) → sin 499.

### Robustez
Si el server se reinicia mientras genera, la floating promise se pierde y el job quedaría `pending` para siempre. **Stale-job fallback (implementado):** el `GET /programs/generate-async/:jobId` detecta jobs `pending` de >10 min (por `createdAt`), los flipea a `error` ("La generación expiró. Reintentá.") y los devuelve así — el propio polling auto-sana los jobs colgados por un restart. Además, el GET valida que `jobId` sea un UUID antes de tocar la DB (un UUID malformado devuelve 404, no un 500 de Postgres).

## Fuera de alcance (YAGNI)
- Async para `/programs/generate-oneoff` (mismo patrón; se hace después si molesta — el reporte fue sobre el `/generate` full).
- Cola persistente / reintentos automáticos / websockets.

## Decomposición
- **PR-A (backend)**: tabla + migración + `runGenerationJob` + los 2 endpoints + tests. Con review, deploya solo.
- **PR-B (mobile)**: api start/status + polling en `generando.tsx` + tests. Con review → **OTA** a vc7.
