from sqlalchemy import Column, Integer, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class MovieTag(Base):
    __tablename__ = "movie_tags"

    id = Column(Integer, primary_key=True, index=True)
    user_movie_id = Column(Integer, ForeignKey("user_movies.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(TIMESTAMP, server_default=func.now())

    # Constraints
    __table_args__ = (
        UniqueConstraint('user_movie_id', 'tag_id', name='uq_user_movie_tag'),
    )

    # Relationships
    user_movie = relationship("UserMovie", back_populates="movie_tags")
    tag = relationship("Tag", back_populates="movie_tags")
