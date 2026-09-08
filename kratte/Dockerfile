# Build with a non-secret placeholder URL; runtime credentials are injected separately.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=true
ENV APP_MODE=preview
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV APP_MODE=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --gid 1001 shopwise && useradd --uid 1001 --gid shopwise --no-create-home shopwise
COPY --from=build --chown=shopwise:shopwise /app/.next/standalone ./
COPY --from=build --chown=shopwise:shopwise /app/.next/static ./.next/static
COPY --from=build --chown=shopwise:shopwise /app/public ./public
USER shopwise
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
