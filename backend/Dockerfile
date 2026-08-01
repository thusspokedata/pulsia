# Backend Pulsia para la Pi (aarch64). Imagen Bun multi-arch (arm64 ok).
# El contexto de build es la RAÍZ del monorepo (para acceder a shared/ + backend/).
FROM oven/bun:1

WORKDIR /app

# Manifiestos primero (cache de capas). Copiamos el package.json y el bun.lock REALES
# del repo para que el install sea reproducible (frozen): las versiones transitivas
# quedan pineadas por el lockfile, no re-resueltas en cada build.
# Se copia también mobile/package.json aunque NO instalemos sus deps: el workspace
# "mobile" figura en el package.json raíz y bun exige que todos los manifests existan
# para validar el lockfile congelado. --filter '!@pulsia/mobile' excluye a Expo/React
# Native del install (la SPA web sí se instala y se buildea; el backend la sirve desde
# /app/web/dist).
COPY package.json bun.lock ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json
COPY mobile/package.json mobile/package.json
COPY tsconfig.base.json ./
RUN bun install --frozen-lockfile --filter '!@pulsia/mobile'

# Código
COPY shared shared
COPY backend backend
COPY web web

# Build de la SPA (web/dist). El monorepo ya está copiado y las deps instaladas.
# El backend la sirve desde WEB_DIST_DIR=/app/web/dist (default en index.ts).
RUN cd web && bun run build

# qpdf para descifrar PDFs de ECG protegidos con contraseña.
RUN apt-get update && apt-get install -y --no-install-recommends qpdf && rm -rf /var/lib/apt/lists/*

# Correr como usuario no-root (la imagen oven/bun trae el usuario "bun").
RUN chown -R bun:bun /app
USER bun

WORKDIR /app/backend
EXPOSE 8787

# Migrar el esquema + seed (idempotente: usuario por defecto + catálogo) + arrancar.
# La DB se espera vía depends_on healthy en el compose.
CMD ["sh", "-c", "bun run db:migrate && bun run db:seed && bun run start"]
