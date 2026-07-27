FROM node:24.18.0-bookworm-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/authz/package.json packages/authz/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @profit-pilot/api... build
RUN pnpm prune --prod

FROM node:24.18.0-bookworm-slim AS runner

ENV HOST="0.0.0.0"
ENV NODE_ENV="production"
ENV PORT="4000"
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs api

COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/apps/api ./apps/api
COPY --from=builder --chown=api:nodejs /app/packages ./packages

USER api
EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
