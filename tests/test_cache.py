import asyncio

from backend.cache import ResponseCache
from backend.database import Database


def test_cache_upsert_expiry_and_sql_parameters(database_url):
    async def run():
        database = Database()
        try:
            cache = ResponseCache(database.sessions)
            key = "test'); DROP TABLE responses; --"
            await cache.set(key, [1], 100)
            await cache.set(key, [2], 100)
            assert await cache.get(key) == [2]
            await cache.set("expired", {"x": 1}, -1)
            assert await cache.get("expired") is None
            assert await cache.get(key) == [2]
            await asyncio.gather(*(cache.set("shared", [i], 100) for i in range(4)))
            assert await cache.get("shared") in [[i] for i in range(4)]
        finally:
            await database.close()
    asyncio.run(run())
