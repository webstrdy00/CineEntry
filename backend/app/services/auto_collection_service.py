"""
Auto Collection Service
자동 컬렉션 동기화 로직
"""
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Dict, Any, List
from datetime import datetime

from app.models.collection import Collection
from app.models.collection_movie import CollectionMovie
from app.models.user_movie import UserMovie
from app.models.movie import Movie


# 회원가입 시 자동 생성되는 기본 컬렉션 정의
DEFAULT_AUTO_COLLECTIONS = [
    {
        "name": "올해 본 영화",
        "description": "올해 관람 완료한 영화",
        "auto_rules": {
            "status": "completed",
            "watch_date": {"min": f"{datetime.now().year}-01-01", "max": f"{datetime.now().year}-12-31"},
        },
    },
    {
        "name": "별점 4점 이상",
        "description": "높게 평가한 영화 모음",
        "auto_rules": {
            "status": "completed",
            "rating": {"min": 4.0},
        },
    },
    {
        "name": "인생 영화",
        "description": "인생 영화로 선택한 작품들",
        "auto_rules": {
            "is_best_movie": True,
        },
    },
    {
        "name": "보고 싶은 영화",
        "description": "보고 싶은 영화 목록",
        "auto_rules": {
            "status": "watchlist",
        },
    },
]


