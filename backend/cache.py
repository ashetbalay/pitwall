"""PostgreSQL response cache with TTL and atomic upserts."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from backend.models import CachedResponse


class ResponseCache:
    def __init__(self, sessions):
        self.sessions = sessions

    async def get(self, key: str):
        async with self.sessions() as db:
            return await db.scalar(select(CachedResponse.payload).where(
                CachedResponse.key == key,
                CachedResponse.expires_at > datetime.now(timezone.utc),
            ))

    async def set(self, key: str, value, ttl: int):
        now = datetime.now(timezone.utc)
        stmt = insert(CachedResponse).values(key=key, payload=value, expires_at=now + timedelta(seconds=ttl))
        async with self.sessions.begin() as db:
            await db.execute(delete(CachedResponse).where(CachedResponse.expires_at < now))
            await db.execute(stmt.on_conflict_do_update(
                index_elements=[CachedResponse.key],
                set_={"payload": stmt.excluded.payload, "expires_at": stmt.excluded.expires_at},
            ))
