# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# prisma generate only needs the schema (the pg driver adapter means no query-engine binary at runtime);
# the stub keeps the build working in air-gapped / on-prem registries.
ENV PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npx next build

FROM build AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN chmod +x scripts/docker-entrypoint.sh && useradd -m app && mkdir -p storage/uploads && chown -R app /app/storage /app/.next
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["npx", "next", "start", "-p", "3000"]
