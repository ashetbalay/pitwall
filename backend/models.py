"""Relational race data; source payloads retain fields needed by the existing UI."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Race(Base):
    __tablename__ = "races"
    __table_args__ = (
        UniqueConstraint("season", "round", name="uq_races_season_round"),
        CheckConstraint("season >= 2025 AND round > 0", name="ck_races_season_round"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    season: Mapped[int]
    round: Mapped[int]
    name: Mapped[str]
    date: Mapped[date]
    payload: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Driver(Base):
    __tablename__ = "drivers"
    id: Mapped[str] = mapped_column(primary_key=True)
    given_name: Mapped[str]
    family_name: Mapped[str]


class RaceResult(Base):
    __tablename__ = "race_results"
    race_id: Mapped[int] = mapped_column(ForeignKey("races.id", ondelete="CASCADE"), primary_key=True)
    driver_id: Mapped[str] = mapped_column(ForeignKey("drivers.id"), primary_key=True)
    position: Mapped[int]
    points: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    payload: Mapped[dict] = mapped_column(JSONB)


class CachedResponse(Base):
    __tablename__ = "responses"
    key: Mapped[str] = mapped_column(primary_key=True)
    payload: Mapped[dict | list] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
