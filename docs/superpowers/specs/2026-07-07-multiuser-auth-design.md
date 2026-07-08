# Multi-usuario + exposición a internet — diseño

> Fecha: 2026-07-07. Estado: aprobado por el usuario. Meta: que la familia use la app por internet, con login real.

## Contexto (qué ya existe)
El **backend multi-usuario ya está construido** y gateado por `SINGLE_USER_MODE`:
- Tablas `users`, `sessions` (token + TTL). Rutas `/auth/register` (con `inviteCode`), `/auth/login`, `/auth/logout`. Hash de password (`auth/passwords`), sesiones (`auth/sessions`).
- Middleware `requireAuth` protege `/settings`, `/programs`, `/profile`, `/memory`, `/app`. En `SINGLE_USER_MODE=true` se saltea y usa `SINGLE_USER_ID` (constante).
- **Falta**: login en la app mobile, key de IA compartida, migración de datos, y la exposición segura.

## Principio de seguridad (define el orden)
No se puede exponer a internet con `SINGLE_USER_MODE=true` (= sin auth: cualquiera sería el usuario por defecto, con acceso a los datos y a la API key). Por eso el login debe estar activo **antes** de exponer. Cutover:
1. Construir A (código) + mergear.
2. En la Pi (todavía LAN-only): setear env multi-usuario + key default; **el owner se registra y corre la migración** para reclamar sus datos (antes de que exista cualquier otro registro).
3. Recién ahí exponer (B): DNS + nginx + certbot.

---

## Sub-proyecto A — Multi-usuario (código)

### A1. Backend

**Key de IA del server + override por usuario**
- `config.ts`: nueva env **`ANTHROPIC_API_KEY`** (opcional) → `config.defaultAiApiKey?: string`. `app.ts`: agregar `defaultAiApiKey?: string` a `AppConfig`.
- Helper `resolveAiKey(row, config): string | null` = si `row?.aiApiKeyEncrypted` → `decryptSecret(...)`; si no → `config.defaultAiApiKey ?? null`.
- Sitios que hoy hacen 400 "No hay API key" y desencriptan (`backend/src/routes/programs.ts` en `/generate` ~L22-25 y `/generate-oneoff` ~L71-74, y el flujo de memoria que use la key): reemplazar por `resolveAiKey`; devolver 400 **solo si es null** (ni user key ni server key). El modelo sigue: `row?.aiModel ?? config.defaultModel`.
- `deploy/app.env.example`: documentar `ANTHROPIC_API_KEY` (opcional; key por defecto del server).

**Migración de datos del usuario por defecto → cuenta del owner**
- Script one-shot (`backend/scripts/claim-single-user.ts`, corrible con `bun run` dentro del contenedor/Pi) que recibe el email del owner (arg o env), busca su `users.id`, y **reasigna** `user_id` de `SINGLE_USER_ID` → ese id en: `settings`, `profiles`, `athlete_memory`, `programs`, `workout_session`. (Los hijos `session_exercise`/`set_log` cuelgan de `workout_session` por `session_id`, no por `user_id` → no se tocan.)
- Idempotente/seguro: correr en una transacción; validar que el usuario destino existe; `settings`/`profiles`/`athlete_memory` tienen `user_id` como PK — un usuario recién registrado no tiene esas filas, así que el `UPDATE` del PK no colisiona (verificarlo y abortar si colisiona).

**Hardening**
- Rate-limit en `/auth/login` y `/auth/register`: se hace en **nginx** (`limit_req`) en el sub-proyecto B (reusa infra), no en la app. (Anotado acá para trazabilidad.)

### A2. Mobile (requiere **APK nuevo vc7** — `expo-secure-store` es módulo nativo, no va por OTA)

- **Token**: `expo-secure-store` (keychain encriptado). Storage helper `src/storage/authToken.ts` (`getToken`/`setToken`/`clearToken`). Agregar dep `expo-secure-store`.
- **API client** (`src/api/client.ts`, `apiFetch`): adjuntar `Authorization: Bearer <token>` (si hay token) a los headers. En respuesta **401** → `clearToken()` + navegar a login (señal para el guard).
- **API de auth** (`src/api/auth.ts`): `login(email, password)`, `register(email, password, inviteCode)`, `logout()` contra `/auth/*`. Guardan/limpian el token.
- **Pantallas**: `app/login.tsx` (email + password + link a registro) y `app/registro.tsx` (email + password + invite code). Al éxito → guardar token → entrar a la app.
- **Guard de auth**: en el layout raíz (`app/_layout.tsx`), al montar leer el token; sin token → redirigir a `/login`; con token → la app. Manejar el 401 global (logout → login).
- **Logout**: botón en Configuración (`app/configuracion.tsx`) → `logout()` + `clearToken()` → login.
- **URL del backend**: default **`https://pulsia.lahuelladelcaminante.de`** (constante), override opcional en Configuración (avanzado). Apagar `usesCleartextTraffic` en `app.json` (ya es HTTPS). (Esto cambia el fingerprint → parte del build vc7.)

### Tests (TDD)
- `backend`: `resolveAiKey` (user key → esa; sin user key + server key → server; sin ninguna → null → 400). Route `/generate` y `/generate-oneoff` usan el fallback. Migración: reasigna las tablas correctas y aborta si el destino no existe o colisiona.
- `mobile`: `apiFetch` adjunta `Authorization` cuando hay token y no cuando no; en 401 limpia el token. Login/Registro llaman el endpoint y guardan token. Guard: sin token → login.

---

## Sub-proyecto B — Exposición segura (runbook, se ejecuta con confirmación paso a paso)

Reusa el patrón de las otras apps de la Pi (nginx en el VPS → Wireguard `10.8.0.2` → Pi). Todos estos pasos tocan servicios externos → **confirmación explícita por paso**.

1. **Cutover en la Pi (LAN-only todavía)**: en `deploy/app.env` setear `SINGLE_USER_MODE=false`, `ANTHROPIC_API_KEY=<key del server>`, confirmar `ADMIN_TOKEN`. Redeploy (`docker compose up -d --build`). Verificar `/health`.
2. **Reclamar datos**: el owner se registra (LAN) con el invite code → correr `claim-single-user.ts` con su email. Verificar que ve su historial.
3. **DNS**: A record `pulsia.lahuelladelcaminante.de` → `187.33.155.194`.
4. **nginx** (VPS, `/etc/nginx/sites-available/pulsia.lahuelladelcaminante.de`): `server_name` + `proxy_pass http://10.8.0.2:3011` + headers de seguridad (como vaultwarden) + `limit_req` en `location /auth/`. `nginx -t` + reload.
5. **certbot**: `certbot --nginx -d pulsia.lahuelladelcaminante.de` → HTTPS.
6. **App**: build vc7 con login + URL default https; subir al release + `PUT /app/latest`. Compartir el APK + invite code con la familia.

---

## Fuera de alcance (YAGNI)
Reset de password por email, verificación de email, roles/admin UI, OAuth/social login, multi-device session management avanzado. Con invite code + email/password alcanza para familia.

## Decomposición (specs → planes → PRs)
- **PR-A1 — backend**: key del server + `resolveAiKey` + script de migración. Con code review.
- **PR-A2 — mobile**: secure token, apiFetch auth, login/registro/logout, guard, URL default, cleartext off. Con code review. → build vc7.
- **B**: runbook ejecutado con confirmación (no es un PR de código, salvo el archivo nginx que se versiona en `docs/`).
