"""
Stats Pydantic schemas
"""
from datetime import date
from typing import Optional

from pydantic import BaseModel


class StatsOverview(BaseModel):
    total_watched: int
    total_watch_time: int
    average_rating: float
    current_streak: int
    yearly_goal: int
    yearly_progress: int
    yearly_goal_percentage: float


class MonthlyStats(BaseModel):
    month: str
    count: int


class GenreStats(BaseModel):
    genre: str
    count: int
    percentage: float


class TagStats(BaseModel):
    tag: str
    count: int


class BestMovie(BaseModel):
    id: int
    title: str
    director: Optional[str] = None
    year: Optional[int] = None
    poster_url: Optional[str] = None
    rating: float
    review: str
    watch_date: Optional[date] = None

    class Config:
        from_attributes = True
