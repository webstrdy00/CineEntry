from sqlalchemy import Column, Index, Integer, String, Text, TIMESTAMP, UUID
from sqlalchemy.sql import func

from app.database import Base


class MediaCleanupJob(Base):
    __tablename__ = "media_cleanup_jobs"
    __table_args__ = (Index("ix_media_cleanup_jobs_due", "next_attempt_at", "id"),)

    id = Column(Integer, primary_key=True)
    # Deliberately no user FK: account deletion must not delete cleanup work.
    owner_id = Column(UUID(as_uuid=True), nullable=False)
    canonical_reference = Column(Text, nullable=False)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    next_attempt_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
    )
    last_error = Column(String(64), nullable=True)
