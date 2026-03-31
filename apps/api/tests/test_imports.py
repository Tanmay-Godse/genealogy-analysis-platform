from fastapi.testclient import TestClient

from app.main import app
from app.models import ImportJobSummary, ImportStatus


class FakeGraphService:
    def __init__(self):
        self.calls: list[tuple[str, str | tuple[str, bytes]]] = []
        self.import_summary = ImportJobSummary(
            import_id="import123",
            filename="pilot-family.ged",
            status=ImportStatus.COMPLETED,
            workspace_id="pilot-family-workspace",
            graph_version="import-import123",
            storage_key="imports/import123/pilot-family.ged",
            people_count=5,
            family_count=2,
            relationship_count=5,
            living_people_count=4,
            focus_person_id="g-i4",
        )

    def list_imports(self) -> list[ImportJobSummary]:
        self.calls.append(("list_imports", ""))
        return [self.import_summary]

    def import_gedcom_file(self, filename: str, content: bytes) -> ImportJobSummary:
        self.calls.append(("import_gedcom_file", (filename, content)))
        return self.import_summary.model_copy(update={"filename": filename})


def test_list_imports_route_returns_service_payload():
    fake_service = FakeGraphService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        response = client.get("/api/v1/imports")

    assert response.status_code == 200
    assert response.json()[0]["import_id"] == "import123"
    assert fake_service.calls == [("list_imports", "")]


def test_upload_gedcom_route_delegates_to_graph_service():
    fake_service = FakeGraphService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        response = client.post(
            "/api/v1/imports/gedcom",
            files={"file": ("pilot-family.ged", b"0 HEAD\n0 TRLR\n", "text/plain")},
        )

    assert response.status_code == 200
    assert response.json()["filename"] == "pilot-family.ged"
    assert fake_service.calls == [("import_gedcom_file", ("pilot-family.ged", b"0 HEAD\n0 TRLR\n"))]


def test_upload_gedcom_route_rejects_empty_file():
    fake_service = FakeGraphService()

    with TestClient(app) as client:
        client.app.state.graph_service = fake_service
        response = client.post(
            "/api/v1/imports/gedcom",
            files={"file": ("empty.ged", b"", "text/plain")},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is empty."
    assert fake_service.calls == []
