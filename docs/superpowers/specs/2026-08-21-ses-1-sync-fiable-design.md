# SES-1 — Sincronización fiable de sesiones (fin de pérdida de datos silenciosa)

> Spec de diseño. Fecha: **2026-08-21**. Ticket Kan: `SES-1` (P0 · Ahora).
> Ámbito: **móvil (OTA)** + una pieza chica de **backend (deploy a la Pi)**.

## Problema

Un usuario (familiar del owner, `mobiliariosjl@gmail.com`, en Argentina, no técnico) entrena y al
tocar "Terminar entrenamiento" la sesión **no aparece después** en el backend/historial.

### Root cause (verificado en código, no es auth)

1. **La cola local es durable, pero el flush al backend es poco fiable.** En `onFinish`
   (`mobile/app/sesion.tsx:561`) la sesión se persiste con `await enqueueSession(done)` **antes** de
   mostrar el resumen → **la data nunca se pierde localmente**. Pero acto seguido se hace
   `void syncPending(url)` **fire-and-forget** (`sesion.tsx:572`).
2. **`syncPending` solo se dispara al terminar otra sesión.** No hay re-flush al abrir la app, al
   reconectar, ni en background. Si el envío inicial se corta (app a background, red intermitente),
   la sesión queda encolada **hasta la próxima vez que el usuario termine una sesión** — de ahí un
   caso real con **~2,5 días** de retraso de sync.
3. **`catch {}` silencioso** (`mobile/src/sync/syncSessions.ts:14`): cualquier fallo persistente es
   **invisible**. El usuario ve el resumen (armado desde el estado local) y asume que guardó.

### Síntoma secundario (UX, reportado por el hermano)

El botón **"Listo"** de la pantalla de resumen (`sesion.tsx:343`) queda **pegado a la barra de
navegación del sistema** (el `ScrollView` no respeta el safe-area inferior) → a veces toca un botón
del teléfono y sale sin tocar "Listo". **No causa pérdida de datos** (la sesión ya está encolada),
pero es un bug de UX real a corregir.

## Objetivo

Que los entrenos lleguen al backend de forma **confiable** y que, cuando no lleguen, el estado sea
**visible** y **reintentable** — sin pedirle nada técnico al usuario afectado. Todo lo del móvil por
**OTA** (le llega solo a su Android).

## Piezas

### A. Taxonomía de errores de sync — `SyncError` tipado

- Nuevo tipo/clase `SyncError` (en `mobile/src/sync/errors.ts`), con:
  - `kind`: `"network" | "auth" | "validation" | "conflict" | "server" | "unknown"`.
  - `status?: number` (HTTP, cuando aplica).
  - `userMessage: string` en lenguaje simple ("Sin conexión", "Sesión vencida", "Datos inválidos",
    "Error del servidor", etc.).
  - Un flag derivado `retryable`: `true` para `network`/`server`, `false` para
    `auth`/`validation`/`conflict` (terminales).
- `putSession` (`mobile/src/api/sessions.ts`) deja de tirar `Error` genérico y **mapea la respuesta**
  a un `SyncError`:
  - `res.ok` → resuelve.
  - `401` → `auth` (nota: `apiFetch` ya limpia token + `notifyUnauthorized` → vuelve al login).
  - `400` → `validation`.
  - `409` → `conflict`.
  - `5xx` → `server`.
  - excepción de `fetch` (abort/timeout/red caída) → `network`.
  - otro → `unknown`.

### B. `syncPending` deja de tragarse los errores

- Firma nueva: devuelve un **resultado estructurado**
  `{ synced: number; remaining: number; lastError: SyncError | null }` (en vez de solo `number`).
- Por cada pendiente: si `putSession` resuelve → `removePendingSession` + `synced++`. Si tira
  `SyncError` → la sesión **queda en la cola** (nunca se descarta data), se guarda en `lastError` y
  se sigue con las demás. Ya **no** hay `catch {}` mudo.
- `remaining` = cuántas quedaron sin subir al terminar el barrido.
- Los llamadores existentes (`sesion.tsx`) se adaptan al nuevo shape.

### C. Re-flush proactivo — el arreglo del root cause

- Nuevo hook `useSyncPendingSessions()` (en `mobile/src/sync/useSyncPendingSessions.ts`) montado en
  `app/_layout.tsx` dentro de `Guarded`, **solo cuando `status === "in"`**:
  - dispara `syncPending(url)` **al montar** (best-effort, con `getBackendUrl`), y
  - se suscribe a `AppState` y vuelve a disparar cada vez que el estado pasa a `"active"`
    (vuelta a primer plano).
  - Guardas: no dispara si no hay `url`; ignora resultados si se desmontó; no encola disparos
    solapados (un flag `runningRef` evita correr dos flushes a la vez).
