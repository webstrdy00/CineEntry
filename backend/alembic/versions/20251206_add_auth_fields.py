"""Add authentication fields to users table

Revision ID: add_auth_fields
Revises: 20251129_add_cover_image_url
Create Date: 2025-12-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_auth_fields_20251206'
down_revision: Union[str, None] = 'add_cover_image_url_20251129'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 인증 관련 컬럼 추가
    op.add_column('users', sa.Column('password_hash', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('auth_provider', sa.String(50), server_default='email', nullable=False))
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'token_version')
    op.drop_column('users', 'email_verified')
    op.drop_column('users', 'auth_provider')
    op.drop_column('users', 'password_hash')
