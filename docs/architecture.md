# Architecture Overview

## Current shape

The repo starts as a modular monolith with two application entrypoints:

- `apps/api` serves REST and GraphQL over a service-backed genealogy graph with seed fallback.
- `apps/web` renders the pilot UI and consumes the API through typed fetch helpers.

## Planned runtime split

- **Graph truth**: Neo4j, seeded on API startup for the pilot workspace.
- **Operational data**: PostgreSQL is provisioned and health-checked, ready for auth/audit/import persistence.
- **Search and jobs**: OpenSearch and Redis are provisioned and used for search and cache in the current dev stack.
- **Web experience**: Next.js 16, React 19, and React Three Fiber for the canonical graph view.

## Initial contracts

- REST owns bounded graph operations, workspace summary, and runtime health visibility.
- GraphQL owns flexible read hydration for scene bootstrapping and person lookup.
- Privacy masking is enforced in the API layer so the frontend never receives unauthorized living-person detail for restricted viewers.

## Why this shape

- It gives us a working end-to-end slice quickly.
- It keeps the repo ready for GitHub collaboration and CI from day one.
- It avoids premature microservice overhead while still separating domains clearly.
