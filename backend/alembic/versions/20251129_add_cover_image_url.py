"""add cover_image_url to collections

Revision ID: add_cover_image_url_20251129
Revises: 20251011_1600_add_predefined_tags
Create Date: 2025-11-29
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_cover_image_url_20251129"
down_revision = "b5c3d4e6f7a8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("collections", sa.Column("cover_image_url", sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column("collections", "cover_image_url")
