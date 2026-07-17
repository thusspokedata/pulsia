# Pulsia

**Tu compañero de salud y entrenamiento, self-hosted.** Pulsia es una app de fitness y salud con IA que corre **en tu propio servidor** — una VPS o una Raspberry Pi en tu casa — para que **tus datos sean tuyos y solo tuyos**. Nada de nubes de terceros, nada de vender tu información: la base de datos vive en tu hardware, bajo tu control.

> No es un SaaS. Es software que vos levantás, en tu máquina, con tus llaves.

---

## Por qué existe

Las apps de salud comerciales (entrenamiento, nutrición, ECG, presión, sueño…) concentran datos íntimos de tu cuerpo en servidores ajenos. Pulsia da vuelta ese modelo:

- 🏠 **Corre en tu casa o tu VPS.** Un `docker compose up` en una Raspberry Pi alcanza para toda la familia.
- 🔐 **Los datos nunca salen de tu servidor.** PostgreSQL propio; la app móvil le pega directo a *tu* backend.
- 🔑 **Tus llaves, encriptadas.** La API key de Anthropic se guarda cifrada (AES-256-GCM) en tu base — no en texto plano, no en un tercero.
- 🌐 **Vos decidís la exposición.** Solo en tu LAN, detrás de una VPN (Wireguard/Tailscale), o público con HTTPS. Ninguna de las opciones te obliga a ceder los datos a nadie.
- 👨‍👩‍👧 **Multi-usuario con invitación.** Registro cerrado por `INVITE_CODE`: entra quien vos querés (tu familia), nadie más.

---

## Qué hace

Pulsia tiene tres grandes dominios, todos alimentando una **memoria evolutiva del atleta** que la IA observa para darte contexto:

### 🏋️ Entrenamiento
- Genera **programas de entrenamiento** con IA de forma asíncrona.
- Registra, pausa/reanuda y revisa **sesiones** con atribución precisa de trabajo vs. descanso.
- **Frecuencia cardíaca** en vivo desde una banda de pulso **BLE** (Bluetooth).
- Resumen de sesión con **mapa corporal** de músculos trabajados + curva de FC.
- Actividades de **cardio** (caminata, running, elíptica, bici, natación, remo) con estimación de gasto calórico por tipo de actividad (MET).

### 🍎 Nutrición
- Alta de alimentos por **foto + IA** (visión) o **escribiendo el nombre** → catálogo personal.
- Registro en gramos/ml/unidad con snapshot de macros, micros, colesterol y agua.
- **Metas calóricas y de macros** derivadas del perfil (BMR Mifflin-St Jeor + objetivo + gasto de entrenamiento = *net calories*, estilo MyFitnessPal).
- **Dashboard del día** con pestañas: Resumen, Calorías (torta por comida), Nutrientes vs. referencias OMS, Macros (dona vs. meta).
- **Qué alimentos aportan cada nutriente** y su evolución en el tiempo.
- **Suplementos**: catálogo por foto + plan semanal armado por IA + checklist diario + ajuste dinámico.
- Tracker de líquido y un **agente de informes** (diario/semanal/mensual, opt-in).

### 📈 Progreso y Salud
- Seguimiento cuantitativo: composición corporal, presión, actividad, bienestar (con backfill).
- Tendencias y heatmap.
- **ECG (KardiaMobile)**: interpretación con IA **no diagnóstica** de los PDFs de Kardia (incluye los cifrados con contraseña).

> La IA **observa** (progreso, ECG, informes de nutrición) y construye la memoria del atleta, visible para vos.

---

## Arquitectura

