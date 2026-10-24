from backend.cache import ResponseCache


def test_cache_upsert_expiry_and_sql_parameters(tmp_path):
    cache = ResponseCache(tmp_path / "cache.sqlite3")
    key = "test'); DROP TABLE responses; --"
    cache.set(key, [1], 100)
    cache.set(key, [2], 100)
    assert cache.get(key) == [2]
    cache.set("expired", {"x": 1}, -1)
    assert cache.get("expired") is None
    assert cache.get(key) == [2]
