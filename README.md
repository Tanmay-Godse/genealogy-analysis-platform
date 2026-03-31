# Family Tree Platform

Interactive genealogy analysis platform scaffolded for a fast pilot release. The repository now includes a modular-monolith backend, a Next.js frontend, GitHub-ready automation, a micromamba-backed local environment, and a service-backed local Docker stack.

## Licensing Notice

This repository is currently not open source. All rights are reserved until a license is explicitly added.

## What is in this repo

- `apps/api`: FastAPI service with REST and GraphQL endpoints, service-backed graph runtime, and API tests.
- `apps/web`: Next.js 16 application with a dashboard shell, GraphQL/REST integration, a simple canonical 3D scene, and a GEDCOM import console.
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

3. Move into the repository root:

   ```bash
   cd /path/to/repo
   ```

   All `make` commands below must be run from this directory, or by using `make -C /path/to/repo ...`.

4. Install dependencies:

   ```bash
   make bootstrap
   ```

   `uv` is expected to install into the activated `family-tree` micromamba environment with `uv pip install --system --python python ...`, not against a separate managed Python.

   The `Makefile` already uses `micromamba run -n family-tree ...`, so activating the environment is helpful but not strictly required for the `make` commands themselves.

5. Start the local data stack:

   ```bash
   sudo docker compose -f ./infra/docker-compose.yml up -d
   ```

6. Start the backend:

   ```bash
   make dev-api
   ```

7. Start the frontend in another terminal:

   ```bash
   make dev-web
   ```

8. Open `http://localhost:3000`.
   The web app now redirects through `http://localhost:3000/login` and uses a Postgres-backed bootstrap curator account:

   - email: `curator@livingarchive.org`
   - password: `ArchiveDemo!2026`

   Visit `http://localhost:3000/admin/imports` after signing in to upload a GEDCOM file into the local pilot workspace.
   Visit `http://localhost:3000/admin/records/new` after signing in to add a family member manually through the guided editor. Saving the form creates the person and optional parent or partner links directly in Neo4j so the tree can render the new record immediately.

9. Inspect runtime health if needed:

   ```bash
   curl http://127.0.0.1:8000/healthz
   ```

## Current implementation slice

This first slice deliberately favors a real local-development path over breadth:

- service-backed genealogy workspace with Neo4j/OpenSearch/Redis integration and seed fallback
- GEDCOM upload flow that archives raw files in MinIO, records import jobs in PostgreSQL, and rebuilds the graph in Neo4j plus OpenSearch
- Postgres-backed bootstrap auth with persistent users and login sessions for the curator workspace
- guided manual record entry for non-technical admins, with form submission creating people plus family links directly in Neo4j
- REST endpoints for health, imports, summary, search, subgraphs, lineage, and kinship
- GraphQL queries for person lookup, search hydration, and workspace scene bootstrap
- privacy masking for living people when viewed as a restricted viewer
- a dashboard-style web UI with an orbitable scene, search-to-focus flow, admin import console, and manual record editor

## Sample data

Use the sample GEDCOM at `docs/examples/pilot-family.ged` to exercise the import flow locally.

## Repo standards

- Python uses `uv` inside the micromamba environment.
- Node dependencies live under the root npm workspace.
- All public-facing behavior should stay documented in `docs/` before new feature branches sprawl.
- Heavy infrastructure exists under `infra/`, but the API also falls back gracefully when those services are unavailable.
- Manual family-member creation requires Neo4j because new people and relationships are written into the live graph, not the in-memory seed fallback.

## Next milestones

- add update/delete flows, richer evidence capture, and curator review around manual records
- add merge review and deterministic identity-resolution tooling after imports
- harden privacy, saved scenes, and evidence/source workflows
- expand the scene from canonical mode to radial and local-force modes
