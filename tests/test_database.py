import asyncio
import copy
import os
import subprocess

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import StatementError

from backend.database import Database
from backend.models import Driver, Race, RaceResult
from backend.repository import RaceRepository

RACE = {"season": "2025", "round": "1", "raceName": "Test GP", "date": "2025-03-16", "time": "04:00:00Z",
        "Results": [{"position": "1", "points": "25", "Driver": {
            "driverId": "norris", "givenName": "Lando", "familyName": "Norris"}}]}


def test_import_is_idempotent_and_transactional(database_url):
    async def run():
        database = Database()
        try:
            repo = RaceRepository(database.sessions)
            await repo.save(2025, RACE)
            await repo.save(2025, RACE)
            assert await repo.get(2025, 1) == RACE
            broken = copy.deepcopy(RACE)
            broken["Results"][0]["points"] = "invalid"
            with pytest.raises(StatementError):
                await repo.save(2025, broken)
            assert await repo.get(2025, 1) == RACE
            corrected = copy.deepcopy(RACE)
            corrected["Results"][0]["points"] = "18"
            await repo.save(2025, corrected)
            assert await repo.get(2025, 1) == corrected
            async with database.sessions() as db:
                for model in (Race, Driver, RaceResult):
                    assert await db.scalar(select(func.count()).select_from(model)) == 1
        finally:
            await database.close()
    asyncio.run(run())


def test_migration_round_trip_and_model_parity(database_url):
    for args in [("check",), ("downgrade", "base"), ("upgrade", "head"), ("check",)]:
        result = subprocess.run([os.sys.executable, "-m", "alembic", *args], capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr


def test_persisted_result_survives_provider_outage(database_url, monkeypatch, tmp_path):
    from fastapi import HTTPException
    from fastapi.testclient import TestClient
    from backend import main

    async def online(*args):
        return {"MRData": {"RaceTable": {"Races": [RACE]}}}

    async def offline(*args):
        raise HTTPException(503, "offline")

    monkeypatch.setattr(main, "DATA", tmp_path)
    monkeypatch.setattr(main, "upstream", online)
    with TestClient(main.app) as client:
        assert client.get("/api/seasons/2025/races/1").json() == RACE
    monkeypatch.setattr(main, "upstream", offline)
    with TestClient(main.app) as client:
        assert client.get("/api/seasons/2025/races/1").json() == RACE
