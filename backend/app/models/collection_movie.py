from sqlalchemy import Column, Integer, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CollectionMovie(Base):
    __tablename__ = "collection_movies"

    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False, index=True)
    user_movie_id = Column(Integer, ForeignKey("user_movies.id", ondelete="CASCADE"), nullable=False, index=True)

    sort_order = Column(Integer, default=0)  # 정렬 순서
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Constraints
    __table_args__ = (
        UniqueConstraint('collection_id', 'user_movie_id', name='uq_collection_user_movie'),
    )

    # Relationships
    collection = relationship("Collection", back_populates="collection_movies")
    user_movie = relationship("UserMovie", back_populates="collection_movies")
