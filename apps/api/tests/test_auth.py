from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.models import AuthSessionSummary, AuthUserSummary, Role


class FakeAuthService:
    def __init__(self):
        self.calls: list[tuple[str, object]] = []
        self.settings = SimpleNamespace(auth_session_cookie_name="family_tree_session")
        self.session = AuthSessionSummary(
            user=AuthUserSummary(
                user_id="user-123",
                email="curator@livingarchive.org",
                display_name="Archive Curator",
                role=Role.OWNER,
                created_at="2026-03-30T00:00:00+00:00",
                last_login_at="2026-03-30T00:00:00+00:00",
            ),
            remember_device=True,
            created_at="2026-03-30T00:00:00+00:00",
            expires_at="2026-04-29T00:00:00+00:00",
        )

    def authenticate_user(self, email: str, password: str, remember_device: bool = False):
        self.calls.append(("authenticate_user", (email, password, remember_device)))
        if password != "ArchiveDemo!2026":
            raise ValueError("Invalid email or password.")
        return "session-token-123", self.session.model_copy(update={"remember_device": remember_device})

    def get_auth_session(self, session_id: str):
        self.calls.append(("get_auth_session", session_id))
        if session_id == "session-token-123":
            return self.session
        return None

    def revoke_auth_session(self, session_id: str) -> None:
        self.calls.append(("revoke_auth_session", session_id))

    def session_ttl_seconds(self, remember_device: bool) -> int:
        return 30 * 24 * 60 * 60 if remember_device else 12 * 60 * 60


def test_login_route_sets_cookie_and_returns_session():
    fake_service = FakeAuthService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "curator@livingarchive.org",
                "password": "ArchiveDemo!2026",
                "remember_device": True,
            },
        )

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "curator@livingarchive.org"
    assert "family_tree_session=session-token-123" in response.headers.get("set-cookie", "")
    assert fake_service.calls == [
        ("authenticate_user", ("curator@livingarchive.org", "ArchiveDemo!2026", True)),
    ]


def test_login_route_rejects_invalid_credentials():
    fake_service = FakeAuthService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "curator@livingarchive.org",
                "password": "wrong-password",
                "remember_device": False,
            },
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_current_session_route_reads_cookie():
    fake_service = FakeAuthService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        client.cookies.set("family_tree_session", "session-token-123")
        response = client.get("/api/v1/auth/session")

    assert response.status_code == 200
    assert response.json()["user"]["display_name"] == "Archive Curator"
    assert fake_service.calls == [("get_auth_session", "session-token-123")]


def test_logout_route_revokes_cookie_backed_session():
    fake_service = FakeAuthService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        client.cookies.set("family_tree_session", "session-token-123")
        response = client.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert fake_service.calls == [("revoke_auth_session", "session-token-123")]
