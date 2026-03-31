# ADR 0001: Monorepo Foundation

## Status

Accepted

## Context

The project starts greenfield and needs a GitHub-ready structure that can ship a vertical slice quickly without scattering responsibilities across multiple repos.

## Decision

Use a single repository with:

- `apps/api` for the FastAPI backend
- `apps/web` for the Next.js frontend
- `docs` for project-level documentation and ADRs
- `infra` for deployment and data-service scaffolding

## Consequences

- Cross-cutting contracts are easier to evolve together.
- CI can validate the frontend and backend in one place.
- The repo stays ready for later extraction if the architecture grows beyond a modular monolith.
