"""add predefined tags

Revision ID: b5c3d4e6f7a8
Revises: 9628abd51a8c
Create Date: 2025-10-11 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = 'b5c3d4e6f7a8'
down_revision = '9628abd51a8c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Insert predefined tags into the tags table
    """
    # Get current timestamp
    now = datetime.now()

    # Predefined tags list
    predefined_tags = [
        # 감상 평가
        {"name": "#명작", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#인생영화", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#재관람", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#기대이하", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#기대이상", "is_predefined": True, "user_id": None, "created_at": now},

        # 관람 장소
        {"name": "#극장", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#집", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#OTT", "is_predefined": True, "user_id": None, "created_at": now},

        # OTT 플랫폼
        {"name": "#넷플릭스", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#왓챠", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#디즈니플러스", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#티빙", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#웨이브", "is_predefined": True, "user_id": None, "created_at": now},

        # 감정/분위기
        {"name": "#감동", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#웃긴", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#무서운", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#슬픈", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#긴장감", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#힐링", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#설레는", "is_predefined": True, "user_id": None, "created_at": now},

        # 장르
        {"name": "#액션", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#로맨스", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#코미디", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#스릴러", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#공포", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#SF", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#판타지", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#드라마", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#애니메이션", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#다큐멘터리", "is_predefined": True, "user_id": None, "created_at": now},

        # 특징
        {"name": "#반전", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#명대사", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#OST맛집", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#영상미", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#몰입감", "is_predefined": True, "user_id": None, "created_at": now},

        # 관람 상황
        {"name": "#혼자봄", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#데이트", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#가족", "is_predefined": True, "user_id": None, "created_at": now},
        {"name": "#친구", "is_predefined": True, "user_id": None, "created_at": now},
    ]

    # Insert tags
    op.bulk_insert(
        sa.table('tags',
            sa.column('name', sa.String),
            sa.column('is_predefined', sa.Boolean),
            sa.column('user_id', sa.UUID),
            sa.column('created_at', sa.TIMESTAMP),
        ),
        predefined_tags
    )


def downgrade() -> None:
    """
    Remove predefined tags
    """
    op.execute("DELETE FROM tags WHERE is_predefined = true")
