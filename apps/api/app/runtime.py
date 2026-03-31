from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app.config import get_settings
from app.services.graph import GraphService


@asynccontextmanager
async def lifespan(app: FastAPI):
    service = GraphService(get_settings())
    service.bootstrap()
    app.state.graph_service = service
    yield
    service.close()


def get_graph_service(request: Request) -> GraphService:
    return request.app.state.graph_service
