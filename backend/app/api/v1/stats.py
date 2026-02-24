from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, text
from datetime import datetime, date, timedelta
from typing import List
from app.database import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.user import User
from app.models.user_movie import UserMovie
from app.models.movie import Movie
from app.models.movie_tag import MovieTag
from app.models.tag import Tag
from pydantic import BaseModel
from typing import Optional
from app.schemas.stats import (
    StatsOverview, MonthlyStats, GenreStats, TagStats, BestMovie,
    StreakData, CalendarDay, CalendarMovieItem, CalendarMonth, StreakDates
)
from app.schemas.movie import MovieResponse
from app.schemas.common import BaseResponse

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/", response_model=BaseResponse[StatsOverview])
async def get_user_stats(
    year: int = Query(default=datetime.now().year, description="Year for statistics"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get overall statistics for the user

    Returns:
    - Total watched movies
    - Average rating
    - Total watch time (minutes)
    - Current streak
    - Yearly goal progress
    """
    # Get user info
    user = db.query(User).filter(User.id == user_id).first()

    # Total watched movies
    total_watched = (
        db.query(func.count(UserMovie.id))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
        )
        .scalar() or 0
    )

    # watch_date가 비어있는 레거시 데이터는 created_at 날짜로 보정
    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))

    # Total watched this year
    yearly_watched = (
        db.query(func.count(UserMovie.id))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
            extract("year", watch_day_expr) == year,
        )
        .scalar() or 0
    )

    # Average rating
    avg_rating = (
        db.query(func.avg(UserMovie.rating))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
            UserMovie.rating.isnot(None),
        )
        .scalar() or 0
    )

    # Total watch time
    total_watch_time = (
        db.query(func.sum(Movie.runtime))
        .join(UserMovie, UserMovie.movie_id == Movie.id)
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
        )
        .scalar() or 0
    )

    # Calculate streak
    current_streak = await calculate_streak(db, user_id)

    # Yearly goal progress
    yearly_goal = user.yearly_goal if user else 100
    yearly_goal_percentage = (yearly_watched / yearly_goal * 100) if yearly_goal > 0 else 0

    stats_data = StatsOverview(
        total_watched=total_watched,
        total_watch_time=int(total_watch_time),
        average_rating=round(float(avg_rating), 2) if avg_rating else 0.0,
        current_streak=current_streak,
        yearly_goal=yearly_goal,
        yearly_progress=yearly_watched,
        yearly_goal_percentage=round(yearly_goal_percentage, 1),
    )

    return BaseResponse(
        success=True,
        message="Stats retrieved successfully",
        data=stats_data
    )


@router.get("/monthly", response_model=BaseResponse[List[MonthlyStats]])
async def get_monthly_stats(
    months: int = Query(default=6, description="Number of months to fetch"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get monthly viewing statistics

    Returns movie count per month for the last N months
    """
    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))

    # Get monthly aggregation
    results = (
        db.query(
            func.to_char(watch_day_expr, 'YYYY-MM').label('month'),
            func.count(UserMovie.id).label('count')
        )
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
        )
        .group_by(text('month'))
        .order_by(text('month DESC'))
        .limit(months)
        .all()
    )

    monthly_data = [
        MonthlyStats(month=row.month, count=row.count)
        for row in reversed(results)  # Reverse to show oldest first
    ]

    return BaseResponse(
        success=True,
        message="Monthly stats retrieved successfully",
        data=monthly_data
    )


