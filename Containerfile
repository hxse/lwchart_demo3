FROM docker.io/oven/bun:1.4.2-slim@sha256:debbe76858f2e398d2937c1eceeb82c571ac1fcd78aadf00e9634578ac2b5ef7 AS build
USER root
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun scripts/crypto/entry.ts build

FROM docker.io/oven/bun:1.4.2-slim@sha256:debbe76858f2e398d2937c1eceeb82c571ac1fcd78aadf00e9634578ac2b5ef7
USER root
WORKDIR /app
ENV PROJECT_EXECUTION_CONTEXT=prod
COPY --from=build /build/dist-market/ /app/
RUN mkdir -p /app/config
USER bun
EXPOSE 5174
ENTRYPOINT ["bun", "/app/server.js"]
