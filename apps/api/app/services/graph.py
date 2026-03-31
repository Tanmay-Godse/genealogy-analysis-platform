from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
import socket
from uuid import uuid4
from collections import deque
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import boto3
import httpx
from neo4j import GraphDatabase
from opensearchpy import OpenSearch, helpers as opensearch_helpers
import psycopg
from redis import Redis

from app.config import Settings
from app.models import (
    EvidenceReference,
    GraphChunk,
    ImportJobSummary,
    ImportStatus,
    KinshipPathStep,
    KinshipResult,
    LineageDirection,
    LineageResult,
    PersonSummary,
    RelationshipSummary,
    Role,
    SearchResult,
    WorkspaceSummary,
)
from app.services.gedcom import ParsedGedcomImport, parse_gedcom

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PersonRecord:
    id: str
    name: str
    branch: str
    birth_label: str | None
    death_label: str | None
    is_living: bool
    summary: str
    coordinate: tuple[float, float, float]
    aliases: tuple[str, ...]
    evidence: tuple[EvidenceReference, ...]


@dataclass(frozen=True)
class RelationshipRecord:
    id: str
    source_id: str
    target_id: str
    kind: str
    label: str
    evidence: EvidenceReference


PERSONS: dict[str, PersonRecord] = {
    "p1": PersonRecord(
        id="p1",
        name="Grace Hart",
        branch="Hart ancestral line",
        birth_label="Born 1932",
        death_label="Died 2011",
        is_living=False,
        summary="Matriarch documented across census records, church books, and family letters.",
        coordinate=(-6.0, 2.5, -1.2),
        aliases=("Grace Eleanor Hart",),
        evidence=(
            EvidenceReference(
                source_id="s1",
                title="1960 census extract",
                note="Household confirms spouse and children at the Hart farmstead.",
            ),
        ),
    ),
    "p2": PersonRecord(
        id="p2",
        name="Eleanor Hart",
        branch="Hart ancestral line",
        birth_label="Born 1957",
        death_label=None,
        is_living=True,
        summary="Family archivist who curated surviving letters and migration notes.",
        coordinate=(-2.0, 0.6, -1.2),
        aliases=("Eleanor Grace Hart",),
        evidence=(
            EvidenceReference(
                source_id="s2",
                title="1980 marriage certificate",
                note="Names Eleanor Hart as spouse in the Hart household family unit.",
            ),
        ),
    ),
    "p3": PersonRecord(
        id="p3",
        name="Marcus Hart",
        branch="Hart ancestral line",
        birth_label="Born 1955",
        death_label="Died 2021",
        is_living=False,
        summary="Second-generation anchor for the Hart line and parent of the present pilot branch.",
        coordinate=(-2.0, 0.6, 1.2),
        aliases=("Marcus Joseph Hart",),
        evidence=(
            EvidenceReference(
                source_id="s2",
                title="1980 marriage certificate",
                note="Names Marcus Hart as spouse in the Hart household family unit.",
            ),
        ),
    ),
    "p4": PersonRecord(
        id="p4",
        name="David Hart",
        branch="Pilot household",
        birth_label="Born 1986",
        death_label=None,
        is_living=True,
        summary="Primary pilot focus person used for search, lineage, and kinship examples.",
        coordinate=(1.6, -1.3, -0.8),
        aliases=("David M. Hart",),
        evidence=(
            EvidenceReference(
                source_id="s3",
                title="GEDCOM pilot import",
                note="Import fixture identifies David as child of Marcus and Eleanor Hart.",
            ),
        ),
    ),
    "p5": PersonRecord(
        id="p5",
        name="Mira Patel",
        branch="Pilot household",
        birth_label="Born 1988",
        death_label=None,
        is_living=True,
        summary="Spouse in the pilot household, linked through imported family unit records.",
        coordinate=(1.8, -1.3, 1.5),
        aliases=("Mira Anaya Patel",),
        evidence=(
            EvidenceReference(
                source_id="s4",
                title="2012 family unit note",
                note="Lists Mira Patel and David Hart as members of the same household.",
            ),
        ),
    ),
    "p6": PersonRecord(
        id="p6",
        name="Sofia Hart",
        branch="Pilot household",
        birth_label="Born 2014",
        death_label=None,
        is_living=True,
        summary="Living child in the pilot household.",
        coordinate=(5.4, -3.4, -0.4),
        aliases=("Sofia M. Hart",),
        evidence=(
            EvidenceReference(
                source_id="s5",
                title="Birth register entry",
                note="Birth register links Sofia Hart to David Hart and Mira Patel.",
            ),
        ),
    ),
    "p7": PersonRecord(
        id="p7",
        name="Arjun Patel",
        branch="Pilot household",
        birth_label="Born 2017",
        death_label=None,
        is_living=True,
        summary="Second living child included to exercise privacy masking and descendant layout.",
        coordinate=(5.4, -3.4, 1.6),
        aliases=("Arjun D. Patel",),
        evidence=(
            EvidenceReference(
                source_id="s6",
                title="Family photo annotation",
                note="Annotated album confirms Arjun Patel within the pilot household group.",
            ),
        ),
    ),
}

