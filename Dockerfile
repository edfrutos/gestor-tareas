FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Instalar dependencias para compilar módulos nativos (sqlite3, sharp, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# deps
COPY package*.json ./
RUN npm ci --omit=dev

# app
COPY src ./src

# sanity checks
RUN node -e "require('./src/middleware/logger'); console.log('logger OK')"
RUN node -e "require('./src/db/sqlite'); console.log('sqlite OK')"
RUN node -e "require('sharp'); console.log('sharp OK')"

# runtime dirs
RUN mkdir -p /app/uploads /app/data

EXPOSE 3000
CMD ["node", "src/server.js"]