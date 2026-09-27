# syntax=docker/dockerfile:1
# 単一コンテナで Web UI + JSON API + S3 ポーリング + Webhook 配送を動かす。
#   docker build -t bucketeye .
#   docker run -p 3000:3000 -v bucketeye-data:/data -e S3_BUCKET=... -e AUTH_PROVIDER=... bucketeye
# 使い方の全体は README と compose.yml を参照

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# vite build（dist/web）+ esbuild でサーバを 1 ファイルに束ねる（dist/server.js。依存も同梱）
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/up').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.js"]
