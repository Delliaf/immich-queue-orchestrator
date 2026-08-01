FROM node:24-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    CONFIG_FILE=/app/orchestrator.docker.yml \
    DATA_DIR=/data \
    NODE_OPTIONS=--max-old-space-size=64

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node orchestrator.docker.yml ./orchestrator.docker.yml
RUN install -d -o node -g node -m 0700 /data

USER node
EXPOSE 8005

CMD ["node", "dist/main.js"]
