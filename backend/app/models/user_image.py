from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, UUID, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class UserImage(Base):
    __tablename__ = "user_images"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_movie_id = Column(Integer, ForeignKey("user_movies.id", ondelete="CASCADE"), nullable=False, index=True)

    image_type = Column(String(20), nullable=False)  # 'ticket', 'photocard', 'other'
    image_url = Column(Text, nullable=False)
    thumbnail_url = Column(Text)

    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="user_images")
    user_movie = relationship("UserMovie", back_populates="images")
