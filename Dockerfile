# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14-slim AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
ARG VERSION=dev
COPY .oxfmtrc.json .oxlintrc.json tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN MD_BUILD_VERSION="${VERSION}" bun run binary

FROM gcr.io/distroless/base-debian12:nonroot AS runtime
ARG VERSION=dev
LABEL org.opencontainers.image.title="md" \
      org.opencontainers.image.description="minimal server to view markdown and code" \
      org.opencontainers.image.licenses="Unlicense" \
      org.opencontainers.image.source="https://github.com/0xcadams/md" \
      org.opencontainers.image.version="${VERSION}"
ENV MD_HOST=0.0.0.0 \
    PORT=8080
COPY --from=build --chown=nonroot:nonroot /app/dist/md /usr/local/bin/md
COPY --chown=nonroot:nonroot LICENSE /licenses/LICENSE
USER nonroot:nonroot
WORKDIR /data
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/md"]
CMD ["/data"]
