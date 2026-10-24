"""Transactional, repeatable ingestion of complete race results."""
from datetime import date, datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from backend.models import Driver, Race, RaceResult


class RaceRepository:
    def __init__(self, sessions):
        self.sessions = sessions

    async def save(self, season: int, race: dict, updated_at: datetime | None = None):
        # Serialize writers for one race via its upsert row lock. Replacing the
        # full result in the same transaction also handles corrected classifications.
        results = race.get("Results", [])
        payload = {k: v for k, v in race.items() if k not in ("Results", "available")}
        stmt = insert(Race).values(
            season=season, round=int(race["round"]), name=race.get("raceName", ""),
            date=date.fromisoformat(race["date"]), payload=payload,
            updated_at=updated_at or datetime.now(timezone.utc),
        )
        async with self.sessions.begin() as db:
            race_id = await db.scalar(stmt.on_conflict_do_update(
                constraint="uq_races_season_round",
                set_={name: getattr(stmt.excluded, name) for name in ("name", "date", "payload", "updated_at")},
            ).returning(Race.id))
            await db.execute(delete(RaceResult).where(RaceResult.race_id == race_id))
            for result in sorted(results, key=lambda r: r["Driver"]["driverId"]):
                driver = result["Driver"]
                driver_stmt = insert(Driver).values(
                    id=driver["driverId"], given_name=driver["givenName"], family_name=driver["familyName"],
                )
                await db.execute(driver_stmt.on_conflict_do_update(
                    index_elements=[Driver.id], set_={"given_name": driver_stmt.excluded.given_name, "family_name": driver_stmt.excluded.family_name},
                ))
                db.add(RaceResult(race_id=race_id, driver_id=driver["driverId"],
                                  position=int(result["position"]), points=result["points"], payload=result))

    async def get(self, season: int, round_number: int):
        async with self.sessions() as db:
            race = await db.scalar(select(Race).where(Race.season == season, Race.round == round_number))
            if race is None:
                return None
            results = (await db.scalars(select(RaceResult.payload).where(
                RaceResult.race_id == race.id).order_by(RaceResult.position))).all()
            return {**race.payload, "Results": list(results)}
