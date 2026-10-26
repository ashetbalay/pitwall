# Changelog

## [Unreleased]

## [0.2.0] - 2026-10-26

### Added
- PostgreSQL storage with SQLAlchemy async sessions and psycopg.
- Alembic migration for races, drivers, results and the response cache.
- Repeatable snapshot import and persisted results during provider outages.
- Docker Compose with database readiness and a separate migration step.
- PostgreSQL integration tests and migration checks in CI.
- A single application version, `/api/version`, and tagged GitHub releases.

### Changed
- PostgreSQL JSONB replaces the SQLite response cache.

## [0.1.0] - 2026-10-24

### Added
- Season calendars from 2025, completed race results and timing views.
- Driver comparison, public provider integration and saved snapshots.
- FastAPI backend, responsive JavaScript interface and a local launcher.
- Automated Python, JavaScript and Docker checks.
