# Family Tree API

FastAPI application for the genealogy pilot. It seeds Neo4j and OpenSearch when the local Docker stack is available, uses Redis for summary cache, and falls back to the in-memory dataset when services are unavailable.

## Run locally

```bash
uv pip install --system --python python -e .
python -m uvicorn app.main:app --reload
```

## Health

```bash
curl http://127.0.0.1:8000/healthz
```

## Import a GEDCOM

```bash
curl -X POST http://127.0.0.1:8000/api/v1/imports/gedcom \
  -F file=@/home/tanmay-godse/Family_Tree/docs/examples/pilot-family.ged
```

The raw file is archived in MinIO, the import job is recorded in PostgreSQL, and the workspace graph is rebuilt in Neo4j and OpenSearch.
