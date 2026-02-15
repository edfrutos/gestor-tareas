FROM node:22-bookworm-slim

ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
WORKDIR /app

# Instalar dependencias para compilar módulos nativos (sqlite3, sharp, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# deps
COPY package*.json ./
# Instalamos deps según el entorno (en dev necesitamos las devDependencies para tests)
RUN if [ "$NODE_ENV" = "production" ]; then npm ci --omit=dev; else npm ci; fi

# app
COPY src ./src

# sanity checks (solo en build time para asegurar que binarios nativos funcionan)
RUN node -e "require('./src/middleware/logger'); console.log('logger OK')"
RUN node -e "require('./src/db/sqlite'); console.log('sqlite OK')"
RUN node -e "require('sharp'); console.log('sharp OK')"

# runtime dirs
RUN mkdir -p /app/uploads /app/data

EXPOSE 3000
CMD ["node", "src/server.js"]