RELATIONSHIPS: tuple[RelationshipRecord, ...] = (
    RelationshipRecord(
        id="r1",
        source_id="p1",
        target_id="p2",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p2"].evidence[0],
    ),
    RelationshipRecord(
        id="r2",
        source_id="p1",
        target_id="p3",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p3"].evidence[0],
    ),
    RelationshipRecord(
        id="r3",
        source_id="p2",
        target_id="p4",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p4"].evidence[0],
    ),
    RelationshipRecord(
        id="r4",
        source_id="p3",
        target_id="p4",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p4"].evidence[0],
    ),
    RelationshipRecord(
        id="r5",
        source_id="p4",
        target_id="p5",
        kind="partner_of",
        label="partner of",
        evidence=PERSONS["p5"].evidence[0],
    ),
    RelationshipRecord(
        id="r6",
        source_id="p4",
        target_id="p6",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p6"].evidence[0],
    ),
    RelationshipRecord(
        id="r7",
        source_id="p5",
        target_id="p6",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p6"].evidence[0],
    ),
    RelationshipRecord(
        id="r8",
        source_id="p4",
        target_id="p7",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p7"].evidence[0],
    ),
    RelationshipRecord(
        id="r9",
        source_id="p5",
        target_id="p7",
        kind="parent_of",
        label="parent of",
        evidence=PERSONS["p7"].evidence[0],
    ),
)

GRAPH_VERSION = "seed-v1"
WORKSPACE_ID = "pilot-family-workspace"
DEFAULT_FOCUS_PERSON_ID = "p4"
SOURCE_COUNT = 6
SEARCH_INDEX = "family-tree-people"


