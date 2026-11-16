# Build context: enterprise/ (the root package-lock.json is required).
# Release pipelines should override NODE_IMAGE with a reviewed immutable digest.
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
COPY . .
RUN npm ci --include=dev
RUN npm run build:services

FROM ${NODE_IMAGE} AS runtime
ARG SERVICE_NAME
ENV NODE_ENV=production HOST=0.0.0.0 SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app
# The root bundler embeds JS dependencies and owned SQL migrations.
# No source or bundle from another service is copied into this image.
COPY --from=build --chown=node:node /workspace/dist/services/${SERVICE_NAME}/index.mjs ./dist/services/${SERVICE_NAME}/index.mjs
COPY --chown=node:node infra/docker/entrypoint.sh /usr/local/bin/atlas-entrypoint
RUN chmod 0555 /usr/local/bin/atlas-entrypoint
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/atlas-entrypoint"]
