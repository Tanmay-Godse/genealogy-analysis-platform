from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    AuthSessionSummary,
    AuthUserSummary,
    PersonSummary,
    RecordCreateResult,
    RelationshipSummary,
    Role,
)


class FakeRecordService:
    def __init__(self, role: Role = Role.OWNER):
        self.calls: list[tuple[str, object]] = []
        self.settings = SimpleNamespace(auth_session_cookie_name="family_tree_session")
        self.session = AuthSessionSummary(
            user=AuthUserSummary(
                user_id="user-123",
                email="curator@livingarchive.org",
                display_name="Archive Curator",
                role=role,
                created_at="2026-03-30T00:00:00+00:00",
                last_login_at="2026-03-30T00:00:00+00:00",
            ),
            remember_device=True,
            created_at="2026-03-30T00:00:00+00:00",
            expires_at="2026-04-29T00:00:00+00:00",
        )
        self.record = RecordCreateResult(
            workspace_id="pilot-family-workspace",
            graph_version="manual-20260331010101-abc123",
            person=PersonSummary(
                id="m-001",
                display_name="Lila Hart",
                birth_label="Born 1998",
                death_label=None,
                branch="Hart family branch",
                is_living=True,
                is_masked=False,
                summary="Manual archive record created for Lila Hart.",
                coordinate=(0.0, 0.0, 0.0),
            ),
            relationships=[
                RelationshipSummary(
                    id="rel-parent-of-001",
                    source_id="p4",
                    target_id="m-001",
                    kind="parent_of",
                    label="parent of",
                )
            ],
        )

    def get_auth_session(self, session_id: str):
        self.calls.append(("get_auth_session", session_id))
        if session_id == "session-token-123":
            return self.session
        return None

    def create_record(self, payload, editor_display_name: str | None = None):
        self.calls.append(("create_record", (payload, editor_display_name)))
        return self.record


def test_create_record_route_requires_authentication():
    fake_service = FakeRecordService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        response = client.post(
            "/api/v1/records",
            json={
                "first_name": "Lila",
                "last_name": "Hart",
                "branch": "Hart family branch",
            },
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."
    assert fake_service.calls == [("get_auth_session", "")]


def test_create_record_route_rejects_viewer_role():
    fake_service = FakeRecordService(role=Role.VIEWER)

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        client.cookies.set("family_tree_session", "session-token-123")
        response = client.post(
            "/api/v1/records",
            json={
                "first_name": "Lila",
                "last_name": "Hart",
                "branch": "Hart family branch",
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "Editor access required."
    assert fake_service.calls == [("get_auth_session", "session-token-123")]


def test_create_record_route_delegates_to_graph_service():
    fake_service = FakeRecordService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        client.cookies.set("family_tree_session", "session-token-123")
        response = client.post(
            "/api/v1/records",
            json={
                "first_name": "Lila",
                "last_name": "Hart",
                "branch": "Hart family branch",
                "birth_label": "Born 1998",
                "summary": "Archivist and oral history contributor.",
                "father_id": "p4",
            },
        )

    assert response.status_code == 201
    assert response.json()["person"]["display_name"] == "Lila Hart"
    assert fake_service.calls[0] == ("get_auth_session", "session-token-123")
    create_call = fake_service.calls[1]
    assert create_call[0] == "create_record"
    payload, editor_name = create_call[1]
    assert payload.first_name == "Lila"
    assert payload.father_id == "p4"
    assert editor_name == "Archive Curator"
