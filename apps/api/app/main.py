from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.graphql import graphql_app
from app.api.rest import router as api_router
from app.config import get_settings
from app.runtime import lifespan

settings = get_settings()

app = FastAPI(
    title=settings.api_title,
    version="0.1.0",
    description="Pilot API for the 3D genealogy analysis platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["system"])
def healthz():
    return app.state.graph_service.health_snapshot()


app.include_router(api_router)
app.include_router(graphql_app, prefix="/graphql", tags=["graphql"])
