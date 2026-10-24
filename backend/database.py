"""Database configuration shared by the API, import command and Alembic."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]


def database_url():
    load_dotenv(ROOT / ".env")
    value = os.environ.get("DATABASE_URL")
    if not value and os.environ.get("PGHOST"):
        return URL.create("postgresql+psycopg", username=os.environ["PGUSER"],
                          password=os.environ["PGPASSWORD"], host=os.environ["PGHOST"],
                          port=int(os.environ.get("PGPORT", "5432")), database=os.environ["PGDATABASE"])
    if not value:
        raise RuntimeError("Set DATABASE_URL in .env (see .env.example), start PostgreSQL and run alembic upgrade head.")
    url = make_url(value)
    if url.get_backend_name() != "postgresql":
        raise ValueError("Pitwall requires a PostgreSQL DATABASE_URL")
    return url.set(drivername="postgresql+psycopg")


class Database:
    def __init__(self):
        self.engine = create_async_engine(database_url(), pool_pre_ping=True, connect_args={"connect_timeout": 5})
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    async def close(self):
        await self.engine.dispose()