@router.get("/genres", response_model=BaseResponse[List[GenreStats]])
async def get_genre_stats(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get genre breakdown statistics

    Parses comma-separated genre field from movies
    """
    # Get all completed movies with genres
    movies = (
        db.query(Movie.genre)
        .join(UserMovie, UserMovie.movie_id == Movie.id)
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
            Movie.genre.isnot(None),
        )
        .all()
    )

    # Parse genres (comma-separated)
    genre_count = {}
    for (genre_str,) in movies:
        if genre_str:
            genres = [g.strip() for g in genre_str.split(",")]
            for genre in genres:
                if genre:
                    genre_count[genre] = genre_count.get(genre, 0) + 1

    # Calculate total for percentage
    total = sum(genre_count.values())

    # Sort by count and get top genres
    sorted_genres = sorted(genre_count.items(), key=lambda x: x[1], reverse=True)

    genre_data = [
        GenreStats(
            genre=genre,
            count=count,
            percentage=round((count / total * 100), 1) if total > 0 else 0
        )
        for genre, count in sorted_genres
    ]

    return BaseResponse(
        success=True,
        message="Genre stats retrieved successfully",
        data=genre_data
    )


@router.get("/tags", response_model=BaseResponse[List[TagStats]])
async def get_tag_stats(
    limit: int = Query(default=10, description="Number of top tags to return"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get most used tags
    """
    # Get tag usage counts
    results = (
        db.query(
            Tag.name,
            func.count(MovieTag.id).label('count')
        )
        .join(MovieTag, MovieTag.tag_id == Tag.id)
        .join(UserMovie, MovieTag.user_movie_id == UserMovie.id)
        .filter(UserMovie.user_id == user_id)
        .group_by(Tag.name)
        .order_by(text('count DESC'))
        .limit(limit)
        .all()
    )

    tag_data = [
        TagStats(tag=row.name, count=row.count)
        for row in results
    ]

    return BaseResponse(
        success=True,
        message="Tag stats retrieved successfully",
        data=tag_data
    )


@router.get("/best-movies", response_model=BaseResponse[List[BestMovie]])
async def get_best_movies(
    limit: int = Query(default=5, description="Number of best movies to return"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get user's best movies (is_best_movie = true)
    """
    best_movies = (
        db.query(UserMovie)
        .options(joinedload(UserMovie.movie))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.is_best_movie == True,
        )
        .order_by(UserMovie.rating.desc(), UserMovie.watch_date.desc())
        .limit(limit)
        .all()
    )

    best_movies_data = [
        BestMovie(
            id=um.id,
            # MovieResponse의 alias를 활용하여 자동 매핑
            **MovieResponse.model_validate(um.movie).model_dump(
                include={"title", "director", "year", "poster_url"}
            ),
            rating=float(um.rating) if um.rating else 0,
            review=um.one_line_review or "",
            watch_date=um.watch_date,
        )
        for um in best_movies
    ]

    return BaseResponse(
        success=True,
        message="Best movies retrieved successfully",
        data=best_movies_data
    )


@router.get("/streak", response_model=BaseResponse[StreakData])
async def get_streak(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get current and longest streak data for the user.
    Supports streak_type: 'daily' | 'weekly' | 'custom'
    """
    user = db.query(User).filter(User.id == user_id).first()
    streak_type = user.streak_type if user and user.streak_type else "daily"
    streak_min_days = user.streak_min_days if user and user.streak_min_days else 1

    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))

    watch_dates = (
        db.query(watch_day_expr.label("watch_day"))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
        )
        .order_by(text("watch_day DESC"))
        .distinct()
        .all()
    )

    dates = [row[0] for row in watch_dates if row[0] is not None]

    today = date.today()
    last_watch_date = dates[0] if dates else None
    is_active_today = last_watch_date == today if last_watch_date else False

    streak_result = _calculate_streaks(dates, streak_type, streak_min_days)

    # Build streak_dates for current week (Mon-Sun) for HomeScreen checkboxes
    day_of_week = today.weekday()  # 0=Mon, 6=Sun
    week_monday = today - timedelta(days=day_of_week)
    current_week_dates = {week_monday + timedelta(days=i) for i in range(7)}
    dates_set = set(dates)
    streak_dates = [
        d.strftime("%Y-%m-%d")
        for d in sorted(current_week_dates & dates_set)
    ]

    # Count how many days watched this week
    weekly_watch_count = len(current_week_dates & dates_set)

    return BaseResponse(
        success=True,
        message="Streak data retrieved successfully",
        data=StreakData(
            current_streak=streak_result["current_streak"],
            longest_streak=streak_result["longest_streak"],
            streak_type=streak_type,
            streak_min_days=streak_min_days,
            last_watch_date=last_watch_date,
            is_active_today=is_active_today,
            streak_dates=streak_dates,
            current_streak_start=streak_result["current_streak_start"],
            current_streak_end=streak_result["current_streak_end"],
            longest_streak_start=streak_result["longest_streak_start"],
            longest_streak_end=streak_result["longest_streak_end"],
            weekly_watch_count=weekly_watch_count,
        )
    )


