# Development Guide

## Environment

This project uses a micromamba environment named `family-tree`.

```bash
micromamba env create -f environment.yml
micromamba activate family-tree
```

The environment provides Python 3.12 and Node.js 20. The backend uses `uv`, and the frontend uses npm workspaces.
Run `uv` from inside the micromamba environment with `uv pip install --system --python python ...` so it installs into the environment Python rather than provisioning a separate interpreter.

## Common commands

```bash
make bootstrap
sudo docker compose -f /home/tanmay-godse/Family_Tree/infra/docker-compose.yml up -d
make dev-api
make dev-web
make test-api
make lint-web
make build-web
```

## API endpoints

- `GET /healthz`
- `GET /api/v1/workspace/summary`
- `GET /api/v1/search?q=...`
- `GET /api/v1/graph/subgraph?person_id=...&depth=...`
- `GET /api/v1/graph/lineage?person_id=...&direction=ancestors|descendants&depth=...`
- `GET /api/v1/graph/kinship?source_id=...&target_id=...`
- `POST /graphql`

`/healthz` reports the active graph backend and service reachability for Neo4j, Redis, OpenSearch, PostgreSQL, and MinIO.

## Frontend environment

Copy `.env.example` values into your shell or `.env.local` if needed:

- `NEXT_PUBLIC_API_URL`: backend base URL

## Runtime behavior

- When Docker services are available, the API seeds Neo4j and OpenSearch at startup and warms workspace summary cache in Redis.
- If one of those services is unavailable, the API falls back to the in-memory seed dataset instead of crashing local development.
- Privacy logic still belongs in the API layer, not in the UI.
