# Contributing

## Branch expectations

- Keep branches small and vertical when possible.
- Update docs when a public contract, workflow, or repo convention changes.
- Prefer typed interfaces over ad hoc JSON contracts.

## Local workflow

1. Activate the `family-tree` micromamba environment.
2. Run `make bootstrap` once after cloning.
3. Use `make dev-api` and `make dev-web` during development.
4. Run `make test-api`, `make lint-web`, and `make build-web` before opening a pull request.

## Coding expectations

- Preserve provenance for genealogy data and keep privacy decisions server-side.
- Heavy graph operations belong in service modules, not route handlers.
- UI components should consume typed view models and avoid owning permission rules.
