"""Add social connection flags to users table

Revision ID: add_auth_connections_20260307
Revises: add_streak_fields_20260222
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_auth_connections_20260307'
down_revision: Union[str, None] = 'add_streak_fields_20260222'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('google_connected', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('kakao_connected', sa.Boolean(), server_default='false', nullable=False))

    op.execute("UPDATE users SET google_connected = true WHERE auth_provider = 'google'")
    op.execute("UPDATE users SET kakao_connected = true WHERE auth_provider = 'kakao'")
    op.execute("UPDATE users SET auth_provider = 'email' WHERE password_hash IS NOT NULL")


def downgrade() -> None:
    op.drop_column('users', 'kakao_connected')
    op.drop_column('users', 'google_connected')
