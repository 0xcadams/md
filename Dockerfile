# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-slim AS dependencies
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
ARG VERSION=dev
COPY .oxfmtrc.json .oxlintrc.json tsconfig.json ./
COPY logo.svg ./
COPY scripts ./scripts
COPY src ./src
RUN MD_BUILD_VERSION="${VERSION}" bun run binary

FROM cgr.dev/chainguard/git:latest-glibc@sha256:7671e64c37b99739fd52eb5ae4299e957c5095e083d6ee5dcd1845ce850a7614 AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.title="md" \
      org.opencontainers.image.description="minimal server to view markdown and code" \
      org.opencontainers.image.licenses="Unlicense" \
      org.opencontainers.image.source="https://github.com/0xcadams/md" \
      org.opencontainers.image.version="${VERSION}"
ENV MD_HOST=0.0.0.0 \
    PORT=8080 \
    GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0=safe.directory \
    GIT_CONFIG_VALUE_0=/data \
    GIT_OPTIONAL_LOCKS=0
COPY --from=build --chown=65532:65532 /app/dist/md /usr/local/bin/md
COPY --chown=65532:65532 LICENSE /licenses/LICENSE
USER 65532:65532
WORKDIR /data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/md"]
CMD ["/data"]
