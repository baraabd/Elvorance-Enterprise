FROM node:24.22.1-bookworm-slim AS build
WORKDIR /workspace
COPY . .
ARG RAILWAY_GIT_COMMIT_SHA
ENV SOURCE_REVISION=$RAILWAY_GIT_COMMIT_SHA
RUN npm ci --include=dev && node tooling/scripts/hosted/build-web.mts
FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /workspace/dist/hosted-web ./dist/hosted-web
USER node
ENV NODE_ENV=production PORT=8080
CMD ["node", "dist/hosted-web/server.mjs"]
