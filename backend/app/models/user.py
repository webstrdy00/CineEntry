from sqlalchemy import Column, String, Integer, TIMESTAMP, UUID, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(100))
    avatar_url = Column(String)
    yearly_goal = Column(Integer, default=100)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    # 인증 관련 필드
    password_hash = Column(String(255), nullable=True)  # OAuth 유저는 null
    auth_provider = Column(String(50), default="email")  # email, google, kakao
    email_verified = Column(Boolean, default=False)
    token_version = Column(Integer, default=0)  # 강제 로그아웃용

    # 스트릭 설정
    streak_type = Column(String(20), default="daily")  # 'daily' | 'weekly' | 'custom'
    streak_min_days = Column(Integer, default=1)  # custom 타입일 때 주당 최소 시청 일수

    # Relationships
    user_movies = relationship("UserMovie", back_populates="user", cascade="all, delete-orphan")
    user_images = relationship("UserImage", back_populates="user", cascade="all, delete-orphan")
    collections = relationship("Collection", back_populates="user", cascade="all, delete-orphan")
    custom_tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