- Con esto, los entrenos encolados suben la próxima vez que la app se abre o vuelve al frente, sin
  depender de terminar otra sesión.

### D. Estado de sync visible en el resumen

- `onFinish` deja de ser fire-and-forget ciego: arranca el sync y **trackea el resultado** en estado
  (`syncState: "syncing" | "synced" | "pending"` + `syncError: SyncError | null`). El resumen se
  muestra **al instante** con "Sincronizando…"; al resolver, pasa a "Guardado ✓" o
  "Pendiente de sincronizar — {motivo}".
- En la pantalla de resumen (`sesion.tsx`, bloque `if (finishedSession)`), una **fila de estado**
  arriba del botón:
  - `syncing` → "Sincronizando…" (con indicador).
  - `synced` → "Guardado ✓".
  - `pending` → "Pendiente de sincronizar — {syncError.userMessage}" + botón **"Reintentar
    sincronización"** que llama a `syncPending`, muestra "Sincronizando…" y actualiza el estado con
    el resultado.
- `saveFinishedNotes` (`sesion.tsx:577`) también actualiza el mismo estado al re-sincronizar tras
  editar notas.

### E. Botón "Listo" más clickeable + safe-area *(pedido del owner)*

- En el bloque del resumen: `const insets = useSafeAreaInsets()` y
  `contentContainerStyle={{ ..., paddingBottom: insets.bottom + spacing.xl }}` para despegar el
  contenido de la barra del sistema.
- Agrandar el target del botón "Listo": `padding: spacing.lg`, texto más grande y `fontWeight` bold,
  ancho completo. Mantener `testID="summary-done"`.

### F. (Backend) Log de `PUT /sessions` — requiere deploy a la Pi

- En `backend/src/routes/sessions.ts`, en `r.put("/:id")`, loguear de forma estructurada
  `userId`, `id` y el **status de salida** (200/400/409) — hoy el backend no loguea requests, así que
  no se ve nada en `docker logs`.
- Un `console.log`/logger simple de una línea; sin PII más allá del `userId` (que ya es interno).
- Un merge a `main` **auto-deploya a la Pi** → se confirma el deploy con el owner antes de mergear.

## Testing (TDD, verificación por mutación de cada test nuevo)

- **`SyncError` / `putSession`**: cada status HTTP mapea al `kind` correcto y a `retryable`
  correcto; una excepción de red → `network`.
- **`syncPending`**: con un `putSession` fake — todos OK → `{ synced: N, remaining: 0, lastError: null }`;
  uno falla con `network` → queda en cola, `remaining` correcto, `lastError` seteado, las demás
  suben; un terminal (`validation`) → queda en cola con `lastError`, no se descarta.
- **`useSyncPendingSessions`** (o su función de flush pura): al montar dispara el flush; al pasar a
  `"active"` vuelve a disparar; sin `url` no dispara; no corre dos flushes solapados.
- **UI de resumen**: renderiza "Pendiente de sincronizar — {motivo}" + botón reintentar cuando el
  sync falla; "Guardado ✓" cuando resuelve; el botón reintentar re-dispara y actualiza.
- **Backend PUT /sessions**: el log se emite con `userId`/`id`/status (spy sobre el logger) en 200 y
  en 400.

## Fuera de alcance

- El **segundo bug a confirmar** del ticket (sesiones con 0 sets / duración de segundos): requiere ver
  al usuario entrenar; queda como investigación aparte, no se implementa acá.
- Reintentos con backoff temporizado / cola en background nativa: el re-flush por foreground + botón
  manual cubre el caso; un scheduler más sofisticado es v-next si hiciera falta.
- Logging de requests global del backend (más allá de `PUT /sessions`): se puede sumar después.

## Refs de código

- `mobile/app/sesion.tsx` (`onFinish:545`, resumen `if (finishedSession):338`, `saveFinishedNotes:577`)
- `mobile/src/sync/syncSessions.ts` (`syncPending`)
- `mobile/src/storage/pendingSessions.ts` (`getPendingSessions`/`enqueueSession`/`removePendingSession`)
- `mobile/src/api/sessions.ts` (`putSession`), `mobile/src/api/client.ts` (`apiFetch`, manejo de 401)
- `mobile/app/_layout.tsx` (`Guarded`, montaje de hooks al autenticarse)
- `backend/src/routes/sessions.ts` (`r.put("/:id"):107`)
