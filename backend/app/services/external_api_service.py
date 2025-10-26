"""
외부 API 통합 서비스
KOBIS, TMDb, KMDb API를 사용하여 영화 메타데이터 검색
"""
import httpx
from typing import List, Optional, Any, Callable, TypeVar
from functools import wraps
from app.config import settings
from app.schemas.movie import MovieSearchResult, MovieMetadata
from app.services.redis_service import redis_service

# Type variable for generic return types
T = TypeVar('T')


def cache_external_api(prefix: str, ttl: int = 86400):
    """
    외부 API 호출 결과를 Redis에 캐싱하는 데코레이터

    Args:
        prefix: 캐시 키 prefix (예: "kobis:search", "tmdb:movie")
        ttl: 캐시 유효 기간 (초 단위, 기본값: 86400 = 24시간)

    Returns:
        데코레이터 함수

    Examples:
        @cache_external_api(prefix="kobis:search", ttl=86400)
        async def search_kobis(self, query: str) -> List[MovieSearchResult]:
            # API 호출 로직만 작성
            return results
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract cache key from function arguments
            # args[0] is 'self', args[1:] are actual parameters
            cache_key_parts = [str(arg) for arg in args[1:]] + [str(v) for v in kwargs.values()]
            cache_key = f"{prefix}:{':'.join(cache_key_parts)}"

            # Try to get from cache
            cached = await redis_service.get_json(cache_key)
            if cached:
                # Determine return type from function annotations
                return_type = func.__annotations__.get('return')

                # Handle List[Model] types
                if hasattr(return_type, '__origin__') and return_type.__origin__ is list:
                    model_class = return_type.__args__[0]
                    return [model_class(**item) for item in cached]

                # Handle Optional[Model] types
                elif hasattr(return_type, '__origin__'):
                    # Get the actual type from Optional (Union[T, None])
                    model_class = return_type.__args__[0]
                    return model_class(**cached)

                # Fallback: return as-is
                return cached

            # Call original function
            try:
                result = await func(*args, **kwargs)

                # Cache the result
                if result is not None:
                    # Handle List[Model] types
                    if isinstance(result, list):
                        cache_data = [r.model_dump() for r in result]
                    # Handle single Model types
                    else:
                        cache_data = result.model_dump()

                    await redis_service.set_json(cache_key, cache_data, ttl=ttl)

                return result

            except Exception as e:
                print(f"{func.__name__} error: {e}")
                # Return empty list for List return types, None for Optional
                return_type = func.__annotations__.get('return')
                if hasattr(return_type, '__origin__') and return_type.__origin__ is list:
                    return []
                return None

        return wrapper
    return decorator


def safe_int(value: Any, default: int = 0) -> int:
    """
    안전하게 정수로 변환

    Args:
        value: 변환할 값
        default: 변환 실패 시 기본값

    Returns:
        정수 값 또는 기본값
    """
    if value is None or value == "":
        return default

    # 이미 정수인 경우
    if isinstance(value, int):
        return value

    # 문자열인 경우
    if isinstance(value, str):
        # 숫자로만 구성되어 있는지 확인
        if value.isdigit():
            return int(value)
        # 음수 처리
        if value.startswith('-') and value[1:].isdigit():
            return int(value)

    # 변환 시도
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


class ExternalAPIService:
    """외부 API 통합 서비스"""

    async def search_movies(self, query: str) -> List[MovieSearchResult]:
        """
        여러 외부 API에서 영화 검색

        Args:
            query: 검색어

        Returns:
            영화 검색 결과 리스트
        """
        results = []

        # KOBIS에서 검색 (한국 영화)
        kobis_results = await self.search_kobis(query)
        results.extend(kobis_results)

        # TMDb에서 검색 (국제 영화)
        tmdb_results = await self.search_tmdb(query)
        results.extend(tmdb_results)

        # KMDb에서 검색 (한국 영화 추가 정보)
        kmdb_results = await self.search_kmdb(query)
        results.extend(kmdb_results)

        return results

    @cache_external_api(prefix="kobis:search", ttl=86400)
    async def search_kobis(self, query: str) -> List[MovieSearchResult]:
        """
        KOBIS API로 영화 검색 (한국영화진흥위원회)

        Args:
            query: 검색어

        Returns:
            영화 검색 결과 리스트
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "http://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json",
                params={
                    "key": settings.KOBIS_API_KEY,
                    "movieNm": query,
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            movies = data.get("movieListResult", {}).get("movieList", [])

            for movie in movies:
                # Get director
                directors = movie.get("directors", [])
                director = directors[0].get("peopleNm") if directors else "Unknown"

                result = MovieSearchResult(
                    title=movie.get("movieNm", ""),
                    original_title=movie.get("movieNmEn"),
                    director=director,
                    year=safe_int(movie.get("prdtYear")),
                    runtime=None,  # KOBIS doesn't provide runtime in search
                    genre=movie.get("repGenreNm"),
                    poster_url=None,  # KOBIS doesn't provide poster
                    synopsis=None,
                    kobis_code=movie.get("movieCd"),
                    tmdb_id=None,
                    kmdb_id=None,
                    source="kobis"
                )
                results.append(result)

            return results

    @cache_external_api(prefix="tmdb:search", ttl=86400)
    async def search_tmdb(self, query: str) -> List[MovieSearchResult]:
        """
        TMDb API로 영화 검색 (The Movie Database)

        Args:
            query: 검색어

        Returns:
            영화 검색 결과 리스트
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.themoviedb.org/3/search/movie",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "query": query,
                    "language": "ko-KR",
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            movies = data.get("results", [])

            for movie in movies:
                # Get release year
                release_date = movie.get("release_date", "")
                year = safe_int(release_date[:4]) if (release_date and len(release_date) >= 4) else 0

                # Get poster URL
                poster_path = movie.get("poster_path")
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None

                result = MovieSearchResult(
                    title=movie.get("title", ""),
                    original_title=movie.get("original_title"),
                    director="Unknown",  # TMDb search doesn't include director
                    year=year,
                    runtime=None,  # Need to fetch details for runtime
                    genre=None,  # Genre requires separate API call
                    poster_url=poster_url,
                    synopsis=movie.get("overview"),
                    kobis_code=None,
                    tmdb_id=movie.get("id"),
                    kmdb_id=None,
                    source="tmdb"
                )
                results.append(result)

            return results

    @cache_external_api(prefix="kmdb:search", ttl=86400)
    async def search_kmdb(self, query: str) -> List[MovieSearchResult]:
        """
        KMDb API로 영화 검색 (한국영화데이터베이스)

        Args:
            query: 검색어

        Returns:
            영화 검색 결과 리스트
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp",
                params={
                    "collection": "kmdb_new2",
                    "ServiceKey": settings.KMDB_API_KEY,
                    "title": query,
                    "listCount": 10,
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            movies = data.get("Data", [{}])[0].get("Result", [])

            for movie in movies:
                # Get director
                directors = movie.get("directors", {}).get("director", [])
                director = directors[0].get("directorNm") if directors else "Unknown"

                # Get year
                year_str = movie.get("prodYear", "0")
                year = int(year_str) if year_str.isdigit() else 0

                # Get runtime
                runtime_str = movie.get("runtime", "0")
                runtime = int(runtime_str) if runtime_str.isdigit() else None

                # Get poster
                posters = movie.get("posters", "").split("|")
                poster_url = posters[0] if posters and posters[0] else None

                # Get genre
                genre = movie.get("genre", "")

                result = MovieSearchResult(
                    title=movie.get("title", "").replace("!HS", "").replace("!HE", ""),
                    original_title=movie.get("titleEng"),
                    director=director,
                    year=year,
                    runtime=runtime,
                    genre=genre,
                    poster_url=poster_url,
                    synopsis=movie.get("plots", {}).get("plot", [{}])[0].get("plotText") if movie.get("plots") else None,
                    kobis_code=None,
                    tmdb_id=None,
                    kmdb_id=movie.get("DOCID"),
                    source="kmdb"
                )
                results.append(result)

            return results

    async def get_movie_metadata(self, kobis_code: Optional[str] = None, tmdb_id: Optional[int] = None) -> Optional[MovieMetadata]:
        """
        영화 상세 메타데이터 가져오기

        Args:
            kobis_code: KOBIS 영화 코드
            tmdb_id: TMDb 영화 ID

        Returns:
            영화 메타데이터
        """
        if tmdb_id:
            return await self.get_tmdb_metadata(tmdb_id)
        elif kobis_code:
            return await self.get_kobis_metadata(kobis_code)
        return None

    @cache_external_api(prefix="tmdb:movie", ttl=86400)
    async def get_tmdb_metadata(self, tmdb_id: int) -> Optional[MovieMetadata]:
        """
        TMDb에서 영화 상세 정보 가져오기

        Args:
            tmdb_id: TMDb 영화 ID

        Returns:
            영화 메타데이터
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "language": "ko-KR",
                    "append_to_response": "credits"
                }
            )
            response.raise_for_status()
            movie = response.json()

            # Get director from credits
            credits = movie.get("credits", {})
            crew = credits.get("crew", [])
            directors = [c for c in crew if c.get("job") == "Director"]
            director = directors[0].get("name") if directors else "Unknown"

            # Get release year
            release_date = movie.get("release_date", "")
            year = int(release_date[:4]) if release_date else 0

            # Get poster and backdrop URLs
            poster_path = movie.get("poster_path")
            poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None

            backdrop_path = movie.get("backdrop_path")
            backdrop_url = f"https://image.tmdb.org/t/p/original{backdrop_path}" if backdrop_path else None

            # Get genres
            genres = movie.get("genres", [])
            genre = ", ".join([g.get("name") for g in genres])

            metadata = MovieMetadata(
                title=movie.get("title", ""),
                original_title=movie.get("original_title"),
                director=director,
                year=year,
                runtime=movie.get("runtime", 0),
                genre=genre,
                poster_url=poster_url,
                backdrop_url=backdrop_url,
                synopsis=movie.get("overview"),
                kobis_code=None,
                tmdb_id=tmdb_id,
                kmdb_id=None
            )

            return metadata

    @cache_external_api(prefix="kobis:movie", ttl=86400)
    async def get_kobis_metadata(self, kobis_code: str) -> Optional[MovieMetadata]:
        """
        KOBIS에서 영화 상세 정보 가져오기

        Args:
            kobis_code: KOBIS 영화 코드

        Returns:
            영화 메타데이터
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "http://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieInfo.json",
                params={
                    "key": settings.KOBIS_API_KEY,
                    "movieCd": kobis_code,
                }
            )
            response.raise_for_status()
            data = response.json()

            movie = data.get("movieInfoResult", {}).get("movieInfo", {})

            # Get director
            directors = movie.get("directors", [])
            director = directors[0].get("peopleNm") if directors else "Unknown"

            # Get year
            year_str = movie.get("prdtYear", "0")
            year = int(year_str) if year_str else 0

            # Get runtime
            runtime_str = movie.get("showTm", "0")
            runtime = int(runtime_str) if runtime_str else 0

            # Get genres
            genres = movie.get("genres", [])
            genre = ", ".join([g.get("genreNm") for g in genres])

            metadata = MovieMetadata(
                title=movie.get("movieNm", ""),
                original_title=movie.get("movieNmEn"),
                director=director,
                year=year,
                runtime=runtime,
                genre=genre,
                poster_url=None,  # KOBIS doesn't provide poster
                backdrop_url=None,
                synopsis=None,  # KOBIS doesn't provide synopsis
                kobis_code=kobis_code,
                tmdb_id=None,
                kmdb_id=None
            )

            return metadata


# Singleton instance
external_api_service = ExternalAPIService()
