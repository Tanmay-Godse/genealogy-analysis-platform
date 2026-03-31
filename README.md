# Family Tree Platform

Interactive genealogy analysis platform scaffolded for a fast pilot release. The repository now includes a modular-monolith backend, a Next.js frontend, GitHub-ready automation, a micromamba-backed local environment, and a service-backed local Docker stack.

## Licensing Notice

This repository is currently not open source. All rights are reserved until a license is explicitly added.

## What is in this repo

- `apps/api`: FastAPI service with REST and GraphQL endpoints, service-backed graph runtime, and API tests.
- `apps/web`: Next.js 16 application with a dashboard shell, GraphQL/REST integration, and a simple canonical 3D scene.
- `docs`: architecture notes, development guide, and an ADR for the initial repo shape.
- `infra`: target deployment compose file for Neo4j, PostgreSQL, Redis, OpenSearch, and MinIO.
- `.github`: CI workflow, CODEOWNERS, and PR template.

## Quick start

1. Create or refresh the micromamba environment:

   ```bash
   micromamba env create -f environment.yml
   ```

2. Activate it:

   ```bash
   micromamba activate family-tree
   ```

3. Install dependencies:

   ```bash
   make bootstrap
   ```

   `uv` is expected to install into the activated `family-tree` micromamba environment with `uv pip install --system --python python ...`, not against a separate managed Python.

4. Start the local data stack:

   ```bash
   sudo docker compose -f /home/tanmay-godse/Family_Tree/infra/docker-compose.yml up -d
   ```

5. Start the backend:

   ```bash
   make dev-api
   ```

6. Start the frontend in another terminal:

   ```bash
   make dev-web
   ```

7. Open `http://localhost:3000`.

8. Inspect runtime health if needed:

   ```bash
   curl http://127.0.0.1:8000/healthz
   ```

## Current implementation slice

This first slice deliberately favors a real local-development path over breadth:

- service-backed genealogy workspace with Neo4j/OpenSearch/Redis integration and seed fallback
- REST endpoints for health, summary, search, subgraphs, lineage, and kinship
- GraphQL queries for person lookup, search hydration, and workspace scene bootstrap
- privacy masking for living people when viewed as a restricted viewer
- a dashboard-style web UI with an orbitable scene and search-to-focus flow

## Repo standards

- Python uses `uv` inside the micromamba environment.
- Node dependencies live under the root npm workspace.
- All public-facing behavior should stay documented in `docs/` before new feature branches sprawl.
- Heavy infrastructure exists under `infra/`, but the API also falls back gracefully when those services are unavailable.

## Next milestones

- add PostgreSQL-backed auth/audit persistence
- add GEDCOM staging import flow and audit persistence
- harden privacy, saved scenes, and merge-review workflows
- expand the scene from canonical mode to radial and local-force modes
