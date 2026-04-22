# Stage 1: Builder - compile native modules (sqlite3, sharp)
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies (Alpine packages)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for compilation)
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
FROM node:22-alpine

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

# Create non-root user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3000
CMD ["node", "src/server.js"]
