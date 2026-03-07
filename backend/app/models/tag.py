from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, UUID, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, index=True)
    is_predefined = Column(Boolean, default=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)

    created_at = Column(TIMESTAMP, server_default=func.now())

    # Constraints
    __table_args__ = (
        UniqueConstraint('name', 'user_id', name='uq_tag_name_user'),
    )

    # Relationships
    user = relationship("User", back_populates="custom_tags")
    movie_tags = relationship("MovieTag", back_populates="tag", cascade="all, delete-orphan")
