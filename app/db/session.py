from typing import Any

from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


_engine_kwargs: dict[str, Any] = {
    "future": True,
    "connect_args": settings.database_connect_args,
}

if settings.normalized_database_url.startswith("sqlite"):
    _engine_kwargs["poolclass"] = NullPool
else:
    # Keep a warm pool of connections: opening a fresh TLS connection to a
    # remote Postgres on every request costs hundreds of milliseconds.
    _engine_kwargs.update(
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        # Serverless Postgres providers drop idle connections after ~5 min
        pool_recycle=280,
        pool_pre_ping=True,
    )

engine = create_async_engine(settings.normalized_database_url, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
