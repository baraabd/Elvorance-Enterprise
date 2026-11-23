FROM node:24.22.1-bookworm-slim AS build
WORKDIR /workspace
COPY . .
RUN npm ci --include=dev && node tooling/scripts/hosted/build-ops.mts
FROM postgres:18-bookworm
RUN groupadd --gid 10001 verifier && useradd --uid 10001 --gid 10001 --create-home verifier
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/dist/staging-ops.mjs ./dist/staging-ops.mjs
COPY --from=build --chown=10001:10001 /workspace/node_modules ./node_modules
RUN node --version && pg_dump --version
USER 10001:10001
ENTRYPOINT ["node", "dist/staging-ops.mjs"]
