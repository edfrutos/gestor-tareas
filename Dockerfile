# Stage 1: Builder - instala dependencias y comprueba que cargan.
# Sin herramientas de compilación: la BD usa node:sqlite (incluido en Node) y
# sharp trae binarios precompilados para Alpine (linuxmusl x64/arm64).
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (incluidas las de desarrollo; se podan después)
RUN npm ci

# Copy source for sanity checks during build
COPY src ./src

# Sanity checks (ensure native binaries compile correctly)
RUN node -e "require('./src/middleware/logger'); console.log('logger OK')"
RUN node -e "require('./src/db/sqlite'); console.log('sqlite OK')"
RUN node -e "require('sharp'); console.log('sharp OK')"

# Remove devDependencies to reduce attack surface
RUN npm prune --production

# Stage 2: Runtime - Alpine slim image without build tools or devDependencies
FROM node:24-alpine

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
WORKDIR /app

# Only sqlite3 for recovery (Alpine has minimal packages already)
RUN apk add --no-cache sqlite

# Copy production-only dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy application source
COPY src ./src

# Create runtime directories
RUN mkdir -p /app/uploads /app/data

# Usuario sin privilegios con un uid/gid propios (10001), que no deben
# coincidir con ninguna cuenta del servidor: los bind mounts (data, uploads,
# backups) quedan a nombre de ese uid en el host. Con 1001 los ficheros eran
# del usuario de otra aplicación del servidor.
ARG APP_UID=10001
ARG APP_GID=10001
RUN addgroup -g ${APP_GID} -S appuser && \
    adduser -S -D -H -u ${APP_UID} -h /app -s /sbin/nologin -G appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3000
CMD ["node", "src/server.js"]
