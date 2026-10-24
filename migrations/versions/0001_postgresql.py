"""Create PostgreSQL race storage and response cache."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_postgresql"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("races",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("season", sa.Integer(), nullable=False),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("season", "round", name="uq_races_season_round"),
        sa.CheckConstraint("season >= 2025 AND round > 0", name="ck_races_season_round"),
    )
    op.create_table("drivers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("given_name", sa.String(), nullable=False),
        sa.Column("family_name", sa.String(), nullable=False),
    )
    op.create_table("race_results",
        sa.Column("race_id", sa.Integer(), sa.ForeignKey("races.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("driver_id", sa.String(), sa.ForeignKey("drivers.id"), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("points", sa.Numeric(8, 2), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )
    op.create_table("responses",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_responses_expires_at", "responses", ["expires_at"])


def downgrade():
    op.drop_index("ix_responses_expires_at", table_name="responses")
    op.drop_table("responses")
    op.drop_table("race_results")
    op.drop_table("drivers")
    op.drop_table("races")
