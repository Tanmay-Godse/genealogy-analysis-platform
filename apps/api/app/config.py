from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.models import Role


class Settings(BaseSettings):
    api_title: str = "Family Tree API"
    graph_version: str = Field(default="seed-v2", alias="FAMILY_TREE_GRAPH_VERSION")
    api_cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="API_CORS_ORIGINS",
    )
    enable_service_bootstrap: bool = Field(default=True, alias="ENABLE_SERVICE_BOOTSTRAP")
    neo4j_uri: str = Field(default="bolt://127.0.0.1:7687", alias="NEO4J_URI")
    neo4j_username: str = Field(default="neo4j", alias="NEO4J_USERNAME")
    neo4j_password: str = Field(default="familytree-dev-password", alias="NEO4J_PASSWORD")
    redis_url: str = Field(default="redis://127.0.0.1:6379/0", alias="REDIS_URL")
    opensearch_url: str = Field(default="https://127.0.0.1:9200", alias="OPENSEARCH_URL")
    opensearch_username: str = Field(default="admin", alias="OPENSEARCH_USERNAME")
    opensearch_password: str = Field(default="FamilyTreeDev@2026", alias="OPENSEARCH_PASSWORD")
    postgres_host: str = Field(default="127.0.0.1", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_database: str = Field(default="family_tree", alias="POSTGRES_DATABASE")
    postgres_user: str = Field(default="family_tree", alias="POSTGRES_USER")
    postgres_password: str = Field(default="familytree-dev-password", alias="POSTGRES_PASSWORD")
    auth_session_cookie_name: str = Field(
        default="family_tree_session",
        alias="AUTH_SESSION_COOKIE_NAME",
    )
    auth_session_ttl_hours: int = Field(default=12, alias="AUTH_SESSION_TTL_HOURS")
    auth_remember_device_days: int = Field(default=30, alias="AUTH_REMEMBER_DEVICE_DAYS")
    auth_bootstrap_email: str = Field(
        default="curator@livingarchive.org",
        alias="AUTH_BOOTSTRAP_EMAIL",
    )
    auth_bootstrap_password: str = Field(
        default="ArchiveDemo!2026",
        alias="AUTH_BOOTSTRAP_PASSWORD",
    )
    auth_bootstrap_display_name: str = Field(
        default="Archive Curator",
        alias="AUTH_BOOTSTRAP_DISPLAY_NAME",
    )
    auth_bootstrap_role: Role = Field(default=Role.OWNER, alias="AUTH_BOOTSTRAP_ROLE")
    minio_endpoint_url: str = Field(default="http://127.0.0.1:9000", alias="MINIO_ENDPOINT_URL")
    minio_access_key: str = Field(default="familytree", alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(default="familytree-dev-password", alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field(default="genealogy-imports", alias="MINIO_BUCKET")
    minio_health_url: str = Field(
        default="http://127.0.0.1:9000/minio/health/live",
        alias="MINIO_HEALTH_URL",
    )
    service_timeout_seconds: float = Field(default=2.0, alias="SERVICE_TIMEOUT_SECONDS")

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