class GraphService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.neo4j_driver = None
        self.redis_client = None
        self.opensearch_client = None
        self.minio_client = None
        self.graph_backend = "seed"
        self.graph_version = settings.graph_version
        self.service_health: dict[str, dict[str, str | bool]] = {}

    def bootstrap(self) -> None:
        self.service_health = {}

        if self.settings.enable_service_bootstrap:
            self._connect_neo4j()
            self._connect_redis()
            self._connect_opensearch()
            self._connect_minio()
            self._init_postgres_schema()
            self._seed_connected_services()
        else:
            self.service_health["neo4j"] = {"available": False, "detail": "Bootstrap disabled."}
            self.service_health["redis"] = {"available": False, "detail": "Bootstrap disabled."}
            self.service_health["opensearch"] = {
                "available": False,
                "detail": "Bootstrap disabled.",
            }
            self.service_health["postgres"] = {"available": False, "detail": "Bootstrap disabled."}
            self.service_health["minio"] = {"available": False, "detail": "Bootstrap disabled."}

        self.graph_backend = "neo4j" if self.neo4j_driver else "seed"
        self._warm_summary_cache()

    def close(self) -> None:
        if self.neo4j_driver:
            self.neo4j_driver.close()

        if self.redis_client:
            self.redis_client.close()

        if self.opensearch_client:
            self.opensearch_client.close()

    def health_snapshot(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "graphVersion": self.graph_version,
            "graphBackend": self.graph_backend,
            "services": self.service_health,
        }

    def workspace_summary(self) -> WorkspaceSummary:
        cache_key = f"workspace-summary:{self.graph_version}"
        if self.redis_client:
            cached_value = self.redis_client.get(cache_key)
            if cached_value:
                return WorkspaceSummary.model_validate_json(cached_value)

        if self.neo4j_driver:
            summary = self._workspace_summary_from_neo4j()
        else:
            summary = self._workspace_summary_from_seed()

        if self.redis_client:
            self.redis_client.setex(cache_key, 60, summary.model_dump_json())

        return summary

    def get_person(self, person_id: str, role: Role) -> PersonSummary | None:
        if self.neo4j_driver:
            person = self._get_person_from_neo4j(person_id, role)
            if person:
                return person

        person = PERSONS.get(person_id)
        return _mask_person(person, role) if person else None

    def search_people(self, query: str, role: Role) -> list[SearchResult]:
        if self.opensearch_client and query.strip():
            try:
                return self._search_people_from_opensearch(query, role)
            except Exception as error:  # pragma: no cover - fallback behavior
                logger.warning("OpenSearch query failed, falling back to seed search: %s", error)

        return self._search_people_from_seed(query, role)

    def build_subgraph(self, person_id: str, depth: int, role: Role) -> GraphChunk:
        if self.neo4j_driver:
            chunk = self._subgraph_from_neo4j(person_id, depth, role)
            if chunk:
                return chunk

        return self._subgraph_from_seed(person_id, depth, role)

    def build_lineage(
        self,
        person_id: str,
        direction: LineageDirection,
        depth: int,
        role: Role,
    ) -> LineageResult:
        if self.neo4j_driver:
            result = self._lineage_from_neo4j(person_id, direction, depth, role)
            if result:
                return result

        return self._lineage_from_seed(person_id, direction, depth, role)

    def build_kinship(self, source_id: str, target_id: str, role: Role) -> KinshipResult:
        if self.neo4j_driver:
            result = self._kinship_from_neo4j(source_id, target_id, role)
            if result:
                return result

        return self._kinship_from_seed(source_id, target_id, role)

    def list_imports(self) -> list[ImportJobSummary]:
        self._require_postgres()
        with self._postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT import_id, filename, status, workspace_id, graph_version, storage_key,
                           summary, error, created_at, updated_at
                    FROM import_jobs
                    ORDER BY created_at DESC
                    LIMIT 20
                    """
                )
                rows = cursor.fetchall()

        return [self._import_row_to_summary(row) for row in rows]

    def get_import(self, import_id: str) -> ImportJobSummary | None:
        self._require_postgres()
        with self._postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT import_id, filename, status, workspace_id, graph_version, storage_key,
                           summary, error, created_at, updated_at
                    FROM import_jobs
                    WHERE import_id = %s
                    """,
                    (import_id,),
                )
                row = cursor.fetchone()

        return self._import_row_to_summary(row) if row else None

    def import_gedcom_file(self, filename: str, content: bytes) -> ImportJobSummary:
        self._require_import_dependencies()

        safe_filename = Path(filename).name or "upload.ged"
        import_id = uuid4().hex[:12]
        graph_version = f"import-{import_id}"
        storage_key = f"imports/{import_id}/{safe_filename}"

        self._write_import_job(
            import_id=import_id,
            filename=safe_filename,
            storage_key=storage_key,
            status=ImportStatus.PENDING,
            graph_version=graph_version,
            summary={},
            error=None,
        )

        try:
            self.minio_client.put_object(
                Bucket=self.settings.minio_bucket,
                Key=storage_key,
                Body=content,
                ContentType="text/plain",
            )

            parsed = parse_gedcom(content.decode("utf-8", errors="ignore"), safe_filename, import_id)
            if not parsed.people:
                raise ValueError("GEDCOM import did not produce any people records.")

            self._replace_workspace_graph(parsed, graph_version)
            self.graph_version = graph_version
            self.graph_backend = "neo4j" if self.neo4j_driver else "seed"
            self._sync_opensearch_from_graph()
            self._invalidate_summary_cache()

            summary = {
                "people_count": parsed.people_count,
                "family_count": parsed.family_count,
                "relationship_count": len(parsed.relationships),
                "living_people_count": parsed.living_people_count,
                "focus_person_id": parsed.focus_person_id,
            }

            self._write_import_job(
                import_id=import_id,
                filename=safe_filename,
                storage_key=storage_key,
                status=ImportStatus.COMPLETED,
                graph_version=graph_version,
                summary=summary,
                error=None,
            )
        except Exception as error:
            self._write_import_job(
                import_id=import_id,
                filename=safe_filename,
                storage_key=storage_key,
                status=ImportStatus.FAILED,
                graph_version=graph_version,
                summary={},
                error=str(error),
            )
            raise

        return self.get_import(import_id)

    def _connect_neo4j(self) -> None:
        try:
            driver = GraphDatabase.driver(
                self.settings.neo4j_uri,
                auth=(self.settings.neo4j_username, self.settings.neo4j_password),
            )
            driver.verify_connectivity()
            self.neo4j_driver = driver
            self.service_health["neo4j"] = {"available": True, "detail": self.settings.neo4j_uri}
        except Exception as error:  # pragma: no cover - network/system dependent
            logger.warning("Neo4j unavailable, seed fallback will be used: %s", error)
            self.service_health["neo4j"] = {"available": False, "detail": str(error)}

    def _connect_redis(self) -> None:
        try:
            client = Redis.from_url(self.settings.redis_url, decode_responses=True)
            client.ping()
            self.redis_client = client
            self.service_health["redis"] = {"available": True, "detail": self.settings.redis_url}
        except Exception as error:  # pragma: no cover - network/system dependent
            logger.warning("Redis unavailable: %s", error)
            self.service_health["redis"] = {"available": False, "detail": str(error)}

    def _connect_opensearch(self) -> None:
        try:
            parsed = urlparse(self.settings.opensearch_url)
            client = OpenSearch(
                hosts=[
                    {
                        "host": parsed.hostname or "127.0.0.1",
                        "port": parsed.port or 9200,
                        "scheme": parsed.scheme or "https",
                    }
                ],
                http_auth=(
                    self.settings.opensearch_username,
                    self.settings.opensearch_password,
                ),
                use_ssl=(parsed.scheme or "https") == "https",
                verify_certs=False,
                ssl_assert_hostname=False,
                ssl_show_warn=False,
                timeout=self.settings.service_timeout_seconds,
            )
            client.info()
            self.opensearch_client = client
            self.service_health["opensearch"] = {
                "available": True,
                "detail": self.settings.opensearch_url,
            }
        except Exception as error:  # pragma: no cover - network/system dependent
            logger.warning("OpenSearch unavailable, search will fall back to seed data: %s", error)
            self.service_health["opensearch"] = {"available": False, "detail": str(error)}

    def _connect_minio(self) -> None:
        try:
            client = boto3.client(
                "s3",
                endpoint_url=self.settings.minio_endpoint_url,
                aws_access_key_id=self.settings.minio_access_key,
                aws_secret_access_key=self.settings.minio_secret_key,
                region_name="us-east-1",
            )
            bucket_name = self.settings.minio_bucket
            existing_buckets = {bucket["Name"] for bucket in client.list_buckets().get("Buckets", [])}
            if bucket_name not in existing_buckets:
                client.create_bucket(Bucket=bucket_name)
            self.minio_client = client
            self.service_health["minio"] = {"available": True, "detail": self.settings.minio_endpoint_url}
        except Exception as error:  # pragma: no cover - network/system dependent
            logger.warning("MinIO unavailable, GEDCOM archive storage will be disabled: %s", error)
            self.service_health["minio"] = {"available": False, "detail": str(error)}

    def _init_postgres_schema(self) -> None:
        try:
            with self._postgres_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        CREATE TABLE IF NOT EXISTS import_jobs (
                            import_id TEXT PRIMARY KEY,
                            workspace_id TEXT NOT NULL,
                            filename TEXT NOT NULL,
                            storage_key TEXT,
                            status TEXT NOT NULL,
                            graph_version TEXT NOT NULL,
                            summary JSONB NOT NULL DEFAULT '{}'::jsonb,
                            error TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                connection.commit()
            self.service_health["postgres"] = {
                "available": True,
                "detail": f"{self.settings.postgres_host}:{self.settings.postgres_port}",
            }
        except Exception as error:  # pragma: no cover - network/system dependent
            logger.warning("PostgreSQL unavailable, import metadata will be disabled: %s", error)
            self.service_health["postgres"] = {"available": False, "detail": str(error)}

    def _postgres_connection(self):
        return psycopg.connect(
            host=self.settings.postgres_host,
            port=self.settings.postgres_port,
            dbname=self.settings.postgres_database,
            user=self.settings.postgres_user,
            password=self.settings.postgres_password,
        )

    def _load_workspace_state_from_neo4j(self) -> bool:
        with self.neo4j_driver.session(database="neo4j") as session:
            record = session.run(
                """
                MATCH (w:Workspace {id: $workspace_id})
                RETURN w.graphVersion AS graph_version
                """,
                workspace_id=WORKSPACE_ID,
            ).single()

        if not record:
            return False

        self.graph_version = record["graph_version"] or self.settings.graph_version
        return True

    def _sync_opensearch_from_graph(self) -> None:
        if not self.opensearch_client:
            return

        if not self.opensearch_client.indices.exists(index=SEARCH_INDEX):
            self.opensearch_client.indices.create(
                index=SEARCH_INDEX,
                body={
                    "mappings": {
                        "properties": {
                            "workspace_id": {"type": "keyword"},
                            "display_name": {"type": "text"},
                            "aliases": {"type": "text"},
                            "branch": {"type": "keyword"},
                            "summary": {"type": "text"},
                            "is_living": {"type": "boolean"},
                        }
                    }
                },
            )

        self.opensearch_client.delete_by_query(
            index=SEARCH_INDEX,
            body={"query": {"term": {"workspace_id": WORKSPACE_ID}}},
            ignore=[404],
            refresh=True,
        )

        actions: list[dict[str, Any]] = []
        if self.neo4j_driver:
            with self.neo4j_driver.session(database="neo4j") as session:
                result = session.run(
                    """
                    MATCH (p:Person {workspaceId: $workspace_id})
                    RETURN p
                    """,
                    workspace_id=WORKSPACE_ID,
                )
                for record in result:
                    person = record["p"]
                    actions.append(
                        {
                            "_index": SEARCH_INDEX,
                            "_id": person["id"],
                            "_source": {
                                "workspace_id": WORKSPACE_ID,
                                "display_name": person["name"],
                                "aliases": person.get("aliases", [person["name"]]),
                                "branch": person["branch"],
                                "summary": person["summary"],
                                "is_living": bool(person.get("isLiving")),
                            },
                        }
                    )

        if not actions:
            for person in PERSONS.values():
                actions.append(
                    {
                        "_index": SEARCH_INDEX,
                        "_id": person.id,
                        "_source": {
                            "workspace_id": WORKSPACE_ID,
                            "display_name": person.name,
                            "aliases": list(person.aliases),
                            "branch": person.branch,
                            "summary": person.summary,
                            "is_living": person.is_living,
                        },
                    }
                )

        opensearch_helpers.bulk(self.opensearch_client, actions, refresh=True)

    def _require_postgres(self) -> None:
        if self.service_health.get("postgres", {}).get("available") is not True:
            raise RuntimeError("PostgreSQL is not available for import metadata.")

    def _require_import_dependencies(self) -> None:
        if not self.neo4j_driver:
            raise RuntimeError("Neo4j is required for GEDCOM imports.")
        if not self.minio_client:
            raise RuntimeError("MinIO is required for GEDCOM archive storage.")
        self._require_postgres()

    def _write_import_job(
        self,
        import_id: str,
        filename: str,
        storage_key: str,
        status: ImportStatus,
        graph_version: str,
        summary: dict[str, Any],
        error: str | None,
    ) -> None:
        self._require_postgres()
        with self._postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO import_jobs (
                        import_id, workspace_id, filename, storage_key, status, graph_version, summary, error
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (import_id) DO UPDATE
                    SET filename = EXCLUDED.filename,
                        storage_key = EXCLUDED.storage_key,
                        status = EXCLUDED.status,
                        graph_version = EXCLUDED.graph_version,
                        summary = EXCLUDED.summary,
                        error = EXCLUDED.error,
                        updated_at = NOW()
                    """,
                    (
                        import_id,
                        WORKSPACE_ID,
                        filename,
                        storage_key,
                        status.value,
                        graph_version,
                        json.dumps(summary),
                        error,
                    ),
                )
            connection.commit()

    def _import_row_to_summary(self, row: tuple[Any, ...]) -> ImportJobSummary:
        summary_data = row[6] or {}
        return ImportJobSummary(
            import_id=row[0],
            filename=row[1],
            status=ImportStatus(row[2]),
            workspace_id=row[3],
            graph_version=row[4],
            storage_key=row[5],
            people_count=summary_data.get("people_count", 0),
            family_count=summary_data.get("family_count", 0),
            relationship_count=summary_data.get("relationship_count", 0),
            living_people_count=summary_data.get("living_people_count", 0),
            focus_person_id=summary_data.get("focus_person_id"),
            error=row[7],
            created_at=row[8].isoformat() if row[8] else None,
            updated_at=row[9].isoformat() if row[9] else None,
        )

    def _replace_workspace_graph(self, parsed: ParsedGedcomImport, graph_version: str) -> None:
        with self.neo4j_driver.session(database="neo4j") as session:
            session.run(
                "MATCH ()-[r {workspaceId: $workspace_id}]->() DELETE r",
                workspace_id=WORKSPACE_ID,
            )
            session.run(
                "MATCH (p:Person {workspaceId: $workspace_id}) DETACH DELETE p",
                workspace_id=WORKSPACE_ID,
            )
            session.run(
                """
                MERGE (w:Workspace {id: $workspace_id})
                SET w.graphVersion = $graph_version,
                    w.defaultFocusPersonId = $default_focus_person_id,
                    w.sourceCount = $source_count
                """,
                workspace_id=WORKSPACE_ID,
                graph_version=graph_version,
                default_focus_person_id=parsed.focus_person_id,
                source_count=1,
            )

            for person in parsed.people:
                session.run(
                    """
                    MERGE (p:Person {id: $id})
                    SET p.workspaceId = $workspace_id,
                        p.name = $name,
                        p.branch = $branch,
                        p.birthLabel = $birth_label,
                        p.deathLabel = $death_label,
                        p.isLiving = $is_living,
                        p.summary = $summary,
                        p.x = $x,
                        p.y = $y,
                        p.z = $z,
                        p.aliases = $aliases,
                        p.evidenceSourceId = $evidence_source_id,
                        p.evidenceTitle = $evidence_title,
                        p.evidenceNote = $evidence_note
                    """,
                    id=person.id,
                    workspace_id=WORKSPACE_ID,
                    name=person.display_name,
                    branch=person.branch,
                    birth_label=person.birth_label,
                    death_label=person.death_label,
                    is_living=person.is_living,
                    summary=person.summary,
                    x=person.coordinate[0],
                    y=person.coordinate[1],
                    z=person.coordinate[2],
                    aliases=list(person.aliases),
                    evidence_source_id=person.evidence_source_id,
                    evidence_title=person.evidence_title,
                    evidence_note=person.evidence_note,
                )

            for relationship in parsed.relationships:
                rel_type = "PARENT_OF" if relationship.kind == "parent_of" else "PARTNER_OF"
                session.run(
                    f"""
                    MATCH (source:Person {{id: $source_id, workspaceId: $workspace_id}})
                    MATCH (target:Person {{id: $target_id, workspaceId: $workspace_id}})
                    MERGE (source)-[r:{rel_type} {{id: $id}}]->(target)
                    SET r.workspaceId = $workspace_id,
                        r.kind = $kind,
                        r.label = $label,
                        r.sourceId = $source_id,
                        r.targetId = $target_id,
                        r.evidenceSourceId = $evidence_source_id,
                        r.evidenceTitle = $evidence_title,
                        r.evidenceNote = $evidence_note
                    """,
                    id=relationship.id,
                    workspace_id=WORKSPACE_ID,
                    source_id=relationship.source_id,
                    target_id=relationship.target_id,
                    kind=relationship.kind,
                    label=relationship.label,
                    evidence_source_id=relationship.evidence_source_id,
                    evidence_title=relationship.evidence_title,
                    evidence_note=relationship.evidence_note,
                )

    def _invalidate_summary_cache(self) -> None:
        if self.redis_client:
            for key in self.redis_client.scan_iter(match="workspace-summary:*"):
                self.redis_client.delete(key)

    def _seed_connected_services(self) -> None:
        workspace_exists = False
        if self.neo4j_driver:
            workspace_exists = self._load_workspace_state_from_neo4j()
            if not workspace_exists:
                self._seed_neo4j()
                workspace_exists = True

        if self.opensearch_client and workspace_exists:
            self._sync_opensearch_from_graph()

    def _seed_neo4j(self) -> None:
        with self.neo4j_driver.session(database="neo4j") as session:
            session.run(
                "CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE"
            )
            session.run(
                """
                MERGE (w:Workspace {id: $workspace_id})
                SET w.graphVersion = $graph_version,
                    w.defaultFocusPersonId = $default_focus_person_id,
                    w.sourceCount = $source_count
                """,
                workspace_id=WORKSPACE_ID,
                graph_version=self.graph_version,
                default_focus_person_id=DEFAULT_FOCUS_PERSON_ID,
                source_count=SOURCE_COUNT,
            )

            for person in PERSONS.values():
                evidence = person.evidence[0]
                session.run(
                    """
                    MERGE (p:Person {id: $id})
                    SET p.workspaceId = $workspace_id,
                        p.name = $name,
                        p.branch = $branch,
                        p.birthLabel = $birth_label,
                        p.deathLabel = $death_label,
                        p.isLiving = $is_living,
                        p.summary = $summary,
                        p.x = $x,
                        p.y = $y,
                        p.z = $z,
                        p.aliases = $aliases,
                        p.evidenceSourceId = $evidence_source_id,
                        p.evidenceTitle = $evidence_title,
                        p.evidenceNote = $evidence_note
                    """,
                    id=person.id,
                    workspace_id=WORKSPACE_ID,
                    name=person.name,
                    branch=person.branch,
                    birth_label=person.birth_label,
                    death_label=person.death_label,
                    is_living=person.is_living,
                    summary=person.summary,
                    x=person.coordinate[0],
                    y=person.coordinate[1],
                    z=person.coordinate[2],
                    aliases=list(person.aliases),
                    evidence_source_id=evidence.source_id,
                    evidence_title=evidence.title,
                    evidence_note=evidence.note,
                )

            for relationship in RELATIONSHIPS:
                rel_type = "PARENT_OF" if relationship.kind == "parent_of" else "PARTNER_OF"
                session.run(
                    f"""
                    MATCH (source:Person {{id: $source_id, workspaceId: $workspace_id}})
                    MATCH (target:Person {{id: $target_id, workspaceId: $workspace_id}})
                    MERGE (source)-[r:{rel_type} {{id: $id}}]->(target)
                    SET r.workspaceId = $workspace_id,
                        r.kind = $kind,
                        r.label = $label,
                        r.sourceId = $source_id,
                        r.targetId = $target_id,
                        r.evidenceSourceId = $evidence_source_id,
                        r.evidenceTitle = $evidence_title,
                        r.evidenceNote = $evidence_note
                    """,
                    id=relationship.id,
                    workspace_id=WORKSPACE_ID,
                    source_id=relationship.source_id,
                    target_id=relationship.target_id,
                    kind=relationship.kind,
                    label=relationship.label,
                    evidence_source_id=relationship.evidence.source_id,
                    evidence_title=relationship.evidence.title,
                    evidence_note=relationship.evidence.note,
                )

    def _seed_opensearch(self) -> None:
        if not self.opensearch_client.indices.exists(index=SEARCH_INDEX):
            self.opensearch_client.indices.create(
                index=SEARCH_INDEX,
                body={
                    "mappings": {
                        "properties": {
                            "workspace_id": {"type": "keyword"},
                            "display_name": {"type": "text"},
                            "aliases": {"type": "text"},
                            "branch": {"type": "keyword"},
                            "summary": {"type": "text"},
                            "is_living": {"type": "boolean"},
                        }
                    }
                },
            )

        actions = []
        for person in PERSONS.values():
            actions.append(
                {
                    "_index": SEARCH_INDEX,
                    "_id": person.id,
                    "_source": {
                        "workspace_id": WORKSPACE_ID,
                        "display_name": person.name,
                        "aliases": list(person.aliases),
                        "branch": person.branch,
                        "summary": person.summary,
                        "is_living": person.is_living,
                    },
                }
            )

        opensearch_helpers.bulk(self.opensearch_client, actions, refresh=True)

    def _probe_postgres(self) -> None:
        try:
            with socket.create_connection(
                (self.settings.postgres_host, self.settings.postgres_port),
                timeout=self.settings.service_timeout_seconds,
            ):
                pass
            self.service_health["postgres"] = {
                "available": True,
                "detail": f"{self.settings.postgres_host}:{self.settings.postgres_port}",
            }
        except OSError as error:  # pragma: no cover - network/system dependent
            self.service_health["postgres"] = {"available": False, "detail": str(error)}

    def _probe_minio(self) -> None:
        try:
            response = httpx.get(
                self.settings.minio_health_url,
                timeout=self.settings.service_timeout_seconds,
            )
            response.raise_for_status()
            self.service_health["minio"] = {
                "available": True,
                "detail": self.settings.minio_health_url,
            }
        except Exception as error:  # pragma: no cover - network/system dependent
            self.service_health["minio"] = {"available": False, "detail": str(error)}

    def _warm_summary_cache(self) -> None:
        if self.redis_client:
            summary = self._workspace_summary_from_neo4j() if self.neo4j_driver else self._workspace_summary_from_seed()
            self.redis_client.setex(
                f"workspace-summary:{self.graph_version}",
                60,
                summary.model_dump_json(),
            )

    def _workspace_summary_from_neo4j(self) -> WorkspaceSummary:
        with self.neo4j_driver.session(database="neo4j") as session:
            record = session.run(
                """
                MATCH (w:Workspace {id: $workspace_id})
                CALL (w) {
                    MATCH (p:Person {workspaceId: w.id})
                    RETURN count(p) AS people_count,
                           sum(CASE WHEN p.isLiving THEN 1 ELSE 0 END) AS living_people_count
                }
                CALL (w) {
                    MATCH ()-[r {workspaceId: w.id}]->()
                    RETURN count(r) AS relationship_count
                }
                RETURN w.defaultFocusPersonId AS default_focus_person_id,
                       w.sourceCount AS source_count,
                       people_count,
                       living_people_count,
                       relationship_count
                """,
                workspace_id=WORKSPACE_ID,
            ).single()

        if not record:
            return self._workspace_summary_from_seed()

        return WorkspaceSummary(
            workspace_id=WORKSPACE_ID,
            graph_version=self.graph_version,
            people_count=record["people_count"],
            living_people_count=record["living_people_count"],
            source_count=record["source_count"],
            relationship_count=record["relationship_count"],
            default_focus_person_id=record["default_focus_person_id"],
        )

    def _workspace_summary_from_seed(self) -> WorkspaceSummary:
        return WorkspaceSummary(
            workspace_id=WORKSPACE_ID,
            graph_version=self.graph_version,
            people_count=len(PERSONS),
            living_people_count=sum(1 for person in PERSONS.values() if person.is_living),
            source_count=SOURCE_COUNT,
            relationship_count=len(RELATIONSHIPS),
            default_focus_person_id=DEFAULT_FOCUS_PERSON_ID,
        )

    def _get_person_from_neo4j(self, person_id: str, role: Role) -> PersonSummary | None:
        with self.neo4j_driver.session(database="neo4j") as session:
            record = session.run(
                """
                MATCH (p:Person {id: $person_id, workspaceId: $workspace_id})
                RETURN p
                """,
                person_id=person_id,
                workspace_id=WORKSPACE_ID,
            ).single()

        if not record:
            return None

        return _node_to_summary(record["p"], role)

    def _search_people_from_opensearch(self, query: str, role: Role) -> list[SearchResult]:
        response = self.opensearch_client.search(
            index=SEARCH_INDEX,
            body={
                "size": 10,
                "query": {
                    "multi_match": {
                        "query": query,
                        "fields": ["display_name^3", "aliases^2", "summary", "branch"],
                    }
                },
            },
        )

        results: list[SearchResult] = []
        for hit in response["hits"]["hits"]:
            source = hit["_source"]
            masked = role == Role.VIEWER and source["is_living"]
            results.append(
                SearchResult(
                    id=hit["_id"],
                    display_name="Private Living Person" if masked else source["display_name"],
                    branch=source["branch"],
                    subtitle=(
                        "Living person hidden from restricted viewers."
                        if masked
                        else source["summary"]
                    ),
                    is_masked=masked,
                )
            )

        return results

    def _subgraph_from_neo4j(self, person_id: str, depth: int, role: Role) -> GraphChunk | None:
        self._ensure_person_exists(person_id)
        with self.neo4j_driver.session(database="neo4j") as session:
            result = session.run(
                f"""
                MATCH path = (focus:Person {{id: $person_id, workspaceId: $workspace_id}})-[*0..{depth}]-(related:Person)
                RETURN path
                """,
                person_id=person_id,
                workspace_id=WORKSPACE_ID,
            )
            return self._paths_to_chunk(list(result), person_id, role)

    def _lineage_from_neo4j(
        self,
        person_id: str,
        direction: LineageDirection,
        depth: int,
        role: Role,
    ) -> LineageResult | None:
        self._ensure_person_exists(person_id)
        relationship_path = (
            f"<-[:PARENT_OF*0..{depth}]-"
            if direction == LineageDirection.ANCESTORS
            else f"-[:PARENT_OF*0..{depth}]->"
        )
        with self.neo4j_driver.session(database="neo4j") as session:
            result = session.run(
                f"""
                MATCH path = (focus:Person {{id: $person_id, workspaceId: $workspace_id}}){relationship_path}(related:Person)
                RETURN path
                """,
                person_id=person_id,
                workspace_id=WORKSPACE_ID,
            )
            chunk = self._paths_to_chunk(list(result), person_id, role)

        return LineageResult(person_id=person_id, direction=direction, depth=depth, chunk=chunk)

    def _kinship_from_neo4j(self, source_id: str, target_id: str, role: Role) -> KinshipResult | None:
        if source_id == target_id:
            raise ValueError("Source and target must be different for kinship.")

        with self.neo4j_driver.session(database="neo4j") as session:
            record = session.run(
                """
                MATCH (source:Person {id: $source_id, workspaceId: $workspace_id})
                MATCH (target:Person {id: $target_id, workspaceId: $workspace_id})
                MATCH path = shortestPath((source)-[:PARENT_OF|PARTNER_OF*..10]-(target))
                RETURN path
                """,
                source_id=source_id,
                target_id=target_id,
                workspace_id=WORKSPACE_ID,
            ).single()

        if not record:
            return None

        path = record["path"]
        steps: list[KinshipPathStep] = []
        evidence: list[EvidenceReference] = []
        nodes = list(path.nodes)
        relationships = list(path.relationships)

        for index, node in enumerate(nodes):
            person = _node_to_summary(node, role)
            via_relationship = relationships[index - 1].get("label") if index > 0 else None
            steps.append(
                KinshipPathStep(
                    person_id=person.id,
                    display_name=person.display_name,
                    via_relationship=via_relationship,
                )
            )

        for relationship in relationships:
            if relationship.get("evidenceSourceId"):
                evidence.append(
                    EvidenceReference(
                        source_id=relationship["evidenceSourceId"],
                        title=relationship["evidenceTitle"],
                        note=relationship["evidenceNote"],
                    )
                )

        unique_evidence = list({item.source_id: item for item in evidence}.values())
        return KinshipResult(
            source_id=source_id,
            target_id=target_id,
            label=f"{steps[0].display_name} to {steps[-1].display_name}",
            path=steps,
            evidence=unique_evidence,
        )

    def _paths_to_chunk(self, path_records: list[Any], focus_person_id: str, role: Role) -> GraphChunk:
        nodes: dict[str, PersonSummary] = {}
        relationships: dict[str, RelationshipSummary] = {}

        for record in path_records:
            path = record["path"]
            for node in path.nodes:
                nodes[node["id"]] = _node_to_summary(node, role)
            for relationship in path.relationships:
                relationships[relationship["id"]] = RelationshipSummary(
                    id=relationship["id"],
                    source_id=relationship["sourceId"],
                    target_id=relationship["targetId"],
                    kind=relationship.get("kind", relationship.type.lower()),
                    label=relationship.get("label", relationship.type.lower()),
                )

        if focus_person_id not in nodes:
            person = self._get_person_from_neo4j(focus_person_id, role)
            if person:
                nodes[focus_person_id] = person

        return GraphChunk(
            workspace_id=WORKSPACE_ID,
            graph_version=self.graph_version,
            focus_person_id=focus_person_id,
            nodes=sorted(nodes.values(), key=lambda item: item.display_name),
            relationships=list(relationships.values()),
        )

    def _ensure_person_exists(self, person_id: str) -> None:
        if self._get_person_from_neo4j(person_id, Role.OWNER) is None:
            raise KeyError(person_id)

    def _search_people_from_seed(self, query: str, role: Role) -> list[SearchResult]:
        lowered = query.strip().lower()
        if not lowered:
            return []

        results: list[SearchResult] = []
        for person in PERSONS.values():
            haystack = " ".join((person.name, *person.aliases)).lower()
            if lowered not in haystack:
                continue

            masked = role == Role.VIEWER and person.is_living
            results.append(
                SearchResult(
                    id=person.id,
                    display_name="Private Living Person" if masked else person.name,
                    branch=person.branch,
                    subtitle=(
                        "Living person hidden from restricted viewers."
                        if masked
                        else person.summary
                    ),
                    is_masked=masked,
                )
            )

        return sorted(results, key=lambda item: item.display_name)

    def _subgraph_from_seed(self, person_id: str, depth: int, role: Role) -> GraphChunk:
        if person_id not in PERSONS:
            raise KeyError(person_id)

        visited = {person_id}
        frontier = deque([(person_id, 0)])

        while frontier:
            current_person_id, current_depth = frontier.popleft()
            if current_depth >= depth:
                continue

            for relationship in _adjacent_relationships(current_person_id):
                neighbor_id = (
                    relationship.target_id
                    if relationship.source_id == current_person_id
                    else relationship.source_id
                )
                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    frontier.append((neighbor_id, current_depth + 1))

        relationships = [
            _relationship_summary(relationship)
            for relationship in RELATIONSHIPS
            if relationship.source_id in visited and relationship.target_id in visited
        ]

        nodes = [_mask_person(PERSONS[node_id], role) for node_id in visited]
        nodes.sort(key=lambda item: item.display_name)

        return GraphChunk(
            workspace_id=WORKSPACE_ID,
            graph_version=self.graph_version,
            focus_person_id=person_id,
            nodes=nodes,
            relationships=relationships,
        )

    def _lineage_from_seed(
        self,
        person_id: str,
        direction: LineageDirection,
        depth: int,
        role: Role,
    ) -> LineageResult:
        if person_id not in PERSONS:
            raise KeyError(person_id)

        visited = {person_id}
        frontier = deque([(person_id, 0)])

        while frontier:
            current_person_id, current_depth = frontier.popleft()
            if current_depth >= depth:
                continue

            for relationship in RELATIONSHIPS:
                if direction == LineageDirection.ANCESTORS and relationship.target_id == current_person_id:
                    neighbor_id = relationship.source_id
                elif (
                    direction == LineageDirection.DESCENDANTS
                    and relationship.source_id == current_person_id
                ):
                    neighbor_id = relationship.target_id
                else:
                    continue

                if neighbor_id not in visited:
                    visited.add(neighbor_id)
                    frontier.append((neighbor_id, current_depth + 1))

        nodes = [_mask_person(PERSONS[node_id], role) for node_id in visited]
        nodes.sort(key=lambda item: item.display_name)

        relationships = [
            _relationship_summary(relationship)
            for relationship in RELATIONSHIPS
            if relationship.source_id in visited and relationship.target_id in visited
        ]

        return LineageResult(
            person_id=person_id,
            direction=direction,
            depth=depth,
            chunk=GraphChunk(
                workspace_id=WORKSPACE_ID,
                graph_version=self.graph_version,
                focus_person_id=person_id,
                nodes=nodes,
                relationships=relationships,
            ),
        )

    def _kinship_from_seed(self, source_id: str, target_id: str, role: Role) -> KinshipResult:
        if source_id not in PERSONS or target_id not in PERSONS:
            raise KeyError(f"{source_id}:{target_id}")

        queue = deque([source_id])
        visited = {source_id}
        parents: dict[str, tuple[str, RelationshipRecord | None]] = {source_id: ("", None)}

        while queue:
            current = queue.popleft()
            if current == target_id:
                break

            for relationship in _adjacent_relationships(current):
                neighbor = (
                    relationship.target_id
                    if relationship.source_id == current
                    else relationship.source_id
                )
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                parents[neighbor] = (current, relationship)
                queue.append(neighbor)

        if target_id not in parents:
            raise ValueError("No kinship path found.")

        person_path = []
        evidence: list[EvidenceReference] = []
        cursor = target_id
        while cursor:
            previous, relationship = parents[cursor]
            person_path.append((cursor, relationship))
            if relationship:
                evidence.append(relationship.evidence)
            cursor = previous

        person_path.reverse()

        steps = []
        for person_id, relationship in person_path:
            masked_person = _mask_person(PERSONS[person_id], role)
            steps.append(
                KinshipPathStep(
                    person_id=person_id,
                    display_name=masked_person.display_name,
                    via_relationship=relationship.label if relationship else None,
                )
            )

        deduped_evidence = list({item.source_id: item for item in evidence}.values())
        return KinshipResult(
            source_id=source_id,
            target_id=target_id,
            label=f"{steps[0].display_name} to {steps[-1].display_name}",
            path=steps,
            evidence=deduped_evidence,
        )


def _node_to_summary(node: Any, role: Role) -> PersonSummary:
    is_masked = role == Role.VIEWER and bool(node.get("isLiving"))
    return PersonSummary(
        id=node["id"],
        display_name="Private Living Person" if is_masked else node["name"],
        birth_label=None if is_masked else node.get("birthLabel"),
        death_label=None if is_masked else node.get("deathLabel"),
        branch=node["branch"],
        is_living=bool(node.get("isLiving")),
        is_masked=is_masked,
        summary=(
            "Details hidden for living people in restricted viewer mode."
            if is_masked
            else node["summary"]
        ),
        coordinate=(float(node["x"]), float(node["y"]), float(node["z"])),
        evidence=(
            []
            if is_masked or not node.get("evidenceSourceId")
            else [
                EvidenceReference(
                    source_id=node["evidenceSourceId"],
                    title=node["evidenceTitle"],
                    note=node["evidenceNote"],
                )
            ]
        ),
    )


def _mask_person(person: PersonRecord, role: Role) -> PersonSummary:
    is_masked = role == Role.VIEWER and person.is_living
    display_name = "Private Living Person" if is_masked else person.name
    summary = (
        "Details hidden for living people in restricted viewer mode."
        if is_masked
        else person.summary
    )
    evidence = [] if is_masked else list(person.evidence)

    return PersonSummary(
        id=person.id,
        display_name=display_name,
        birth_label=person.birth_label if not is_masked else None,
        death_label=person.death_label if not is_masked else None,
        branch=person.branch,
        is_living=person.is_living,
        is_masked=is_masked,
        summary=summary,
        coordinate=person.coordinate,
        evidence=evidence,
    )


def _relationship_summary(relationship: RelationshipRecord) -> RelationshipSummary:
    return RelationshipSummary(
        id=relationship.id,
        source_id=relationship.source_id,
        target_id=relationship.target_id,
        kind=relationship.kind,
        label=relationship.label,
    )


def _adjacent_relationships(person_id: str) -> list[RelationshipRecord]:
    return [
        relationship
        for relationship in RELATIONSHIPS
        if relationship.source_id == person_id or relationship.target_id == person_id
    ]
