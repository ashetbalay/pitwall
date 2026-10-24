"""FastAPI serves the UI and a same-origin API; providers are never user-supplied."""
import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from backend.database import Database
from backend.repository import RaceRepository
from backend.cache import ResponseCache
from backend.domain import FIRST_SEASON, current_season, is_available, match_session

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "frontend" / "data"
OPENF1 = "https://api.openf1.org/v1"
JOLPICA = "https://api.jolpi.ca/ergast/f1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.database = Database()
    app.state.cache = ResponseCache(app.state.database.sessions)
    app.state.races = RaceRepository(app.state.database.sessions)
    app.state.lock = asyncio.Lock()
    app.state.client = httpx.AsyncClient(timeout=35, follow_redirects=True)
    try:
        yield
    finally:
        await app.state.client.aclose()
        await app.state.database.close()


app = FastAPI(title="Pitwall API", version="0.1.0", lifespan=lifespan)


@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    return JSONResponse(status_code=503, content={"detail": "База данных временно недоступна"})

async def upstream(url: str, ttl: int = 3600):
    cached = await app.state.cache.get(url)
    if cached is not None:
        return cached
    # Serialize cache misses and pace calls to respect public API limits.
    async with app.state.lock:
        cached = await app.state.cache.get(url)
        if cached is not None:
            return cached
        try:
            response = await app.state.client.get(url)
            response.raise_for_status()
            value = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(503, "Источник данных временно недоступен. Повторите попытку позже.") from exc
        await app.state.cache.set(url, value, ttl)
        await asyncio.sleep(0.4)
        return value


def validate_season(season: int):
    if not FIRST_SEASON <= season <= current_season():
        raise HTTPException(404, "Сезон недоступен")


@app.get("/api/seasons")
def seasons():
    return {"current": current_season(), "seasons": list(range(current_season(), FIRST_SEASON - 1, -1))}


@app.get("/api/seasons/{season}/races")
async def races(season: int):
    validate_season(season)
    try:
        calendar = await upstream(f"{JOLPICA}/{season}/races.json?limit=100", 1800)
        winners = await upstream(f"{JOLPICA}/{season}/results/1.json?limit=100", 1800)
        completed = {r["round"] for r in winners["MRData"]["RaceTable"]["Races"]}
        rows = calendar["MRData"]["RaceTable"]["Races"]
        for race in rows:
            race["available"] = is_available({**race, "Results": [True] if race["round"] in completed else []})
        return {"season": season, "races": rows, "updated_at": datetime.now(timezone.utc).isoformat(), "stale": False}
    except HTTPException:
        snapshot = DATA / f"season-{season}.json"
        if not snapshot.exists():
            raise
        data = json.loads(snapshot.read_text())
        for race in data["races"]:
            race["available"] = is_available(race)
        return {**data, "stale": True}


@app.get("/api/seasons/{season}/races/{round_number}")
async def race_detail(season: int, round_number: int):
    validate_season(season)
    if not 1 <= round_number <= 40:
        raise HTTPException(404, "Гонка не найдена")
    try:
        payload = await upstream(f"{JOLPICA}/{season}/{round_number}/results.json?limit=100", 1800)
        rows = payload["MRData"]["RaceTable"]["Races"]
        race = rows[0] if rows else None
    except HTTPException:
        race = await app.state.races.get(season, round_number)
        if race is None:
            snapshot = DATA / f"season-{season}.json"
            if not snapshot.exists():
                raise
            race = next((r for r in json.loads(snapshot.read_text())["races"] if int(r["round"]) == round_number), None)
    else:
        if race and is_available(race):
            await app.state.races.save(season, race)
    if not race:
        raise HTTPException(404, "Результатов гонки пока нет")
    if not is_available(race):
        raise HTTPException(409, "Гонка ещё не завершена или результаты не опубликованы")
    return race


@app.get("/api/seasons/{season}/races/{round_number}/timing")
async def timing(season: int, round_number: int, kind: str = Query("laps", pattern="^(laps|pit|stints)$")):
    race = await race_detail(season, round_number)
    season_snapshot = DATA / f"season-{season}.json"
    if season_snapshot.exists():
        saved_race = next((r for r in json.loads(season_snapshot.read_text())["races"] if int(r["round"]) == round_number and r["date"] == race["date"] and r.get("Circuit", {}).get("circuitId") == race.get("Circuit", {}).get("circuitId")), None)
        if saved_race and saved_race.get("session_key"):
            saved_timing = DATA / f"timing-{saved_race['session_key']}-{kind}.json"
            if saved_timing.exists():
                return json.loads(saved_timing.read_text())
    sessions = await upstream(f"{OPENF1}/sessions?year={season}&session_name=Race", 1800)
    session = match_session(race, sessions)
    if not session:
        raise HTTPException(404, "Для этой гонки пока нет детальной статистики")
    snapshot = DATA / f"timing-{session['session_key']}-{kind}.json"
    if snapshot.exists():
        return json.loads(snapshot.read_text())
    return await upstream(f"{OPENF1}/{kind}?session_key={session['session_key']}", 86400)


@app.get("/api/health")
async def health():
    try:
        async with app.state.database.sessions() as db:
            await db.execute(text("SELECT 1 FROM responses LIMIT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(503, "База данных недоступна или миграции не применены") from exc
    return {"status": "ok"}


app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")
