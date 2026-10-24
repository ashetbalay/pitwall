import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PITWALL_CACHE", str(tmp_path / "cache.sqlite3"))
    with TestClient(main.app) as client:
        yield client


def test_api_and_ui_are_served_together(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert "Pitwall" in client.get("/").text


def test_season_range_starts_at_2025(client):
    data = client.get("/api/seasons").json()
    assert data["seasons"][-1] == 2025
    assert data["seasons"][0] == datetime.now(timezone.utc).year
    assert client.get("/api/seasons/2024/races").status_code == 404


def test_direct_api_request_cannot_unlock_future_race(client, monkeypatch):
    future = datetime.now(timezone.utc) + timedelta(days=2)

    async def fake_upstream(*args):
        return {"MRData": {"RaceTable": {"Races": [{"date": future.date().isoformat(), "time": "20:00:00Z", "Results": [{"position": "1"}]}]}}}

    monkeypatch.setattr(main, "upstream", fake_upstream)
    assert client.get(f"/api/seasons/{future.year}/races/1").status_code == 409


def test_calendar_requires_result_not_just_date(client, monkeypatch):
    async def fake_upstream(url, *args):
        rows = [{"round": "1", "date": "2025-03-16", "time": "04:00:00Z"}] if "races.json" in url else []
        return {"MRData": {"RaceTable": {"Races": rows}}}

    monkeypatch.setattr(main, "upstream", fake_upstream)
    response = client.get("/api/seasons/2025/races")
    assert not response.json()["races"][0]["available"]


def test_provider_outage_returns_dated_snapshot(client, monkeypatch, tmp_path):
    snapshot = {"season": 2025, "updated_at": "2025-12-08T00:00:00Z", "races": [{"round": "1", "date": "2025-03-16", "time": "04:00:00Z", "Results": [{"position": "1"}]}]}
    (tmp_path / "season-2025.json").write_text(json.dumps(snapshot))
    monkeypatch.setattr(main, "DATA", tmp_path)

    async def failed(*args):
        raise HTTPException(503, "offline")

    monkeypatch.setattr(main, "upstream", failed)
    data = client.get("/api/seasons/2025/races").json()
    assert data["stale"] is True
    assert data["updated_at"] == snapshot["updated_at"]
    assert data["races"][0]["available"] is True


def test_timing_kind_cannot_be_used_as_arbitrary_url(client):
    assert client.get("/api/seasons/2025/races/1/timing?kind=https://example.com").status_code == 422


def test_saved_timing_works_without_openf1_session_lookup(client, monkeypatch, tmp_path):
    race = {"round": "1", "date": "2025-03-16", "time": "04:00:00Z", "Circuit": {"circuitId": "albert_park"}, "Results": [{"position": "1"}], "session_key": 99}
    (tmp_path / "season-2025.json").write_text(json.dumps({"races": [race]}))
    (tmp_path / "timing-99-laps.json").write_text(json.dumps([{"lap_number": 1, "lap_duration": 90}]))
    monkeypatch.setattr(main, "DATA", tmp_path)

    async def fake_upstream(url, *args):
        assert "results.json" in url, "A saved timing snapshot must not require OpenF1 to be online"
        return {"MRData": {"RaceTable": {"Races": [race]}}}

    monkeypatch.setattr(main, "upstream", fake_upstream)
    assert client.get("/api/seasons/2025/races/1/timing").json() == [{"lap_number": 1, "lap_duration": 90}]
