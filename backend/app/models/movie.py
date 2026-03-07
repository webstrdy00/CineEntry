from sqlalchemy import Column, Integer, String, Date, Text, TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)

    # 외부 API ID
    kobis_code = Column(String(50), unique=True, index=True)
    tmdb_id = Column(Integer, index=True)
    kmdb_id = Column(String(50))

    # 기본 정보
    title_ko = Column(String(255), nullable=False, index=True)
    title_en = Column(String(255))
    title_original = Column(String(255))

    # 상세 정보
    release_date = Column(Date, index=True)
    production_year = Column(Integer)
    runtime = Column(Integer)  # 분
    genre = Column(String(255))  # 쉼표 구분
    nation = Column(String(100))
    rating = Column(String(50))  # 관람등급
    movie_type = Column(String(20))

    # 스태프
    director = Column(String(255))  # 쉼표 구분
    actors = Column(Text)  # 쉼표 구분

    # 이미지
    poster_url = Column(Text)
    backdrop_url = Column(Text)

    # 설명
    synopsis = Column(Text)

    # 메타데이터
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # Relationships
    user_movies = relationship("UserMovie", back_populates="movie", cascade="all, delete-orphan")

    # Backward-compatible aliases used by API response builders
    @property
    def title(self) -> str:
        return self.title_ko

    @property
    def original_title(self) -> str | None:
        return self.title_original

    @property
    def year(self) -> int | None:
        return self.production_year
