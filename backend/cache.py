"""A bounded, persistent upstream response cache. No user data is stored."""
import json
import sqlite3
import time
from pathlib import Path


class ResponseCache:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS responses (key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at REAL NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def get(self, key: str):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM responses WHERE key = ? AND expires_at > ?", (key, time.time())).fetchone()
        return json.loads(row[0]) if row else None

    def set(self, key: str, value, ttl: int):
        with self.connect() as db:
            db.execute("DELETE FROM responses WHERE expires_at < ?", (time.time(),))
            db.execute("INSERT INTO responses VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at", (key, json.dumps(value), time.time() + ttl))
