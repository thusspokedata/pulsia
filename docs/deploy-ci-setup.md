# Auto-deploy del backend a la Pi (CI) — setup

> Actualizado tras #277 (18/11/2026). El flujo viejo (`rsync` + `docker compose up -d --build` con
> `deploy/docker-compose.yml` desde un runner con docker) **ya no se usa**.

El workflow `.github/workflows/deploy.yml` despliega el backend a la Raspberry Pi (pi-web) en cada push a `main`:

1. **build** (runner hosted `ubuntu-24.04-arm`): construye la imagen arm64 y la publica en GHCR como
   `ghcr.io/thusspokedata/pulsia-backend:<sha>`.
2. **deploy** (runner self-hosted en la Pi, usuario `gh-pulsia`, etiqueta `pulsia-deploy`, sin docker ni
   sudo general): solo puede correr `sudo /usr/local/sbin/deploy-pulsia <sha>`. Ese script de root (lo
   mantiene infra, no está en este repo) verifica que el sha sea `main` o ancestro, baja la imagen, hace
   `up -d` con `/srv/pulsia/compose.yml` y chequea `GET :3011/health` → 200. Migraciones + seed corren en
   el `CMD` de la imagen.

Rollback: `sudo deploy-pulsia <sha anterior>` en la Pi. Cambios al compose de producción se piden a infra.

## Password de la DB de producción

Nunca va en el repo. En la Pi vive en dos archivos de root (`chmod 600`, dir `/srv/pulsia` `750`):

| Archivo | Variable | Para qué |
|---|---|---|
| `/srv/pulsia/db.env` | `POSTGRES_PASSWORD` | `env_file` del servicio `db`. Solo se aplica al **crear** el volumen; además lo usa el backup (`pg_dump` dentro de `deploy-db-1`). |
| `/srv/pulsia/app.env` | `DATABASE_URL` (`postgres://pulsia:<password>@db:5432/pulsia`) | Con esto se conecta el backend. |

Las dos tienen que coincidir.

### Cómo se rota

`POSTGRES_PASSWORD` **no** cambia la password de una DB que ya existe: la rotación real es un `ALTER USER`.
Lo hace infra, con un script que corre en la Pi:

1. Backup: `pg_dump` de `pulsia` + copia de `db.env` y `app.env` (600).
2. Password nueva generada **en la Pi** (`openssl rand -base64 32 | tr -d '/+='`), sin imprimirla.
3. `ALTER USER pulsia PASSWORD ...` dentro de `deploy-db-1`, pasando el SQL por stdin (nunca en argv).
4. Reescribir `POSTGRES_PASSWORD` en `db.env` y la password de `DATABASE_URL` en `app.env`.
5. `docker compose -f /srv/pulsia/compose.yml up -d` (con `PULSIA_TAG` = sha actual) y chequear `/health`.
   Si falla: `ALTER USER` con la password vieja y restaurar los dos `.env` del backup.

Para comparar valores usá solo hashes (`sha256sum | cut -c1-12`); nunca `cat` de los `.env` ni
`docker inspect` sin filtrar.

## Instancia propia (fuera de la Pi)

`deploy/docker-compose.yml` sigue sirviendo para levantar tu propia instancia (ver README). La password de
la DB se lee de `deploy/.env` (no versionado, ver `deploy/.env.example`) y tiene que coincidir con la de
`DATABASE_URL` en `deploy/app.env`.

## Desarrollo local

El `docker-compose.yml` de la raíz es solo para dev: password `dev-only-change-me` (o `POSTGRES_PASSWORD`
del entorno) y publica 5432 solo en `127.0.0.1`. Si tenés un volumen de dev creado antes de este cambio,
conserva la password vieja: o seteás `DATABASE_URL` con esa, o borrás el volumen
(`docker compose down -v`, pierde los datos de dev).