Monorepo con workspaces de [Bun](https://bun.sh):

```
pulsia/
├── shared/     Lógica y tipos compartidos (nutrición, ejercicio, referencias…)
├── backend/    API en Bun + Hono + Drizzle ORM + PostgreSQL (pgvector)
├── mobile/     App Android en Expo / React Native
└── deploy/     docker-compose + env de ejemplo para levantarlo en tu servidor
```

- **Backend** — [Bun](https://bun.sh) + [Hono](https://hono.dev) + [Drizzle ORM](https://orm.drizzle.team) sobre **PostgreSQL con pgvector** (para la memoria del atleta). IA vía el SDK de Anthropic (Claude). Corre en Docker; el contenedor **auto-migra, seedea y arranca** solo.
- **Móvil** — [Expo](https://expo.dev) / React Native. Se distribuye como **APK** (descarga directa, sin tienda) y se actualiza por **OTA** (expo-updates) sin reinstalar.
- **DB** — imagen `pgvector/pgvector:pg16`, volumen persistente en tu servidor.

---

## Levantarlo en tu servidor (Raspberry Pi o VPS)

Requisitos: una Raspberry Pi (ARM64) o una VPS con **Docker + Docker Compose**. El backend es una imagen de Bun multi-arch, así que corre igual en `arm64` que en `x86_64`.

### 1. Cloná el repo en el servidor

```bash
git clone https://github.com/thusspokedata/pulsia.git
cd pulsia
```

### 2. Configurá el entorno

```bash
cp deploy/app.env.example deploy/app.env
```

Editá `deploy/app.env`. Las claves las generás vos, en tu servidor:

```bash
# Clave para cifrar secretos en la DB (AES-256-GCM, 32 bytes hex)
openssl rand -hex 32   # → ENCRYPTION_KEY

# Código de invitación para que se registre tu familia
openssl rand -hex 8    # → INVITE_CODE
```

Campos principales:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a Postgres (por defecto apunta al servicio `db` del compose). |
| `ENCRYPTION_KEY` | Cifra secretos (como la API key de Anthropic) en tu DB. **Obligatoria.** |
| `INVITE_CODE` | Cierra el registro: solo entra quien tenga este código. |
| `SINGLE_USER_MODE` | `true` saltea el login (un solo usuario). Ponelo en `false` para multi-usuario. |
| `ANTHROPIC_API_KEY` | Key por defecto del server *(opcional)*. Si falta, cada usuario carga la suya desde la app y se guarda **cifrada**. |
| `ADMIN_TOKEN` | Token para publicar nuevas releases del APK *(opcional)*. |

> La API key de Anthropic **no es obligatoria en el env**: cada usuario puede cargar la propia desde la app, y queda cifrada en tu base. Vos elegís.

### 3. Levantá el stack

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

Esto arranca **PostgreSQL + backend**. El contenedor del backend corre las migraciones y el seed automáticamente. Verificá:

```bash
curl http://localhost:3011/health   # → {"status":"ok"}
```

El backend queda escuchando en el puerto **3011** de tu servidor.

### 4. Exponelo (elegí según tu paranoia)

- **Solo LAN/VPN** — dejalo en `:3011` y accedé por IP local o por **Wireguard/Tailscale**. Máxima privacidad, cero superficie pública.
- **Público con HTTPS** — poné un **nginx** (o Caddy/Traefik) por delante con certificado (Certbot/Let's Encrypt) apuntando al `:3011`. Recomendado agregar rate-limit en `/auth/`.

> El deployment de referencia del autor usa **VPS con nginx → Wireguard → Raspberry Pi**, HTTPS por Certbot. Es una de tantas topologías válidas: lo importante es que el dato vive en *tu* Pi.

### 5. La app móvil

La app Android (`mobile/`) apunta por defecto a la URL del backend definida en [`mobile/src/config/backend.ts`](mobile/src/config/backend.ts) y **permite overridearla desde Configuración → avanzado**. Para tu propio despliegue:

- Cambiá `DEFAULT_BACKEND_URL` por la URL de tu servidor, **o**
- Dejala como está y, en la app, poné tu URL en Configuración.

Buildeás el APK con [EAS](https://docs.expo.dev/build/introduction/) o localmente (`mobile/android/`), lo servís desde tu propio backend (`/download` genera una página con QR) y tu familia lo instala y se registra con el `INVITE_CODE`.

---

## Desarrollo local

Necesitás [Bun](https://bun.sh). Para la DB de desarrollo hay un compose en la raíz:

```bash
bun install                       # instala todos los workspaces

docker compose up -d              # Postgres local (pgvector) en :5432

# Backend
cd backend
cp ../deploy/app.env.example .env   # ajustá DATABASE_URL a localhost
bun run db:migrate                  # aplica migraciones
bun run db:seed                     # usuario por defecto + catálogo
bun run dev                         # backend con --watch en :8787

# Móvil (en otra terminal)
cd mobile
bun run start                       # Expo dev server
```

Comandos útiles desde la raíz:

```bash
bun test              # tests de shared + backend
bun run test:mobile   # tests del móvil (jest)
bun run typecheck     # typecheck de todos los workspaces
```

---

## Filosofía de datos

- **Tu servidor, tu base, tus llaves.** No hay un backend central de Pulsia. El que levantás sos vos.
- **Secretos cifrados en reposo.** Las API keys se guardan con AES-256-GCM usando *tu* `ENCRYPTION_KEY`.
- **Registro cerrado.** Sin `INVITE_CODE` no se registra nadie: no es una red social, es la app de tu familia.
- **La IA es opcional y es tuya.** Usás tu propia API key de Anthropic; las interpretaciones de ECG son explícitamente **no diagnósticas**.

---

## Estado

Proyecto personal en uso activo por la familia del autor. Backend en producción sobre Raspberry Pi, app Android distribuida por APK + OTA. Los dominios de Entrenamiento, Nutrición y Progreso/Salud están operativos; el detalle de avance vive en [`ONBOARDING.md`](ONBOARDING.md).

## Licencia

**GNU Affero General Public License v3.0 (AGPL-3.0)** — ver [`LICENSE`](LICENSE).

Copyright (C) 2026 thusspokedata

Se eligió la AGPL a propósito: es coherente con el espíritu self-hosted del proyecto. Podés usar, estudiar, modificar y redistribuir Pulsia libremente; a cambio, cualquier versión modificada que se ofrezca a terceros **como servicio de red** debe publicar su código fuente. Así el software (y sus forks) sigue siendo self-hosteable por todos y no puede cerrarse en un SaaS propietario.

> Nota: [`mobile/LICENSE`](mobile/LICENSE) es la licencia MIT de Expo, incluida por el template de la app móvil — aplica a ese componente de terceros, no al proyecto.
