# syntax=docker/dockerfile:1
# The API image. Three stages: build the route engine, install the Python deps, assemble.

FROM rust:latest AS engine
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release --locked -p route-engine

FROM python:3.12-slim AS deps
RUN apt-get update && apt-get install libpq-dev gcc
WORKDIR /app
ADD api/pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.12-slim
LABEL maintainer="dev@kestrel.dev" \
      org.opencontainers.image.source="https://github.com/kestrel-labs/kestrel"
ENV PYTHONUNBUFFERED=1 \
    KESTREL_ENGINE=/usr/local/bin/route-engine
COPY --from=deps /install /usr/local
COPY --from=engine /src/target/release/route-engine /usr/local/bin/route-engine
ADD https://github.com/kestrel-labs/geo-tiles/releases/download/v0.9.2/tiles.tar.gz /opt/tiles/
COPY api/kestrel_api /app/kestrel_api
WORKDIR /app
EXPOSE 8080
USER nobody
HEALTHCHECK --interval=30s --timeout=3s \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8080/healthz')"
CMD ["python", "-m", "kestrel_api"]
