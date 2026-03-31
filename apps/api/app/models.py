from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class Role(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class ImportStatus(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class EvidenceReference(BaseModel):
    source_id: str
    title: str
    note: str


class PersonSummary(BaseModel):
    id: str
    display_name: str
    birth_label: str | None = None
    death_label: str | None = None
    branch: str
    is_living: bool
    is_masked: bool = False
    summary: str
    coordinate: tuple[float, float, float]
    evidence: list[EvidenceReference] = Field(default_factory=list)


class RelationshipSummary(BaseModel):
    id: str
    source_id: str
    target_id: str
    kind: str
    label: str


class GraphChunk(BaseModel):
    workspace_id: str
    graph_version: str
    focus_person_id: str
    nodes: list[PersonSummary]
    relationships: list[RelationshipSummary]


class SearchResult(BaseModel):
    id: str
    display_name: str
    branch: str
    subtitle: str
    is_masked: bool = False


class WorkspaceSummary(BaseModel):
    workspace_id: str
    graph_version: str
    people_count: int
    living_people_count: int
    source_count: int
    relationship_count: int
    default_focus_person_id: str


class LineageDirection(StrEnum):
    ANCESTORS = "ancestors"
    DESCENDANTS = "descendants"


class LineageResult(BaseModel):
    person_id: str
    direction: LineageDirection
    depth: int
    chunk: GraphChunk


class KinshipPathStep(BaseModel):
    person_id: str
    display_name: str
    via_relationship: str | None = None


class KinshipResult(BaseModel):
    source_id: str
    target_id: str
    label: str
    path: list[KinshipPathStep]
    evidence: list[EvidenceReference]


class ImportJobSummary(BaseModel):
    import_id: str
    filename: str
    status: ImportStatus
    workspace_id: str
    graph_version: str
    storage_key: str | None = None
    people_count: int = 0
    family_count: int = 0
    relationship_count: int = 0
    living_people_count: int = 0
    focus_person_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    error: str | None = None
