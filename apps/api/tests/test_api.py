from fastapi.testclient import TestClient

from app.main import app


def test_healthz():
    with TestClient(app) as client:
        response = client.get("/healthz")

        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_viewer_masks_living_person_search():
    with TestClient(app) as client:
        response = client.get("/api/v1/search", params={"q": "David", "role": "viewer"})

        assert response.status_code == 200
        payload = response.json()
        assert payload[0]["display_name"] == "Private Living Person"
        assert payload[0]["is_masked"] is True


def test_workspace_summary_counts():
    with TestClient(app) as client:
        response = client.get("/api/v1/workspace/summary")

        assert response.status_code == 200
        payload = response.json()
        assert payload["people_count"] == 7
        assert payload["living_people_count"] == 5
        assert payload["relationship_count"] == 9


def test_kinship_returns_path_and_evidence():
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/graph/kinship",
            params={"source_id": "p1", "target_id": "p7", "role": "owner"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert len(payload["path"]) >= 2
        assert payload["evidence"]


def test_graphql_workspace_scene():
    query = """
    query WorkspaceScene {
      workspaceScene {
        focusPersonId
        nodes {
          id
          displayName
        }
      }
    }
    """

    with TestClient(app) as client:
        response = client.post("/graphql", json={"query": query})

        assert response.status_code == 200
        payload = response.json()["data"]["workspaceScene"]
        assert payload["focusPersonId"] == "p4"
        assert len(payload["nodes"]) >= 3
