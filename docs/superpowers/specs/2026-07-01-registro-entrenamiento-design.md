# Registro de entrenamiento (sesión en vivo + logging) — diseño

> Fecha: 2026-07-01. Estado: aprobado, pendiente de plan de implementación.
> Sub-proyecto **A** de la visión "hacer todo desde el teléfono". B (banda Polar / HR por BLE) y
> la ingesta de datos Garmin son sub-proyectos siguientes (ver "Futuro / fuera de alcance").

## Problema y objetivo

Hoy la app **genera** un programa (weeks → workouts gym/home → exercises con sets/reps/targetLoad
prescritos) y lo **muestra** (viewer), pero **no hay dónde registrar lo que realmente hiciste**. No
existe tabla de sesión/log de entrenamiento (la tabla `sessions` es de auth).

El usuario quiere **independizarse del reloj Garmin y usar el teléfono como hub activo del
entrenamiento**: ejecutar la rutina del día guiado, y registrar reps/peso/RPE reales por serie
(porque el plan es fijo pero el rendimiento varía según el día — "puedo estar más o menos
cansado"), además de tiempos (total, por ejercicio, por repetición).

## Decisiones tomadas (brainstorming)

- **Interacción:** sesión **guiada en vivo**, serie por serie, con tap por repetición (tempo).
- **Conectividad:** **offline / local-first** — en el gimnasio el teléfono no alcanza el backend
  (vive en Mac/Raspberry por LAN/VPN). Se captura todo en el teléfono y se sincroniza al reconectar.
- **Desvío del plan:** ajustar reps/peso reales, más/menos series, saltar un ejercicio (se guarda
  planificado vs real). Sin agregar/sustituir ejercicios (eso es freestyle → futuro).
- **Logs editables:** corregir reps/peso/RPE de cualquier serie, aun después de terminar.
- **Layout:** **A · foco en la repetición** — una serie a la vez, botón grande central (tap por
  rep), peso/RPE al terminar la serie, timers y timer de descanso. Barra fija arriba con el **HR**.
- **HR:** en vivo **y guardado por serie** (pico/promedio). El pulso real llega con el sub-proyecto
  B; en A el espacio queda reservado y los campos de HR existen en el schema (nulos).

## Enfoque de arquitectura: local-first con sync de sesión completa idempotente

La sesión en curso vive en el teléfono. Al terminar entra a una cola de "pendientes de sync". Cuando
el teléfono recupera acceso al backend, sube la sesión con **`PUT /sessions/:id`** donde `id` es un
UUID generado en el cliente → **upsert**, así re-subir o editar no duplica.

*Alternativa descartada (YAGNI):* base SQLite en el dispositivo con sync fila por fila — más
escalable pero pesado. Para un usuario y el volumen real, AsyncStorage + upsert de sesión completa
alcanza y calza con cómo ya se guardan perfil y programa.

## Modelo de datos

### En el teléfono (AsyncStorage)

- `pulsia.activeSession` — la sesión en curso (o `null`).
- `pulsia.pendingSessions` — cola de sesiones terminadas esperando sync.

### En el backend (3 tablas nuevas, migración Drizzle)

- **`workout_session`**: `id` (uuid, = id del cliente), `user_id` (fk users), `program_id` (fk
  programs), `week_number`, `day_label`, `location` (gym/home), `started_at`, `ended_at`,
  `total_duration_ms`, `notes`, `created_at`, `updated_at`.
- **`session_exercise`**: `id`, `session_id` (fk), `catalog_id`, `order`, `planned` (jsonb:
  sets/reps/targetLoad/restSeconds del plan), `skipped` (bool).
- **`set_log`**: `id`, `session_exercise_id` (fk), `set_number`, `reps` (int, real), `weight_kg`
  (numeric), `rpe` (int, null), `started_at`, `ended_at`, `duration_ms`, `rep_timestamps` (jsonb:
  offsets en ms desde el inicio de la serie, para el tempo), **`hr_avg` (int, null)**,
  **`hr_max` (int, null)**, `skipped` (bool).

Los campos `hr_avg`/`hr_max` **ya quedan en el schema** (nulos en A). Cuando llegue B se llenan sin
migración → satisface "HR guardado por serie".

## Tipos compartidos

`SessionSchema` / `SessionExerciseSchema` / `SetLogSchema` en `@pulsia/shared` (Zod, fuente de
verdad, igual que `ProgramSchema`), reusados por backend y mobile.

## Ciclo de vida y sync

1. Desde el viewer del día → **Empezar entrenamiento** → crea `activeSession` (UUID cliente,
   snapshot del workout del día como `planned`).
2. Captura local serie por serie (ver abajo).
3. **Terminar** → resumen de la sesión → pasa de `activeSession` a `pendingSessions`.
4. Un proceso de sync sube cada pendiente con `PUT /sessions/:id` cuando hay backend; al confirmar
   (2xx) la saca de la cola.
5. Editar una serie (aun después de terminar) actualiza local y re-encola → el `PUT` reemplaza la
   sesión entera (idempotente).

Endpoints backend: `PUT /sessions/:id` (upsert de la sesión + hijos), `GET /sessions/:id` y
`GET /sessions` (para el resumen / última sesión). Scoping por `SINGLE_USER_ID` como el resto.

## Captura en vivo (Layout A)

- **Tempo por rep:** cada tap guarda un timestamp (offset desde el inicio de la serie) en
  `rep_timestamps`. De ahí salen tiempo por rep y duración de la serie. El conteo de reps es
  editable (corregir si se tocó de más/menos).
- **Timers:** total del entrenamiento; por serie (auto inicio/fin); por ejercicio (suma de sus
  series); descanso entre series.
- **Peso + RPE por serie** al terminar cada serie. Escala **RPE 6–10** (estándar de fuerza),
  opcional.
- **Editable:** tocar cualquier serie ya cargada → ajustar reps/peso/RPE.
- **Desvío:** ajustar peso/reps, más/menos series, saltar ejercicio (guardando planificado vs real).

## Alcance de A

**Incluye:** ejecutar el día del plan, capturar reps/peso/RPE/tempo/timers, guardar local,
terminar → pantalla de resumen, y sync al backend (idempotente, offline-first).

**Fuera de alcance (futuro):**
- **HR real** (sub-proyecto B: banda Polar por BLE + dev build; el schema ya está listo).
- **Ingesta de datos Garmin** (Health API: sueño, balanza Index, HRV; y/o import `.FIT`).
- **PT agent** conversacional (ajuste del plan por chat sobre los logs).
- **Sugerencia de peso** por historial (backlog; se apoya en estos logs).
- **Dashboard/gráficos** de historial y **datos ambientales** (backlog).
- **Freestyle**: agregar/sustituir ejercicios o entrenar días sin plan.

## Testing (TDD)

- **shared:** los schemas de sesión validan/rechazan bien (reps ≥ 0, rpe en rango, location válida).
- **backend:** `PUT /sessions/:id` hace **upsert idempotente** (re-subir la misma sesión no
  duplica; una edición reemplaza); `GET` devuelve la sesión con sus ejercicios y series; validación
  de payload.
- **mobile:** store de sesión (empezar / agregar serie / editar / terminar); cola de sync (encola al
  terminar, vacía al reconectar, idempotente ante reintentos); derivación de tempo desde
  `rep_timestamps`; y la pantalla en vivo (tap incrementa reps, timers corren, editar corrige).

## Entrega

Probablemente **2 PRs** (como veníamos): (1) backend — schemas en shared + tablas + endpoints;
(2) mobile — pantalla en vivo (Layout A) + store local + cola de sync. Flujo por PR con CodeRabbit.
