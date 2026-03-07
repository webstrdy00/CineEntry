"""Add streak_type and streak_min_days to users table

Revision ID: add_streak_fields_20260222
Revises: add_auth_fields_20251206
Create Date: 2026-02-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_streak_fields_20260222'
down_revision: Union[str, None] = 'add_auth_fields_20251206'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('streak_type', sa.String(20), server_default='daily', nullable=False))
    op.add_column('users', sa.Column('streak_min_days', sa.Integer(), server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'streak_min_days')
    op.drop_column('users', 'streak_type')