class AutoCollectionService:
    """자동 컬렉션 서비스 클래스"""

    @staticmethod
    def create_default_collections(user_id: str, db: Session) -> List[Collection]:
        """
        신규 사용자에게 기본 자동 컬렉션 생성

        Args:
            user_id: 사용자 ID
            db: DB 세션

        Returns:
            생성된 컬렉션 목록
        """
        # 이미 자동 컬렉션이 있으면 스킵
        existing = db.query(Collection).filter(
            Collection.user_id == user_id,
            Collection.is_auto == True
        ).count()

        if existing > 0:
            return []

        created = []
        for config in DEFAULT_AUTO_COLLECTIONS:
            # 올해 날짜를 동적으로 생성
            rules = config["auto_rules"].copy()
            if "watch_date" in rules:
                year = datetime.now().year
                rules["watch_date"] = {"min": f"{year}-01-01", "max": f"{year}-12-31"}

            collection = Collection(
                user_id=user_id,
                name=config["name"],
                description=config["description"],
                is_auto=True,
                auto_rules=rules,
            )
            db.add(collection)
            created.append(collection)

        db.commit()
        for c in created:
            db.refresh(c)

        return created

    @staticmethod
    def sync_all_for_user(user_id: str, db: Session) -> None:
        """
        사용자의 모든 자동 컬렉션을 동기화

        영화 추가/수정/삭제 후 호출하여 자동 컬렉션을 최신 상태로 유지

        Args:
            user_id: 사용자 ID
            db: DB 세션
        """
        auto_collections = db.query(Collection).filter(
            Collection.user_id == user_id,
            Collection.is_auto == True,
            Collection.auto_rules.isnot(None),
        ).all()

        for collection in auto_collections:
            try:
                AutoCollectionService.sync_auto_collection(collection.id, db)
            except Exception:
                # 개별 컬렉션 동기화 실패 시 나머지는 계속 진행
                pass

    @staticmethod
    def sync_auto_collection(collection_id: int, db: Session) -> Dict[str, Any]:
        """
        자동 컬렉션 동기화

        auto_rules JSON 형식:
        {
            "status": "completed",
            "rating": {"min": 4.0, "max": 5.0},
            "year": {"min": 2020, "max": 2024},
            "genre": "드라마",
            "is_best_movie": true
        }

        Args:
            collection_id: 컬렉션 ID
            db: DB 세션

        Returns:
            {
                "added_count": 추가된 영화 수,
                "removed_count": 제거된 영화 수,
                "total_count": 최종 영화 수
            }
        """
        # 컬렉션 조회
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise ValueError(f"Collection not found: {collection_id}")

        if not collection.is_auto:
            raise ValueError(f"Collection is not auto: {collection_id}")

        if not collection.auto_rules:
            raise ValueError(f"Collection auto_rules is empty: {collection_id}")

        # 규칙에 맞는 영화 찾기
        matching_movies = AutoCollectionService._find_matching_movies(
            user_id=collection.user_id,
            rules=collection.auto_rules,
            db=db
        )

        matching_movie_ids = {um.id for um in matching_movies}

        # 현재 컬렉션의 영화 목록
        current_movies = db.query(CollectionMovie).filter(
            CollectionMovie.collection_id == collection_id
        ).all()

        current_movie_ids = {cm.user_movie_id for cm in current_movies}

        # 추가할 영화 (규칙에 맞지만 컬렉션에 없음)
        to_add = matching_movie_ids - current_movie_ids

        # 제거할 영화 (컬렉션에 있지만 규칙에 안 맞음)
        to_remove = current_movie_ids - matching_movie_ids

        # 영화 추가
        for user_movie_id in to_add:
            new_cm = CollectionMovie(
                collection_id=collection_id,
                user_movie_id=user_movie_id
            )
            db.add(new_cm)

        # 영화 제거
        if to_remove:
            db.query(CollectionMovie).filter(
                and_(
                    CollectionMovie.collection_id == collection_id,
                    CollectionMovie.user_movie_id.in_(to_remove)
                )
            ).delete(synchronize_session=False)

        db.commit()

        # 최종 개수
        final_count = len(matching_movie_ids)

        return {
            "added_count": len(to_add),
            "removed_count": len(to_remove),
            "total_count": final_count
        }

    @staticmethod
    def _find_matching_movies(
        user_id: str,
        rules: Dict[str, Any],
        db: Session
    ) -> List[UserMovie]:
        """
        규칙에 맞는 영화 찾기

        Args:
            user_id: 사용자 ID
            rules: auto_rules JSON
            db: DB 세션

        Returns:
            List[UserMovie]: 규칙에 맞는 영화 목록
        """
        query = db.query(UserMovie).join(Movie, UserMovie.movie_id == Movie.id)
        query = query.filter(UserMovie.user_id == user_id)

        # 1. status 필터
        if "status" in rules:
            if rules["status"] in ("watchlist", "wishlist"):
                query = query.filter(UserMovie.status.in_(["watchlist", "wishlist"]))
            else:
                query = query.filter(UserMovie.status == rules["status"])

        # 2. rating 필터 (min, max)
        if "rating" in rules:
            rating_rule = rules["rating"]
            if isinstance(rating_rule, dict):
                if "min" in rating_rule:
                    query = query.filter(UserMovie.rating >= rating_rule["min"])
                if "max" in rating_rule:
                    query = query.filter(UserMovie.rating <= rating_rule["max"])
            else:
                # 정확히 일치
                query = query.filter(UserMovie.rating == rating_rule)

        # 3. year 필터 (min, max) - Movie.production_year
        if "year" in rules:
            year_rule = rules["year"]
            if isinstance(year_rule, dict):
                if "min" in year_rule:
                    query = query.filter(Movie.production_year >= year_rule["min"])
                if "max" in year_rule:
                    query = query.filter(Movie.production_year <= year_rule["max"])
            else:
                # 정확히 일치
                query = query.filter(Movie.production_year == year_rule)

        # 4. genre 필터 (쉼표 구분 문자열 검색)
        if "genre" in rules:
            genre = rules["genre"]
            query = query.filter(Movie.genre.contains(genre))

        # 5. director 필터 (쉼표 구분 문자열 검색)
        if "director" in rules:
            director = rules["director"]
            query = query.filter(Movie.director.contains(director))

        # 6. is_best_movie 필터
        if "is_best_movie" in rules:
            query = query.filter(UserMovie.is_best_movie == rules["is_best_movie"])

        # 7. watch_date 필터 (min, max)
        if "watch_date" in rules:
            watch_date_rule = rules["watch_date"]
            if isinstance(watch_date_rule, dict):
                if "min" in watch_date_rule:
                    min_date = datetime.fromisoformat(watch_date_rule["min"]).date()
                    query = query.filter(UserMovie.watch_date >= min_date)
                if "max" in watch_date_rule:
                    max_date = datetime.fromisoformat(watch_date_rule["max"]).date()
                    query = query.filter(UserMovie.watch_date <= max_date)

        return query.all()

    @staticmethod
    def validate_auto_rule(rules: Dict[str, Any]) -> bool:
        """
        auto_rules 검증

        Args:
            rules: auto_rules JSON

        Returns:
            bool: 유효 여부

        Raises:
            ValueError: 규칙이 유효하지 않을 경우
        """
        if not isinstance(rules, dict):
            raise ValueError("auto_rules must be a dict")

        if not rules:
            raise ValueError("auto_rules cannot be empty")

        # 허용된 필드 목록
        allowed_fields = [
            "status", "rating", "year", "genre", "director",
            "is_best_movie", "watch_date"
        ]

        # 필드 검증
        for field in rules.keys():
            if field not in allowed_fields:
                raise ValueError(f"Invalid field in auto_rules: {field}")

        # status 검증
        if "status" in rules:
            allowed_status = ["watchlist", "wishlist", "watching", "completed"]
            if rules["status"] not in allowed_status:
                raise ValueError(f"Invalid status: {rules['status']}")

        # rating 검증
        if "rating" in rules:
            rating = rules["rating"]
            if isinstance(rating, dict):
                if "min" in rating and not (0 <= rating["min"] <= 5):
                    raise ValueError("rating.min must be between 0 and 5")
                if "max" in rating and not (0 <= rating["max"] <= 5):
                    raise ValueError("rating.max must be between 0 and 5")
            elif not (0 <= rating <= 5):
                raise ValueError("rating must be between 0 and 5")

        # year 검증
        if "year" in rules:
            year = rules["year"]
            if isinstance(year, dict):
                if "min" in year and not (1900 <= year["min"] <= 2100):
                    raise ValueError("year.min must be between 1900 and 2100")
                if "max" in year and not (1900 <= year["max"] <= 2100):
                    raise ValueError("year.max must be between 1900 and 2100")
            elif not (1900 <= year <= 2100):
                raise ValueError("year must be between 1900 and 2100")

        # is_best_movie 검증
        if "is_best_movie" in rules:
            if not isinstance(rules["is_best_movie"], bool):
                raise ValueError("is_best_movie must be a boolean")

        return True


# Global service instance
auto_collection_service = AutoCollectionService()
