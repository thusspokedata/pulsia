# Diseño — Pulsia: Autenticación y multi-usuario

**Fecha:** 2026-07-01
**Estado:** En revisión

## 1. Contexto

Hoy la app es **single-user**: el backend usa un `SINGLE_USER_ID` hardcodeado, y `settings` (API key), `programs` y el perfil no distinguen usuarios (el perfil vive local en el celular). Esto impide que, por ejemplo, la pareja del usuario use la app con sus propios datos.

Este sub-proyecto agrega **autenticación por usuario** y **separa los datos por usuario**. El esquema ya está parcialmente listo (las tablas referencian `userId` con FK a `users`).

### Decisiones tomadas (brainstorming)
- **Alcance:** registro **cerrado**, pocos usuarios de confianza (no público/comercial aún).
- **Mecanismo:** self-hosted, **email + contraseña** (hasheo con `Bun.password`), **sesiones con token opaco** (no JWT plano).
- **Alta de cuentas:** signup en la app con **código de invitación** (env var del backend).
- **Sesión:** persistente ("recordar sesión") con **expiración deslizante de 4 días de inactividad**.
- **Perfil:** se mueve **al backend** (por usuario), deja de ser local.

## 2. Por qué sesiones opacas y no JWT

El requisito "recordar sesión pero expirar tras ~4 días sin uso" es una **ventana deslizante**, que un JWT plano (expiración fija) no cubre sin sumar refresh tokens. Un **token de sesión opaco** guardado en el backend:
- Renueva su `expiresAt` a +4 días en cada request (deslizante).
- Permite **logout y revocación** (borrar la fila).
- Es más simple que JWT + refresh para este caso.
Costo: un lookup a la tabla `sessions` por request autenticado (irrelevante con pocos usuarios).

## 3. Arquitectura

```text
┌───────────────────────────────┐                 ┌──────────────────────────────┐
│  App mobile (Expo)            │  Authorization  │  Backend (Bun + Hono) en Pi   │
│  - Login / Registro           │  Bearer <token> │  - POST /auth/register        │
│  - token en expo-secure-store │ ──────────────▶ │  - POST /auth/login           │
│  - navegación gateada por auth│                 │  - POST /auth/logout          │
│  - perfil vía API (por user)  │ ◀────────────── │  - middleware de sesión       │
└───────────────────────────────┘                 │  - /settings /programs /profile│ (scopeados al userId)
                                                   │  - Postgres: users, sessions  │
                                                   └──────────────────────────────┘
```

## 4. Backend

### 4.1 Esquema (Drizzle)
- **`users`** (existe): agregar `email` (text, único, not null) y `passwordHash` (text, not null).
- **`sessions`** (nueva): `token` (text, PK — random 32 bytes hex), `userId` (uuid, FK → users), `expiresAt` (timestamp), `createdAt`.
- **`profiles`** (existe, `userId` PK + `data` jsonb): pasa a ser la fuente del perfil (server-side).

### 4.2 Password + token
- Hasheo/verify con **`Bun.password.hash` / `Bun.password.verify`** (argon2id por defecto; sin dependencias).
- Token de sesión: `crypto.randomBytes(32).toString("hex")`.

### 4.3 Endpoints de auth
- `POST /auth/register` — body `{ email, password, inviteCode }`. Valida `inviteCode === process.env.INVITE_CODE`; email único; crea user + sesión; devuelve `{ token }`. Errores: código inválido → 403; email en uso → 409; body inválido → 400.
- `POST /auth/login` — body `{ email, password }`. Verifica hash; crea sesión; devuelve `{ token }`. Credenciales inválidas → 401 (mensaje genérico).
- `POST /auth/logout` — borra la sesión del token actual. → 200.

### 4.4 Middleware de sesión
- Lee `Authorization: Bearer <token>`. Busca la sesión; si no existe o `expiresAt < now` → **401**. Si es válida, **corre `expiresAt = now + 4 días`** y setea `userId` en el contexto.
- Se aplica a `/settings`, `/programs/*`, `/profile/*`. `/auth/*` y `/health` quedan públicos.

