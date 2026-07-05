# Auto-deploy del backend a la Pi (CI) — setup

El workflow `.github/workflows/deploy.yml` despliega el backend a la Raspberry Pi en cada push a `main`:
`rsync` del repo → `docker compose up -d --build` (el `CMD` del contenedor auto-migra + seedea + arranca) → health check.

Corre en un **runner self-hosted en la propia Pi** (la Pi es LAN/VPN-only, los runners cloud de GitHub no
la alcanzan; por eso self-hosted).

## ⚠️ Prerrequisito: registrar un runner self-hosted en el repo `pulsia`

Hoy la Pi tiene un runner self-hosted, pero **registrado en `thusspokedata/viajarpais`**
(`/home/kilo/actions-runner`, `gitHubUrl: .../viajarpais`), NO en `pulsia`. Un runner registrado a nivel
repo sirve **solo a ese repo**. Hasta registrar uno para `pulsia`, este workflow **queda en cola sin
correr** (no rompe nada).

Opciones (elegí una):

### A. Segundo runner para `pulsia` (recomendado, aísla los dos proyectos)
En la Pi, en un directorio nuevo (ej. `/home/kilo/actions-runner-pulsia`):
1. GitHub → repo `pulsia` → **Settings → Actions → Runners → New self-hosted runner** (Linux, ARM64).
   Copiá el comando de `./config.sh --url https://github.com/thusspokedata/pulsia --token <TOKEN>`.
2. Descargá/extraé el runner en el dir nuevo, corré `./config.sh ...`, y luego `sudo ./svc.sh install kilo && sudo ./svc.sh start`.
3. El runner queda como servicio (como el de viajarpais) y toma los jobs de `pulsia`.

### B. Runner a nivel organización
Si movés `pulsia` (y viajarpais) a una **org**, podés registrar el runner a nivel org (Settings → Actions
→ Runners de la org) y sirve a todos los repos. Requiere org.

## Verificar
Tras registrar el runner de `pulsia`:
- Merge de este PR → el push a `main` dispara `Deploy backend (Pi)` → mirá **Actions** en el repo.
- El job hace el `rsync` + `docker compose up -d --build` + health check (`GET :3011/health` → 200).

## Notas
- `deploy/app.env` (secretos) **no** se toca (excluido del rsync, sin `--delete`).
- Si preferís deploy manual, el proceso sigue disponible: `rsync` + `docker compose -f deploy/docker-compose.yml up -d --build` desde `/home/kilo/pulsia` (ver ONBOARDING §9).
- El workflow tiene `workflow_dispatch`, así que también se puede disparar a mano desde Actions.
