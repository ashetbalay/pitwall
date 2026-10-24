"""Small, testable rules shared by the API and data import."""
from datetime import datetime, timezone

FIRST_SEASON = 2025


def current_season(now: datetime | None = None) -> int:
    return (now or datetime.now(timezone.utc)).year


def race_start(race: dict) -> datetime:
    return datetime.fromisoformat(f"{race['date']}T{race.get('time', '23:59:59Z')}".replace("Z", "+00:00"))


def is_available(race: dict, now: datetime | None = None) -> bool:
    """A calendar date alone never unlocks an unfinished race."""
    return bool(race.get("Results")) and race_start(race) < (now or datetime.now(timezone.utc))


def match_session(race: dict, sessions: list[dict]) -> dict | None:
    candidates = [s for s in sessions if s.get("session_name") == "Race" and not s.get("is_cancelled")]
    if not candidates:
        return None
    closest = min(candidates, key=lambda s: abs((datetime.fromisoformat(s["date_start"]) - race_start(race)).total_seconds()))
    distance = abs((datetime.fromisoformat(closest["date_start"]) - race_start(race)).total_seconds())
    return closest if distance < 36 * 3600 else None
