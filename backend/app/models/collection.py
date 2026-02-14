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
    # DB 실제 컬럼명은 auto_rule(단수)이므로 컬럼명 매핑을 명시한다.
    # 코드/응답에서는 auto_rules(복수형) 속성명을 유지해 기존 API 호환성을 보장한다.
    auto_rules = Column("auto_rule", JSONB)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="collections")
    collection_movies = relationship("CollectionMovie", back_populates="collection", cascade="all, delete-orphan")
