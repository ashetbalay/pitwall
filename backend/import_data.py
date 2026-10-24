"""Load versioned snapshots into PostgreSQL: python -m backend.import_data."""
import asyncio
import json
from datetime import datetime

from backend.database import Database, ROOT
from backend.repository import RaceRepository


async def main():
    database = Database()
    count = 0
    try:
        repository = RaceRepository(database.sessions)
        for path in sorted((ROOT / "frontend/data").glob("season-*.json")):
            snapshot = json.loads(path.read_text())
            for race in snapshot["races"]:
                await repository.save(int(snapshot["season"]), race,
                                      datetime.fromisoformat(snapshot["updated_at"].replace("Z", "+00:00")))
                count += 1
        print(f"Imported {count} races (repeat imports update existing rows).")
    finally:
        await database.close()


if __name__ == "__main__":
    asyncio.run(main())
