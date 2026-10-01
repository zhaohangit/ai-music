# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

# Keep dependency installation in its own layer so source-only changes reuse it.
FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS build
COPY server server
COPY web web
RUN npm run build
RUN npm prune --omit=dev

FROM node:${NODE_VERSION} AS runtime
ARG APP_VERSION=development
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PLATFORM_MODE=true \
    RUNTIME_ROLE=all \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web/dist

RUN apk add --no-cache ffmpeg font-noto-cjk
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
# Migrations are runtime assets and are checksum-verified before use.
COPY --from=build --chown=node:node /app/server/migrations ./server/migrations
COPY --from=build --chown=node:node /app/web/dist ./web/dist
COPY --chown=node:node LICENSE ./LICENSE

RUN mkdir -p /data/objects && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8787

# Worker-only containers do not bind HTTP. API/all roles must answer liveness.
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "if(process.env.RUNTIME_ROLE==='worker')process.exit(0);fetch('http://127.0.0.1:'+(process.env.PORT||'8787')+'/health/live').then(r=>{if(!r.ok)throw new Error(String(r.status))}).catch(()=>process.exit(1))"]

CMD ["node", "server/dist/index.js"]
