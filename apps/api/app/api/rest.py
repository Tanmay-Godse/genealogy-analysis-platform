from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile

from app.models import LineageDirection, Role
from app.runtime import get_graph_service

router = APIRouter(prefix="/api/v1", tags=["graph"])


@router.get("/workspace/summary")
def workspace_summary(request: Request):
    return get_graph_service(request).workspace_summary()


@router.get("/search")
def search(
    request: Request,
    q: str = Query(default="", min_length=1),
    role: Role = Query(default=Role.OWNER),
):
    return get_graph_service(request).search_people(query=q, role=role)


@router.get("/graph/subgraph")
def subgraph(
    request: Request,
    person_id: str,
    depth: int = Query(default=1, ge=0, le=3),
    role: Role = Query(default=Role.OWNER),
):
    try:
        return get_graph_service(request).build_subgraph(person_id=person_id, depth=depth, role=role)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown person: {error.args[0]}") from error


@router.get("/graph/lineage")
def lineage(
    request: Request,
    person_id: str,
    direction: LineageDirection = Query(default=LineageDirection.ANCESTORS),
    depth: int = Query(default=2, ge=1, le=4),
    role: Role = Query(default=Role.OWNER),
):
    try:
        return get_graph_service(request).build_lineage(
            person_id=person_id,
            direction=direction,
            depth=depth,
            role=role,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown person: {error.args[0]}") from error


@router.get("/graph/kinship")
def kinship(
    request: Request,
    source_id: str,
    target_id: str,
    role: Role = Query(default=Role.OWNER),
):
    try:
        return get_graph_service(request).build_kinship(source_id=source_id, target_id=target_id, role=role)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown path request: {error.args[0]}") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/imports")
def list_imports(request: Request):
    try:
        return get_graph_service(request).list_imports()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/imports/{import_id}")
def import_detail(request: Request, import_id: str):
    try:
        summary = get_graph_service(request).get_import(import_id)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    if not summary:
        raise HTTPException(status_code=404, detail=f"Unknown import: {import_id}")
    return summary


@router.post("/imports/gedcom")
async def import_gedcom(request: Request, file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="A GEDCOM file is required.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        return get_graph_service(request).import_gedcom_file(file.filename, content)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
