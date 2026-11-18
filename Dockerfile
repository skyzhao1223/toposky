# 多阶段构建：deps（装依赖）→ build（next build）→ runtime（standalone 运行）。
# 镜像只包含运行时产物；实例数据通过 /data 卷挂载（TOPOLOGY_DATA_DIR 指过去）。
#
#   docker build -t toposky .
#   docker run -p 127.0.0.1:3000:3000 -v "$PWD/data:/data" toposky
#
# entrypoint 仅在空的默认 /data 卷初始化虚构示例，绝不覆盖已有文件。
# 自定义数据路径仍严格报错，不做隐式回退；bind mount 需有 UID 1001 写权限。

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Use the public registry explicitly and fail promptly on stalled downloads.
RUN npm ci --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-retries=1 --fetch-timeout=30000

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prebuild 会跑 npm run validate（无实例数据时校验示例数据）
RUN npm run notices:check && npm run notices:bundle && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TOPOLOGY_DATA_DIR=/data

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# 示例数据是「无实例数据时」的兜底，必须随镜像分发
COPY --from=build --chown=nextjs:nodejs /app/examples/demo ./examples/demo
COPY --from=build --chown=nextjs:nodejs /app/scripts/docker-entrypoint.mjs /app/scripts/healthcheck.mjs ./scripts/
COPY --from=build --chown=nextjs:nodejs /app/LICENSE /app/NOTICE /app/THIRD_PARTY_NOTICES.md ./
COPY --from=build --chown=nextjs:nodejs /app/licenses ./licenses
COPY --from=build --chown=nextjs:nodejs /app/build/legal ./licenses

USER nextjs
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node scripts/healthcheck.mjs

ENTRYPOINT ["node", "scripts/docker-entrypoint.mjs"]
CMD ["node", "server.js"]
