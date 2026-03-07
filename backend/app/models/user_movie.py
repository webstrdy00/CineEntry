from sqlalchemy import Column, Integer, String, Date, Boolean, Text, TIMESTAMP, UUID, DECIMAL, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class UserMovie(Base):
    __tablename__ = "user_movies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=False)

    # 필수 항목
    status = Column(String(20), nullable=False, index=True)  # 'wishlist', 'watching', 'completed'
    watch_date = Column(Date, index=True)
    rating = Column(DECIMAL(2, 1))  # 0 ~ 5, 0.5 단위
    one_line_review = Column(Text)

    # 선택 항목
    watch_location = Column(String(255))
    watch_method = Column(String(50))  # 'theater', 'ott', 'tv', 'other'
    watched_with = Column(String(255))
    is_best_movie = Column(Boolean, default=False, index=True)
    detailed_review = Column(Text)

    # 진행률 (watching 상태일 때)
    progress = Column(Integer, default=0)

    # 메타데이터
    created_at = Column(TIMESTAMP, server_default=func.now(), index=True)
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'movie_id', name='uq_user_movie'),
        CheckConstraint('rating >= 0 AND rating <= 5', name='ck_rating_range'),
    )

    # Relationships
    user = relationship("User", back_populates="user_movies")
    movie = relationship("Movie", back_populates="user_movies")
    images = relationship("UserImage", back_populates="user_movie", cascade="all, delete-orphan")
    movie_tags = relationship("MovieTag", back_populates="user_movie", cascade="all, delete-orphan")
    collection_movies = relationship("CollectionMovie", back_populates="user_movie", cascade="all, delete-orphan")
