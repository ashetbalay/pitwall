from datetime import datetime, timezone

from backend.domain import is_available, match_session

NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)


def test_past_date_without_results_does_not_unlock_race():
    assert not is_available({"date": "2026-10-11", "time": "12:00:00Z", "Results": []}, NOW)


def test_future_race_with_erroneous_result_is_still_locked():
    assert not is_available({"date": "2026-10-25", "time": "20:00:00Z", "Results": [{"position": "1"}]}, NOW)


def test_published_past_result_unlocks_race():
    assert is_available({"date": "2026-10-11", "time": "12:00:00Z", "Results": [{"position": "1"}]}, NOW)


def test_missing_start_time_is_conservative():
    assert not is_available({"date": "2026-10-22", "Results": [True]}, NOW)


def test_session_matching_excludes_sprints_and_cancelled_sessions():
    race = {"date": "2026-10-11", "time": "12:00:00Z"}
    sessions = [
        {"session_key": 1, "date_start": "2026-10-11T12:00:00+00:00", "session_name": "Sprint"},
        {"session_key": 2, "date_start": "2026-10-11T12:00:00+00:00", "session_name": "Race", "is_cancelled": True},
        {"session_key": 3, "date_start": "2026-10-11T13:00:00+00:00", "session_name": "Race"},
    ]
    assert match_session(race, sessions)["session_key"] == 3


def test_missing_session_never_matches_another_weekend():
    assert match_session({"date": "2026-10-11", "time": "12:00:00Z"}, [{"session_name": "Race", "date_start": "2026-10-25T20:00:00+00:00"}]) is None