@router.get("/streak/dates", response_model=BaseResponse[StreakDates])
async def get_streak_dates(
    year: int = Query(default=None, description="Year"),
    month: int = Query(default=None, description="Month"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get list of dates the user watched movies in a given month.
    Used for streak calendar highlighting.
    """
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month

    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))

    results = (
        db.query(watch_day_expr.label("watch_day"))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
            extract("year", watch_day_expr) == year,
            extract("month", watch_day_expr) == month,
        )
        .distinct()
        .all()
    )

    date_strings = [
        row.watch_day.strftime("%Y-%m-%d") if hasattr(row.watch_day, "strftime") else str(row.watch_day)
        for row in results
        if row.watch_day is not None
    ]

    return BaseResponse(
        success=True,
        message="Streak dates retrieved successfully",
        data=StreakDates(year=year, month=month, dates=sorted(date_strings))
    )


class StreakSettingsUpdate(BaseModel):
    streak_type: Optional[str] = None
    streak_min_days: Optional[int] = None


@router.put("/streak/settings", response_model=BaseResponse[StreakData])
async def update_streak_settings(
    settings: StreakSettingsUpdate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Update streak settings (streak_type, streak_min_days) for the user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = settings.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)

    # Return updated streak data
    streak_type = user.streak_type or "daily"
    streak_min_days = user.streak_min_days or 1

    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))
    watch_dates = (
        db.query(watch_day_expr.label("watch_day"))
        .filter(UserMovie.user_id == user_id, UserMovie.status == "completed")
        .order_by(text("watch_day DESC"))
        .distinct()
        .all()
    )
    dates = [row[0] for row in watch_dates if row[0] is not None]
    today = date.today()
    last_watch_date = dates[0] if dates else None
    is_active_today = last_watch_date == today if last_watch_date else False
    streak_result = _calculate_streaks(dates, streak_type, streak_min_days)

    day_of_week = today.weekday()
    week_monday = today - timedelta(days=day_of_week)
    current_week_dates = {week_monday + timedelta(days=i) for i in range(7)}
    dates_set = set(dates)
    streak_dates = [d.strftime("%Y-%m-%d") for d in sorted(current_week_dates & dates_set)]
    weekly_watch_count = len(current_week_dates & dates_set)

    return BaseResponse(
        success=True,
        message="Streak settings updated",
        data=StreakData(
            current_streak=streak_result["current_streak"],
            longest_streak=streak_result["longest_streak"],
            streak_type=streak_type,
            streak_min_days=streak_min_days,
            last_watch_date=last_watch_date,
            is_active_today=is_active_today,
            streak_dates=streak_dates,
            current_streak_start=streak_result["current_streak_start"],
            current_streak_end=streak_result["current_streak_end"],
            longest_streak_start=streak_result["longest_streak_start"],
            longest_streak_end=streak_result["longest_streak_end"],
            weekly_watch_count=weekly_watch_count,
        )
    )


@router.get("/calendar", response_model=BaseResponse[CalendarMonth])
async def get_calendar(
    year: int = Query(default=None, description="Year"),
    month: int = Query(default=None, description="Month"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """
    Get calendar data for a specific year/month.
    Returns per-day movie counts and movie info with poster URLs.
    """
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month

    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))

    results = (
        db.query(
            watch_day_expr.label("watch_day"),
            UserMovie.movie_id,
            Movie.title_ko,
            Movie.poster_url,
        )
        .join(Movie, UserMovie.movie_id == Movie.id)
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
            extract("year", watch_day_expr) == year,
            extract("month", watch_day_expr) == month,
        )
        .order_by(text("watch_day ASC"))
        .all()
    )

    # Group by day
    day_map: dict = {}
    for row in results:
        d = row.watch_day
        date_str = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)
        if date_str not in day_map:
            day_map[date_str] = []
        day_map[date_str].append(
            CalendarMovieItem(id=row.movie_id, title=row.title_ko or "", poster_url=row.poster_url)
        )

    days = [
        CalendarDay(
            date=date_str,
            movie_count=len(movies),
            movies=movies,
        )
        for date_str, movies in sorted(day_map.items())
    ]

    return BaseResponse(
        success=True,
        message="Calendar data retrieved successfully",
        data=CalendarMonth(year=year, month=month, days=days)
    )


async def calculate_streak(db: Session, user_id: str) -> int:
    """
    Calculate current viewing streak (consecutive days)

    Args:
        db: Database session
        user_id: User ID

    Returns:
        Current streak in days
    """
    # watch_date가 비어있는 레거시 데이터는 created_at 날짜로 보정
    watch_day_expr = func.coalesce(UserMovie.watch_date, func.date(UserMovie.created_at))

    # Get all watch dates, sorted descending
    watch_dates = (
        db.query(watch_day_expr.label("watch_day"))
        .filter(
            UserMovie.user_id == user_id,
            UserMovie.status == "completed",
        )
        .order_by(text("watch_day DESC"))
        .distinct()
        .all()
    )

    if not watch_dates:
        return 0

    # Convert to list of dates
    dates = [row[0] for row in watch_dates if row[0] is not None]
    if not dates:
        return 0

    # Check if most recent date is today or yesterday
    today = date.today()
    if dates[0] not in [today, today - timedelta(days=1)]:
        return 0

    # Count consecutive days
    streak = 1
    for i in range(len(dates) - 1):
        diff = (dates[i] - dates[i + 1]).days
        if diff == 1:
            streak += 1
        elif diff == 0:
            # Same day, skip
            continue
        else:
            # Streak broken
            break

    return streak


def _calculate_streaks(dates: list, streak_type: str, streak_min_days: int) -> dict:
    """
    Calculate current and longest streaks based on streak_type.

    streak_type:
      - 'daily':  consecutive days watched
      - 'weekly': consecutive weeks with at least 1 day watched
      - 'custom': consecutive weeks with at least streak_min_days days watched

    Returns:
        dict with current_streak, longest_streak, and their start/end dates
    """
    result = {
        "current_streak": 0,
        "longest_streak": 0,
        "current_streak_start": None,
        "current_streak_end": None,
        "longest_streak_start": None,
        "longest_streak_end": None,
    }

    if not dates:
        return result

    today = date.today()

    if streak_type == "daily":
        # Consecutive days
        sorted_dates = sorted(set(dates), reverse=True)

        # Must have watched today or yesterday to have an active streak
        if sorted_dates[0] not in [today, today - timedelta(days=1)]:
            current = 0
            current_end = None
            current_start = None
        else:
            current = 1
            current_end = sorted_dates[0]
            current_start = sorted_dates[0]
            for i in range(len(sorted_dates) - 1):
                diff = (sorted_dates[i] - sorted_dates[i + 1]).days
                if diff == 1:
                    current += 1
                    current_start = sorted_dates[i + 1]
                elif diff == 0:
                    continue
                else:
                    break

        # Calculate longest streak
        longest = 0
        run = 1
        run_start = None
        longest_start = None
        longest_end = None
        sorted_asc = sorted(set(dates))
        if sorted_asc:
            run_start = sorted_asc[0]
        for i in range(1, len(sorted_asc)):
            diff = (sorted_asc[i] - sorted_asc[i - 1]).days
            if diff == 1:
                run += 1
            elif diff == 0:
                continue
            else:
                if run > longest:
                    longest = run
                    longest_start = run_start
                    longest_end = sorted_asc[i - 1]
                run = 1
                run_start = sorted_asc[i]
        if run > longest:
            longest = run
            longest_start = run_start
            longest_end = sorted_asc[-1] if sorted_asc else None

        result["current_streak"] = current
        result["longest_streak"] = longest
        result["current_streak_start"] = current_start
        result["current_streak_end"] = current_end
        result["longest_streak_start"] = longest_start
        result["longest_streak_end"] = longest_end
        return result

    else:
        # Weekly / custom: group dates by ISO week (year, week)
        def iso_week(d):
            iso = d.isocalendar()
            return (iso[0], iso[1])

        week_day_counts: dict = {}
        for d in dates:
            wk = iso_week(d)
            if wk not in week_day_counts:
                week_day_counts[wk] = set()
            week_day_counts[wk].add(d)

        min_days = streak_min_days if streak_type == "custom" else 1
        # Weeks that meet the threshold
        qualifying_weeks = sorted(
            [wk for wk, days in week_day_counts.items() if len(days) >= min_days],
            reverse=True,
        )

        if not qualifying_weeks:
            return result

        current_week = iso_week(today)
        last_week = (current_week[0], current_week[1] - 1) if current_week[1] > 1 else (current_week[0] - 1, 52)

        if qualifying_weeks[0] not in [current_week, last_week]:
            current = 0
            current_start_wk = None
            current_end_wk = None
        else:
            current = 1
            current_end_wk = qualifying_weeks[0]
            current_start_wk = qualifying_weeks[0]
            for i in range(len(qualifying_weeks) - 1):
                wk_curr = qualifying_weeks[i]
                wk_prev = qualifying_weeks[i + 1]
                d_curr = date.fromisocalendar(wk_curr[0], wk_curr[1], 1)
                d_prev = date.fromisocalendar(wk_prev[0], wk_prev[1], 1)
                if (d_curr - d_prev).days == 7:
                    current += 1
                    current_start_wk = wk_prev
                else:
                    break

        # Longest weekly streak
        longest = 0
        run = 1
        run_start_wk = None
        longest_start_wk = None
        longest_end_wk = None
        asc_weeks = sorted(qualifying_weeks)
        if asc_weeks:
            run_start_wk = asc_weeks[0]
        for i in range(1, len(asc_weeks)):
            wk_prev = asc_weeks[i - 1]
            wk_curr = asc_weeks[i]
            d_prev = date.fromisocalendar(wk_prev[0], wk_prev[1], 1)
            d_curr = date.fromisocalendar(wk_curr[0], wk_curr[1], 1)
            if (d_curr - d_prev).days == 7:
                run += 1
            else:
                if run > longest:
                    longest = run
                    longest_start_wk = run_start_wk
                    longest_end_wk = asc_weeks[i - 1]
                run = 1
                run_start_wk = wk_curr
        if run > longest:
            longest = run
            longest_start_wk = run_start_wk
            longest_end_wk = asc_weeks[-1] if asc_weeks else None

        # Convert ISO weeks to date ranges (Mon to Sun)
        def week_to_range(wk):
            if wk is None:
                return None, None
            monday = date.fromisocalendar(wk[0], wk[1], 1)
            sunday = date.fromisocalendar(wk[0], wk[1], 7)
            return monday, sunday

        cs, ce = week_to_range(current_start_wk) if current > 0 else (None, None)
        ls, le = week_to_range(longest_start_wk) if longest > 0 else (None, None)
        # For current streak end, use the Sunday of the end week
        _, ce2 = week_to_range(current_end_wk) if current > 0 else (None, None)
        # For longest streak end, use the Sunday of the end week
        _, le2 = week_to_range(longest_end_wk) if longest > 0 else (None, None)

        result["current_streak"] = current
        result["longest_streak"] = longest
        result["current_streak_start"] = cs if current > 0 else None
        result["current_streak_end"] = ce2 if current > 0 else None
        result["longest_streak_start"] = ls if longest > 0 else None
        result["longest_streak_end"] = le2 if longest > 0 else None
        return result
