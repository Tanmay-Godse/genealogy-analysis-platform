from __future__ import annotations

import strawberry
from fastapi import Request
from strawberry.fastapi import GraphQLRouter

from app.models import Role
from app.runtime import get_graph_service


def _coerce_role(role: str) -> Role:
    return Role(role.lower())


@strawberry.type
class EvidenceReferenceType:
    source_id: str
    title: str
    note: str


@strawberry.type
class PersonSummaryType:
    id: str
    display_name: str
    birth_label: str | None
    death_label: str | None
    branch: str
    is_living: bool
    is_masked: bool
    summary: str
    coordinate: list[float]
    evidence: list[EvidenceReferenceType]


@strawberry.type
class RelationshipSummaryType:
    id: str
    source_id: str
    target_id: str
    kind: str
    label: str


@strawberry.type
class GraphChunkType:
    workspace_id: str
    graph_version: str
    focus_person_id: str
    nodes: list[PersonSummaryType]
    relationships: list[RelationshipSummaryType]


@strawberry.type
class SearchResultType:
    id: str
    display_name: str
    branch: str
    subtitle: str
    is_masked: bool


def _map_person(person):
    return PersonSummaryType(
        id=person.id,
        display_name=person.display_name,
        birth_label=person.birth_label,
        death_label=person.death_label,
        branch=person.branch,
        is_living=person.is_living,
        is_masked=person.is_masked,
        summary=person.summary,
        coordinate=list(person.coordinate),
        evidence=[
            EvidenceReferenceType(
                source_id=evidence.source_id,
                title=evidence.title,
                note=evidence.note,
            )
            for evidence in person.evidence
        ],
    )


def _map_chunk(chunk):
    return GraphChunkType(
        workspace_id=chunk.workspace_id,
        graph_version=chunk.graph_version,
        focus_person_id=chunk.focus_person_id,
        nodes=[_map_person(node) for node in chunk.nodes],
        relationships=[
            RelationshipSummaryType(
                id=relationship.id,
                source_id=relationship.source_id,
                target_id=relationship.target_id,
                kind=relationship.kind,
                label=relationship.label,
            )
            for relationship in chunk.relationships
        ],
    )


@strawberry.type
class Query:
    @strawberry.field
    def person(self, info: strawberry.Info, id: str, role: str = "owner") -> PersonSummaryType | None:
        service = get_graph_service(info.context["request"])
        person = service.get_person(id, _coerce_role(role))
        if not person:
            return None
        return _map_person(person)

    @strawberry.field
    def search_people(
        self, info: strawberry.Info, text: str, role: str = "owner"
    ) -> list[SearchResultType]:
        service = get_graph_service(info.context["request"])
        results = service.search_people(text, _coerce_role(role))
        return [
            SearchResultType(
                id=result.id,
                display_name=result.display_name,
                branch=result.branch,
                subtitle=result.subtitle,
                is_masked=result.is_masked,
            )
            for result in results
        ]

    @strawberry.field
    def workspace_scene(
        self, info: strawberry.Info, id: str = "pilot-family-workspace", role: str = "owner"
    ) -> GraphChunkType:
        service = get_graph_service(info.context["request"])
        chunk = service.build_subgraph(person_id="p4", depth=2, role=_coerce_role(role))
        return _map_chunk(chunk)


schema = strawberry.Schema(query=Query)


async def get_context(request: Request) -> dict[str, Request]:
    return {"request": request}


graphql_app = GraphQLRouter(schema, path="/", context_getter=get_context)
