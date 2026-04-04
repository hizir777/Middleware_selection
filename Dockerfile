# ═══════════════════════════════════════════════════
# Multi-stage Build — Middleware Selection
# ═══════════════════════════════════════════════════

# ─── Stage 1: Dependencies ────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ─── Stage 2: Release ─────────────────────────────
FROM node:20-alpine AS release
WORKDIR /app

# Güvenlik: Root yetkisi yerine 'node' kullanıcısı
# Container breakout riskini minimize eder
RUN mkdir -p /app/logs && chown -R node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node package.json ./

# Non-root kullanıcıya geçiş (UID 1000)
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/app.js"]
