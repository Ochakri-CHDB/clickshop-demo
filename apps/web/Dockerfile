# JS build output has no native modules, so deps/build run on the build
# host platform and only the runtime image is cross-platform.
FROM --platform=$BUILDPLATFORM node:22.23.3-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/observability/package.json ./packages/observability/
# Install scripts are skipped: only tree-sitter (pulled by llamaindex, not
# used at runtime) needs them, and it would require a node-gyp toolchain.
RUN npm ci --ignore-scripts

FROM --platform=$BUILDPLATFORM node:22.23.3-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
RUN npm run build --workspace=apps/web

FROM node:22.23.3-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4242 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
RUN mkdir -p /app/apps/web/.next/cache && chown -R nextjs:nodejs /app/apps/web/.next/cache
USER nextjs
EXPOSE 4242
CMD ["node", "apps/web/server.js"]
