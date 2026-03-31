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

## Create a family member manually

Use the signed-in web editor at `http://localhost:3000/admin/records/new` for the guided flow, or call the API directly with an authenticated session cookie:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/records \
  -H "Content-Type: application/json" \
  -H "Cookie: family_tree_session=<session-cookie>" \
  -d '{
    "first_name": "Ava",
    "last_name": "Sterling",
    "branch": "Sterling family branch",
    "birth_label": "Born 1998",
    "birth_place": "Phoenix, Arizona",
    "is_living": true,
    "summary": "Family oral-history contributor.",
    "father_id": "p4"
  }'
```

This route requires Neo4j because it writes the person node and relationship links directly into the live graph, then refreshes the workspace search index and summary cache.
