# Backend Pulsia para la Pi (aarch64). Imagen Bun multi-arch (arm64 ok).
# El contexto de build es la RAÍZ del monorepo (para acceder a shared/ + backend/).
FROM oven/bun:1

WORKDIR /app

# Manifiestos primero (cache de capas). Escribimos un package.json raíz SIN "mobile"
# para no instalar Expo/React Native en la imagen del backend.
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY tsconfig.base.json ./
RUN printf '{"name":"pulsia","private":true,"type":"module","workspaces":["shared","backend"]}\n' > package.json
RUN bun install

# Código
COPY shared shared
COPY backend backend

WORKDIR /app/backend
EXPOSE 8787

# Migrar el esquema + seed (idempotente: usuario por defecto + catálogo) + arrancar.
# La DB se espera vía depends_on healthy en el compose.
CMD ["sh", "-c", "bun run db:migrate && bun run db:seed && bun run start"]
