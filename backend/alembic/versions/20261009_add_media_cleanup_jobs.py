"""Add durable managed media cleanup jobs.

Revision ID: media_cleanup_jobs_20261009
Revises: content_series_20260426
Create Date: 2026-10-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "media_cleanup_jobs_20261009"
down_revision: Union[str, None] = "content_series_20260426"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "media_cleanup_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("owner_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_reference", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "next_attempt_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_error", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_media_cleanup_jobs_due", "media_cleanup_jobs", ["next_attempt_at", "id"]
    )


def downgrade() -> None:
    op.drop_index("ix_media_cleanup_jobs_due", table_name="media_cleanup_jobs")
    op.drop_table("media_cleanup_jobs")
