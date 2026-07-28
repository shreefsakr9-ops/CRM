# syntax=docker/dockerfile:1
# Blue Point OS — صورة إنتاج متعددة المراحل (تعمل على AMD64 و ARM64/Ampere)

# ── 1) التبعيات ────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ── 2) البناء ──────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL وهمي وقت البناء فقط — Prisma يحتاجه لتوليد العميل ولا يتصل بالقاعدة.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npx prisma generate && npm run build

# ── 3) التشغيل ─────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROMIUM_PATH=/usr/bin/chromium

# chromium مطلوب لتوليد PDF العربي — متوفر لـ amd64 و arm64 في Debian.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates curl tini \
      chromium \
      fonts-liberation libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs bluepoint

COPY --from=builder /app/public ./public
COPY --from=builder --chown=bluepoint:nodejs /app/.next/standalone ./
COPY --from=builder --chown=bluepoint:nodejs /app/.next/static ./.next/static

# مطلوبة للمايجريشن والـ worker والـ seed في وقت التشغيل
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/zod ./node_modules/zod
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN mkdir -p /app/storage && chown -R bluepoint:nodejs /app/storage /app/.next

USER bluepoint
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
