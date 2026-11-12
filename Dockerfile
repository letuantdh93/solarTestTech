# ── Solar PV Examination Platform – production image ──
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @solar/server exec prisma generate && pnpm build && pnpm --filter @solar/server deploy --prod --legacy /out \
 && cp -r apps/server/dist apps/server/prisma apps/server/assets /out/ && mkdir -p /out/web && cp -r apps/web/dist /out/web/dist

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=2112 HOST=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && useradd -r -u 10001 solar && mkdir -p /data/uploads && chown solar /data/uploads
WORKDIR /srv/solar/apps/server
COPY --from=build /out ./
# config.ts resolves the SPA at <root>/apps/web/dist
RUN mkdir -p /srv/solar/apps/web && mv web/dist /srv/solar/apps/web/dist && ./node_modules/.bin/prisma generate
USER solar
EXPOSE 2112
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:2112/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
