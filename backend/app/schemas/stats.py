"""
Stats Pydantic schemas
"""
from datetime import date
from typing import Optional, List

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


class StreakData(BaseModel):
    current_streak: int
    longest_streak: int
    streak_type: str  # 'daily' | 'weekly' | 'custom'
    streak_min_days: int
    last_watch_date: Optional[date] = None
    is_active_today: bool
    streak_dates: List[str] = []  # "YYYY-MM-DD" dates for current week highlighting
    current_streak_start: Optional[date] = None
    current_streak_end: Optional[date] = None
    longest_streak_start: Optional[date] = None
    longest_streak_end: Optional[date] = None
    weekly_watch_count: int = 0  # how many days watched this week


class CalendarMovieItem(BaseModel):
    id: int
    title: str
    poster_url: Optional[str] = None


class CalendarDay(BaseModel):
    date: str  # "YYYY-MM-DD" string for frontend compatibility
    movie_count: int
    movies: List[CalendarMovieItem] = []


class CalendarMonth(BaseModel):
    year: int
    month: int
    days: List[CalendarDay]


class StreakDates(BaseModel):
    year: int
    month: int
    dates: List[str]  # list of "YYYY-MM-DD" strings
