"""
외부 API 통합 서비스
KOBIS, TMDb, KMDb API를 사용하여 영화 메타데이터 검색
"""
import asyncio
import httpx
import re
from typing import List, Optional, Any, Callable, TypeVar, Dict, Set, Tuple
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

    SEARCH_MERGE_FIELDS = (
        "title",
        "original_title",
        "director",
        "year",
        "runtime",
        "genre",
        "poster_url",
        "backdrop_url",
        "synopsis",
        "kobis_code",
        "tmdb_id",
        "kmdb_id",
    )
    SEARCH_FIELD_PRIORITIES = {
        "title": {"kobis": 4, "kmdb": 3, "tmdb": 2, "search": 1},
        "original_title": {"tmdb": 4, "kmdb": 3, "kobis": 2, "search": 1},
        "director": {"kobis": 4, "kmdb": 3, "tmdb": 2, "search": 1},
        "year": {"kobis": 4, "tmdb": 3, "kmdb": 2, "search": 1},
        "runtime": {"tmdb": 4, "kmdb": 3, "kobis": 2, "search": 1},
        "genre": {"kobis": 4, "kmdb": 3, "tmdb": 2, "search": 1},
        "poster_url": {"tmdb": 5, "kmdb": 4, "kobis": 1, "search": 1},
        "backdrop_url": {"tmdb": 5, "kmdb": 1, "kobis": 1, "search": 1},
        "synopsis": {"tmdb": 5, "kmdb": 4, "kobis": 1, "search": 1},
        "kobis_code": {"kobis": 5, "search": 1},
        "tmdb_id": {"tmdb": 5, "search": 1},
        "kmdb_id": {"kmdb": 5, "search": 1},
    }
    METADATA_FIELD_PRIORITIES = {
        "title": {"kobis": 5, "kmdb": 4, "tmdb": 3, "search": 1},
        "original_title": {"tmdb": 5, "kmdb": 4, "kobis": 3, "search": 1},
        "director": {"kobis": 5, "kmdb": 4, "tmdb": 3, "search": 1},
        "year": {"kobis": 5, "tmdb": 4, "kmdb": 3, "search": 1},
        "runtime": {"tmdb": 5, "kmdb": 4, "kobis": 3, "search": 1},
        "genre": {"kobis": 5, "kmdb": 4, "tmdb": 3, "search": 1},
        "poster_url": {"tmdb": 5, "kmdb": 4, "search": 1},
        "backdrop_url": {"tmdb": 5, "search": 1},
        "synopsis": {"tmdb": 5, "kmdb": 4, "search": 1},
        "kobis_code": {"kobis": 5, "search": 1},
        "tmdb_id": {"tmdb": 5, "search": 1},
        "kmdb_id": {"kmdb": 5, "search": 1},
    }

    @staticmethod
    def _normalize_text(value: Optional[str]) -> str:
        """검색 비교를 위한 텍스트 정규화."""
        if not value:
            return ""
        lowered = value.lower().strip()
        # 공백/특수문자 노이즈 제거
        return re.sub(r"[\s\W_]+", "", lowered)

    @staticmethod
    def _split_query_terms(value: Optional[str]) -> List[str]:
        """사용자 입력 검색어를 공백 기준으로 분리."""
        if not value:
            return []
        return [term for term in re.split(r"\s+", value.strip()) if term]

    @staticmethod
    def _is_year_token(token: str) -> bool:
        """연도 토큰 여부 확인."""
        return token.isdigit() and len(token) == 4 and 1888 <= int(token) <= 2100

    def _parse_query(self, query: str) -> Tuple[str, List[str], Optional[int], str]:
        """
        검색어를 점수화용 토큰과 API 검색용 문자열로 분리한다.

        - API 검색은 제목 위주로 동작하므로 4자리 연도는 제거한다.
        - 점수화는 숫자/불필요 토큰을 줄여 제목 관련도 중심으로 계산한다.
        """
        raw_terms = self._split_query_terms(query)
        query_year: Optional[int] = None
        api_terms: List[str] = []
        relevance_tokens: List[str] = []

        for term in raw_terms:
            normalized_term = self._normalize_text(term)
            if not normalized_term:
                continue

            if self._is_year_token(normalized_term):
                if query_year is None:
                    query_year = int(normalized_term)
                continue

            api_terms.append(term)

            # 단일 ASCII 문자/숫자 토큰은 노이즈가 많아 점수화에서 제외한다.
            if normalized_term.isdigit():
                continue
            if normalized_term.isascii() and len(normalized_term) == 1:
                continue
            relevance_tokens.append(normalized_term)

        api_query = " ".join(api_terms).strip() or query.strip()
        query_key = "".join(relevance_tokens) or self._normalize_text(api_query)

        return query_key, relevance_tokens, query_year, api_query

    @staticmethod
    def _count_token_matches(tokens: List[str], *candidates: str) -> int:
        """토큰이 결과 텍스트에 포함되는 개수를 계산."""
        normalized_candidates = [candidate for candidate in candidates if candidate]
        if not tokens or not normalized_candidates:
            return 0

        matched_count = 0
        for token in tokens:
            if any(token in candidate for candidate in normalized_candidates):
                matched_count += 1

        return matched_count

    @staticmethod
    def _minimum_relevance_score(token_count: int) -> int:
        """검색어 길이에 따라 필요한 최소 관련도 점수."""
        return 40 if token_count >= 2 else 20

    @staticmethod
    def _has_meaningful_value(field_name: str, value: Any) -> bool:
        """필드 타입에 맞게 값 유효성 판단."""
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if field_name in ("year", "runtime"):
            return isinstance(value, int) and value > 0
        return True

    @staticmethod
    def _field_priority(field_priorities: dict, field_name: str, source: str) -> int:
        """필드별 source 우선순위 조회."""
        return field_priorities.get(field_name, {}).get(source, 0)

    def _should_replace_field_value(
        self,
        field_name: str,
        current_value: Any,
        current_source: str,
        candidate_value: Any,
        candidate_source: str,
        field_priorities: dict,
    ) -> bool:
        """후보 값으로 교체할지 판단."""
        if not self._has_meaningful_value(field_name, candidate_value):
            return False
        if not self._has_meaningful_value(field_name, current_value):
            return True

        current_priority = self._field_priority(field_priorities, field_name, current_source)
        candidate_priority = self._field_priority(field_priorities, field_name, candidate_source)

        if candidate_priority != current_priority:
            return candidate_priority > current_priority

        if isinstance(candidate_value, str) and isinstance(current_value, str):
            return len(candidate_value.strip()) > len(current_value.strip())

        return False

    def _build_result_keys(self, result: MovieSearchResult) -> Set[str]:
        """중복 병합용 식별 키 생성."""
        keys: Set[str] = set()
        year_key = str(result.year) if result.year and result.year > 0 else "0"

        for text in (result.title, result.original_title):
            normalized_text = self._normalize_text(text)
            if normalized_text:
                keys.add(f"title:{normalized_text}:{year_key}")

        if result.tmdb_id is not None:
            keys.add(f"tmdb:{result.tmdb_id}")
        if result.kobis_code:
            keys.add(f"kobis:{result.kobis_code}")
        if result.kmdb_id:
            keys.add(f"kmdb:{result.kmdb_id}")

        return keys

    def _result_aliases(self, result: MovieSearchResult) -> Set[str]:
        """제목/원제 기반 비교용 alias 집합."""
        aliases: Set[str] = set()
        for text in (result.title, result.original_title):
            normalized_text = self._normalize_text(text)
            if normalized_text:
                aliases.add(normalized_text)
        return aliases

    @staticmethod
    def _years_are_compatible(first_year: int, second_year: int) -> bool:
        """한쪽 연도가 비어 있거나 같으면 동일 작품으로 간주한다."""
        normalized_first = first_year if first_year and first_year > 0 else None
        normalized_second = second_year if second_year and second_year > 0 else None

        if normalized_first is None or normalized_second is None:
            return True

        return normalized_first == normalized_second

    def _results_are_likely_same_movie(
        self,
        first_result: MovieSearchResult,
        second_result: MovieSearchResult,
    ) -> bool:
        """직접 키가 없어도 제목 alias와 연도로 동일 영화 여부를 추정한다."""
        if not self._years_are_compatible(first_result.year, second_result.year):
            return False

        return bool(self._result_aliases(first_result) & self._result_aliases(second_result))

    def _create_search_bucket(self, result: MovieSearchResult, score: int, keys: Set[str]) -> Dict[str, Any]:
        """병합용 검색 버킷 생성."""
        bucket_result = MovieSearchResult(**result.model_dump())
        field_sources = {
            field: bucket_result.source
            for field in self.SEARCH_MERGE_FIELDS
            if self._has_meaningful_value(field, getattr(bucket_result, field))
        }
        return {
            "result": bucket_result,
            "field_sources": field_sources,
            "score": score,
            "keys": set(keys),
        }

    def _merge_result_into_bucket(
        self,
        bucket: dict,
        candidate_result: MovieSearchResult,
        candidate_score: int,
        candidate_field_sources: Optional[Dict[str, str]] = None,
    ) -> None:
        """검색 결과 하나를 병합 버킷에 반영."""
        bucket_result: MovieSearchResult = bucket["result"]
        bucket_field_sources: Dict[str, str] = bucket["field_sources"]
        candidate_field_sources = candidate_field_sources or {}

        for field_name in self.SEARCH_MERGE_FIELDS:
            current_value = getattr(bucket_result, field_name)
            candidate_value = getattr(candidate_result, field_name)
            current_source = bucket_field_sources.get(field_name, bucket_result.source)
            candidate_source = candidate_field_sources.get(field_name, candidate_result.source)

            if self._should_replace_field_value(
                field_name,
                current_value,
                current_source,
                candidate_value,
                candidate_source,
                self.SEARCH_FIELD_PRIORITIES,
            ):
                setattr(bucket_result, field_name, candidate_value)
                bucket_field_sources[field_name] = candidate_source

        # 외부 ID는 중복 병합을 위해 가능한 한 모두 보존한다.
        if candidate_result.kobis_code and not bucket_result.kobis_code:
            bucket_result.kobis_code = candidate_result.kobis_code
            bucket_field_sources["kobis_code"] = candidate_field_sources.get("kobis_code", candidate_result.source)
        if candidate_result.tmdb_id is not None and bucket_result.tmdb_id is None:
            bucket_result.tmdb_id = candidate_result.tmdb_id
            bucket_field_sources["tmdb_id"] = candidate_field_sources.get("tmdb_id", candidate_result.source)
        if candidate_result.kmdb_id and not bucket_result.kmdb_id:
            bucket_result.kmdb_id = candidate_result.kmdb_id
            bucket_field_sources["kmdb_id"] = candidate_field_sources.get("kmdb_id", candidate_result.source)

        if candidate_score > bucket["score"] or (
            candidate_score == bucket["score"] and not bucket_result.poster_url and candidate_result.poster_url
        ):
            bucket["score"] = candidate_score
            bucket_result.source = candidate_result.source

        bucket["keys"].update(self._build_result_keys(candidate_result))

    def _merge_metadata_candidates(self, candidates: List[Tuple[str, MovieMetadata]]) -> MovieMetadata:
        """여러 소스의 메타데이터를 필드별 우선순위에 따라 합친다."""
        merged = MovieMetadata(title="")
        field_sources: Dict[str, str] = {}

        for candidate_source, candidate_metadata in candidates:
            for field_name in self.SEARCH_MERGE_FIELDS:
                current_value = getattr(merged, field_name)
                candidate_value = getattr(candidate_metadata, field_name)
                current_source = field_sources.get(field_name, "search")

                if self._should_replace_field_value(
                    field_name,
                    current_value,
                    current_source,
                    candidate_value,
                    candidate_source,
                    self.METADATA_FIELD_PRIORITIES,
                ):
                    setattr(merged, field_name, candidate_value)
                    field_sources[field_name] = candidate_source

        if not merged.title and candidates:
            merged.title = candidates[0][1].title

        return merged

    def _search_result_to_metadata(self, result: MovieSearchResult) -> MovieMetadata:
        """검색 결과를 메타데이터 구조로 변환."""
        return MovieMetadata(
            title=result.title,
            original_title=result.original_title,
            director=result.director,
            year=result.year,
            runtime=result.runtime,
            genre=result.genre,
            poster_url=result.poster_url,
            backdrop_url=result.backdrop_url,
            synopsis=result.synopsis,
            kobis_code=result.kobis_code,
            tmdb_id=result.tmdb_id,
            kmdb_id=result.kmdb_id,
        )

    async def build_canonical_metadata_from_search_result(self, result: MovieSearchResult) -> MovieMetadata:
        """검색 결과 1개를 저장용 canonical metadata로 재조합."""
        candidates: List[Tuple[str, MovieMetadata]] = [("search", self._search_result_to_metadata(result))]
        detail_sources: List[str] = []
        detail_tasks = []

        if result.tmdb_id is not None:
            detail_sources.append("tmdb")
            detail_tasks.append(self.get_tmdb_metadata(result.tmdb_id))
        if result.kobis_code:
            detail_sources.append("kobis")
            detail_tasks.append(self.get_kobis_metadata(result.kobis_code))

        if detail_tasks:
            detail_results = await asyncio.gather(*detail_tasks, return_exceptions=True)
            for source, detail_result in zip(detail_sources, detail_results):
                if isinstance(detail_result, Exception):
                    print(f"[metadata] {source} 상세 병합 실패: {detail_result}")
                    continue
                if detail_result:
                    candidates.append((source, detail_result))

        return self._merge_metadata_candidates(candidates)

    def _score_result(self, query: str, result: MovieSearchResult) -> Optional[int]:
        """검색어 대비 결과 관련도 점수 계산."""
        q, query_tokens, query_year, _ = self._parse_query(query)
        title = self._normalize_text(result.title)
        original_title = self._normalize_text(result.original_title)
        director = self._normalize_text(result.director)
        title_candidates = [candidate for candidate in (title, original_title) if candidate]

        exact_title_match = bool(q) and any(candidate == q for candidate in title_candidates)
        prefix_title_match = bool(q) and any(candidate.startswith(q) for candidate in title_candidates)
        contains_title_match = bool(q) and any(q in candidate for candidate in title_candidates)

        title_token_hits = self._count_token_matches(query_tokens, title, original_title)
        director_token_hits = self._count_token_matches(query_tokens, director)
        has_lexical_match = (
            exact_title_match
            or prefix_title_match
            or contains_title_match
            or title_token_hits > 0
            or director_token_hits > 0
        )

        if not has_lexical_match:
            return None

        score = 0

        if exact_title_match:
            score += 180
        elif prefix_title_match:
            score += 130
        elif contains_title_match:
            score += 90

        if query_tokens:
            if len(query_tokens) > 1 and title_token_hits == len(query_tokens):
                score += 70
            score += title_token_hits * 28

            if director_token_hits == len(query_tokens):
                score += 50
            else:
                score += director_token_hits * 16

            # 다중 토큰 검색에서 일부만 맞는 결과는 과감하게 낮춘다.
            if len(query_tokens) >= 2:
                missing_title_tokens = len(query_tokens) - title_token_hits
                if 0 < missing_title_tokens < len(query_tokens):
                    score -= missing_title_tokens * 18
                if title_token_hits == 0 and director_token_hits > 0:
                    score -= 18

        if query_year:
            if result.year == query_year:
                score += 26
            elif result.year and abs(result.year - query_year) == 1:
                score += 8
            elif result.year:
                score -= 24

        # 품질 보정
        if result.poster_url:
            score += 6
        if result.synopsis:
            score += 3
        if result.year and result.year > 0:
            score += 2
        if result.director:
            score += 2

        # 데이터 소스 신뢰도 가중치(동점 시 정렬 안정화 목적)
        source_weight = {
            "tmdb": 3,
            "kobis": 2,
            "kmdb": 1,
        }
        score += source_weight.get(result.source, 0)

        if score < self._minimum_relevance_score(len(query_tokens)):
            return None

        return score

    def _rank_and_dedupe(self, query: str, results: List[MovieSearchResult]) -> List[MovieSearchResult]:
        """결과 정렬 및 중복 제거."""
        if not results:
            return []

        buckets: List[dict] = []

        for result in results:
            score = self._score_result(query, result)
            if score is None:
                continue

            result_keys = self._build_result_keys(result)
            matching_indexes = [
                index for index, bucket in enumerate(buckets) if result_keys & bucket["keys"]
            ]

            if not matching_indexes:
                matching_indexes = [
                    index
                    for index, bucket in enumerate(buckets)
                    if self._results_are_likely_same_movie(bucket["result"], result)
                ]

            if not matching_indexes:
                buckets.append(self._create_search_bucket(result, score, result_keys))
                continue

            primary_index = matching_indexes[0]
            primary_bucket = buckets[primary_index]

            for index in reversed(matching_indexes[1:]):
                candidate_bucket = buckets.pop(index)
                self._merge_result_into_bucket(
                    primary_bucket,
                    candidate_bucket["result"],
                    candidate_bucket["score"],
                    candidate_bucket["field_sources"],
                )
                primary_bucket["keys"].update(candidate_bucket["keys"])

            self._merge_result_into_bucket(primary_bucket, result, score)

        ranked = sorted(
            [(bucket["score"], bucket["result"]) for bucket in buckets],
            key=lambda item: (
                item[0],
                1 if item[1].poster_url else 0,
                1 if item[1].synopsis else 0,
                item[1].year if item[1].year else 0,
            ),
            reverse=True,
        )

        # 너무 긴 목록은 상위 결과만 반환
        return [item[1] for item in ranked[:20]]

    async def search_movies(self, query: str) -> List[MovieSearchResult]:
        """
        여러 외부 API에서 영화 검색

        Args:
            query: 검색어

        Returns:
            영화 검색 결과 리스트
        """
        normalized_query = query.strip()
        if not normalized_query:
            return []

        _, _, _, api_query = self._parse_query(normalized_query)
        if not api_query:
            return []

        results: List[MovieSearchResult] = []

        # KOBIS에서 검색 (한국 영화)
        try:
            kobis_results = await self.search_kobis(api_query)
            results.extend(kobis_results)
        except Exception as e:
            print(f"[search] KOBIS 검색 실패: {e}")

        # TMDb에서 검색 (국제 영화)
        try:
            tmdb_results = await self.search_tmdb(api_query)
            results.extend(tmdb_results)
        except Exception as e:
            print(f"[search] TMDb 검색 실패: {e}")

        # KMDb에서 검색 (한국 영화 추가 정보) - 키가 있을 때만
        if settings.KMDB_API_KEY and settings.KMDB_API_KEY != "your_kmdb_api_key_here":
            try:
                kmdb_results = await self.search_kmdb(api_query)
                results.extend(kmdb_results)
            except Exception as e:
                print(f"[search] KMDb 검색 실패: {e}")
        else:
            print("[search] KMDb API 키가 없어 KMDb 검색을 건너뜁니다.")

        return self._rank_and_dedupe(normalized_query, results)

    @cache_external_api(prefix="kobis:search:v2", ttl=86400)
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
                director = directors[0].get("peopleNm") if directors else None

                result = MovieSearchResult(
                    title=movie.get("movieNm", ""),
                    original_title=movie.get("movieNmEn"),
                    director=director,
                    year=safe_int(movie.get("prdtYear")),
                    runtime=None,  # KOBIS doesn't provide runtime in search
                    genre=movie.get("repGenreNm"),
                    poster_url=None,  # KOBIS doesn't provide poster
                    backdrop_url=None,
                    synopsis=None,
                    kobis_code=movie.get("movieCd"),
                    tmdb_id=None,
                    kmdb_id=None,
                    source="kobis"
                )
                results.append(result)

            return results

    @cache_external_api(prefix="tmdb:search:v2", ttl=86400)
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
                    "region": "KR",
                    "include_adult": "false",
                    "page": 1,
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
                backdrop_path = movie.get("backdrop_path")
                backdrop_url = (
                    f"https://image.tmdb.org/t/p/original{backdrop_path}" if backdrop_path else None
                )

                result = MovieSearchResult(
                    title=movie.get("title", ""),
                    original_title=movie.get("original_title"),
                    director=None,  # TMDb search doesn't include director
                    year=year,
                    runtime=None,  # Need to fetch details for runtime
                    genre=None,  # Genre requires separate API call
                    poster_url=poster_url,
                    backdrop_url=backdrop_url,
                    synopsis=movie.get("overview"),
                    kobis_code=None,
                    tmdb_id=movie.get("id"),
                    kmdb_id=None,
                    source="tmdb"
                )
                results.append(result)

            return results

    @cache_external_api(prefix="kmdb:search:v2", ttl=86400)
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
                director = directors[0].get("directorNm") if directors else None

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
                    backdrop_url=None,
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
            director = directors[0].get("name") if directors else None

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
            director = directors[0].get("peopleNm") if directors else None

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
