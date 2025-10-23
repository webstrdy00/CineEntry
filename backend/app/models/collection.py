from sqlalchemy import Column, Integer, String, Text, Boolean, TIMESTAMP, UUID, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Collection(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)
    description = Column(Text)
    cover_image_url = Column(String(500))  # 커버 이미지 URL

    is_auto = Column(Boolean, default=False, index=True)
    auto_rules = Column(JSONB)  # JSON 규칙: {"genre": "액션", "year": 2023} - 복수형으로 변경

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="collections")
    collection_movies = relationship("CollectionMovie", back_populates="collection", cascade="all, delete-orphan")