### 4.5 Scoping de datos (chau `SINGLE_USER_ID`)
- `settings` y `programs` usan el `userId` del contexto (no el fijo). El endpoint de generación toma el `userId` autenticado para leer la API key y persistir el programa.
- **Perfil server-side (nuevo)**: `GET /profile` → el `TrainingProfile` del usuario (o 404 si no cargó); `PUT /profile` → guarda/actualiza (validado con `TrainingProfileSchema`). La generación puede leer el perfil guardado o recibirlo en el body (a definir en el plan; preferimos que el cliente mande el perfil que ya tiene y el backend lo persista).

### 4.6 Config (env)
- `INVITE_CODE` (código de registro). `SESSION_TTL_DAYS=4` (configurable). Se suman al `.env.example`.

## 5. Mobile

- **Pantallas**: `Login` (email, password) y `Registro` (email, password, código de invitación). Errores claros (código inválido, credenciales, email en uso).
- **Token**: en **`expo-secure-store`** (no AsyncStorage). "Recordar sesión" = el token persiste; **auto-login** al abrir si hay token válido.
- **Contexto de auth**: estado global (token/usuario); expone `login`, `register`, `logout`.
- **Navegación gateada**: si no hay token → stack de auth (Login/Registro); si hay → la app (tabs). Al recibir **401** de cualquier request → limpiar token → Login.
- **Cliente API**: agrega `Authorization: Bearer <token>` a cada request; maneja 401 centralizado.
- **Perfil**: la pantalla de Perfil pasa a **leer/guardar vía API** (`GET`/`PUT /profile`) en vez de AsyncStorage. El programa ya se lee del backend (Fase 3 del mobile) scopeado al usuario.
- **Logout**: botón (en Perfil o Configuración) que llama `POST /auth/logout` y limpia el token local.

## 6. Migración de datos

Los datos actuales bajo el `SINGLE_USER_ID` son de prueba (dev). **No se migran**: al desplegar auth, te registrás con tu email y recargás tu API key. Se documenta el reseteo (o un borrado del row `SINGLE_USER_ID`). Sin migración compleja.

## 7. Manejo de errores
- Token ausente/ inválido/ expirado → 401 (mobile → Login).
- Código de invitación inválido → 403 con mensaje claro.
- Email ya registrado → 409.
- Credenciales inválidas → 401 genérico (no revelar si el email existe).
- Fallos de red en mobile → estados de error/reintento (ya existentes).

## 8. Testing
- **Backend**: hash/verify de password; creación/validación/expiración deslizante de sesión; register (código ok/inválido, email duplicado); login (ok/credenciales inválidas); logout (revoca); middleware (sin token / token inválido / expirado → 401, token válido corre expiración); scoping (usuario A no ve datos de B).
- **Mobile**: pantallas Login/Registro (validación, errores), auto-login con token guardado, logout limpia el token, cliente API adjunta el header y maneja 401, perfil vía API.

## 9. Fases de implementación
1. **Fase A — Auth backend**: esquema (`users`+email/hash, `sessions`), `Bun.password`, endpoints register/login/logout, middleware de sesión, código de invitación. (Testeable con curl.)
2. **Fase B — Scoping + perfil server-side**: quitar `SINGLE_USER_ID`; scopear `settings`/`programs` al userId; endpoints `GET`/`PUT /profile`.
3. **Fase C — Auth mobile**: secure-store, contexto de auth, pantallas Login/Registro, navegación gateada, header + manejo de 401, logout.
4. **Fase D — Perfil mobile vía API**: la pantalla de Perfil usa `GET`/`PUT /profile` en vez de local.

## 10. Fuera de alcance (futuro)
- **Passkeys / WebAuthn** (la auth queda modular para sumar una estrategia de login por passkey después).
- Registro **público/comercial**: verificación de email, recupero de contraseña, rate limiting, términos.
- Roles/permisos, compartir programas entre usuarios.
