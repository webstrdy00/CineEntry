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
    google_connected = Column(Boolean, default=False, nullable=False)
    kakao_connected = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    token_version = Column(Integer, default=0, nullable=False)  # 강제 로그아웃용

    # 스트릭 설정
    streak_type = Column(String(20), default="daily")  # 'daily' | 'weekly' | 'custom'
    streak_min_days = Column(Integer, default=1)  # custom 타입일 때 주당 최소 시청 일수

    # Relationships
    user_movies = relationship("UserMovie", back_populates="user", cascade="all, delete-orphan")
    user_images = relationship("UserImage", back_populates="user", cascade="all, delete-orphan")
    collections = relationship("Collection", back_populates="user", cascade="all, delete-orphan")
    custom_tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)

    @property
    def auth_methods(self) -> list[str]:
        methods: list[str] = []

        if self.password_hash:
            methods.append("email")
        if self.google_connected:
            methods.append("google")
        if self.kakao_connected:
            methods.append("kakao")

        if not methods and self.auth_provider:
            methods.append(self.auth_provider)

        return methods
