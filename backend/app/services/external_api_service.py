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
T = TypeVar("T")

TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"
TMDB_IMAGE_LANGUAGE_FALLBACK = "ko,en,null"
TMDB_SEARCH_IMAGE_ENRICH_LIMIT = 8


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
            cache_key_parts = [str(arg) for arg in args[1:]] + [
                str(v) for v in kwargs.values()
            ]
            cache_key = f"{prefix}:{':'.join(cache_key_parts)}"

            # Try to get from cache
            cached = await redis_service.get_json(cache_key)
            if cached:
                # Determine return type from function annotations
                return_type = func.__annotations__.get("return")

                # Handle List[Model] types
                if (
                    hasattr(return_type, "__origin__")
                    and return_type.__origin__ is list
                ):
                    model_class = return_type.__args__[0]
                    return [model_class(**item) for item in cached]

                # Handle Optional[Model] types
                elif hasattr(return_type, "__origin__"):
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
                print(f"{func.__name__} error: {type(e).__name__}")
                # Return empty list for List return types, None for Optional
                return_type = func.__annotations__.get("return")
                if (
                    hasattr(return_type, "__origin__")
                    and return_type.__origin__ is list
                ):
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
        if value.startswith("-") and value[1:].isdigit():
            return int(value)

    # 변환 시도
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def build_tmdb_image_url(file_path: Optional[str], size: str = "w500") -> Optional[str]:
    """TMDb file_path를 앱에서 바로 사용할 수 있는 이미지 URL로 변환."""
    if not file_path:
        return None
    if file_path.startswith("http://") or file_path.startswith("https://"):
        return file_path
    normalized_path = file_path if file_path.startswith("/") else f"/{file_path}"
    return f"{TMDB_IMAGE_BASE_URL}/{size}{normalized_path}"


class ExternalAPIService:
    """외부 API 통합 서비스"""

    SEARCH_MERGE_FIELDS = (
        "title",
        "original_title",
        "content_type",
        "release_channel",
        "director",
        "year",
        "runtime",
        "total_episodes",
        "genre",
        "poster_url",
        "backdrop_url",
        "synopsis",
    )
    SEARCH_FIELD_PRIORITIES = {
        "title": {"kobis": 4, "kmdb": 3, "tmdb": 2, "search": 1},
        "original_title": {"tmdb": 4, "kmdb": 3, "kobis": 2, "search": 1},
        "content_type": {"tmdb_tv": 5, "tmdb": 4, "kobis": 3, "kmdb": 3, "search": 1},
        "release_channel": {
            "kobis": 5,
            "tmdb_tv": 4,
            "tmdb": 3,
            "kmdb": 2,
            "search": 1,
        },
        "director": {"kobis": 4, "kmdb": 3, "tmdb": 2, "search": 1},
        "year": {"kobis": 4, "tmdb": 3, "kmdb": 2, "search": 1},
        "runtime": {"tmdb": 4, "kmdb": 3, "kobis": 2, "search": 1},
        "total_episodes": {"tmdb_tv": 5, "search": 1},
        "genre": {"kobis": 4, "kmdb": 3, "tmdb": 2, "search": 1},
        "poster_url": {"tmdb": 5, "kmdb": 4, "kobis": 1, "search": 1},
        "backdrop_url": {"tmdb": 5, "kmdb": 1, "kobis": 1, "search": 1},
        "synopsis": {"tmdb": 5, "kmdb": 4, "kobis": 1, "search": 1},
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
        if field_name in ("year", "runtime", "total_episodes"):
            return isinstance(value, int) and value > 0
        if field_name == "release_channel":
            return value in ("theatrical", "ott_original", "tv")
        if field_name == "content_type":
            return value in ("movie", "series")
        return True

    @staticmethod
    def _select_tmdb_image_path(
        images_payload: Optional[dict], image_key: str
    ) -> Optional[str]:
        """TMDb images 응답에서 언어/평점 우선순위로 대표 이미지를 선택."""
        if not images_payload:
            return None

        images = images_payload.get(image_key) or []
        if not images:
            return None

        language_priority = {"ko": 4, "en": 3, None: 2, "": 2}

        def score(image: dict) -> tuple:
            language = image.get("iso_639_1")
            return (
                language_priority.get(language, 1),
                image.get("vote_average") or 0,
                image.get("vote_count") or 0,
                image.get("height") or 0,
                image.get("width") or 0,
            )

        selected = max(images, key=score)
        return selected.get("file_path")

    def _poster_url_from_tmdb_payload(
        self, payload: dict, poster_size: str = "w500"
    ) -> Optional[str]:
        """대표 poster_path가 없을 때 appended images 포스터로 fallback."""
        poster_path = payload.get("poster_path") or self._select_tmdb_image_path(
            payload.get("images"), "posters"
        )
        return build_tmdb_image_url(poster_path, poster_size)

    def _backdrop_url_from_tmdb_payload(
        self, payload: dict, backdrop_size: str = "original"
    ) -> Optional[str]:
        """대표 backdrop_path가 없을 때 appended images backdrop으로 fallback."""
        backdrop_path = payload.get("backdrop_path") or self._select_tmdb_image_path(
            payload.get("images"), "backdrops"
        )
        return build_tmdb_image_url(backdrop_path, backdrop_size)

    async def _get_tmdb_images_payload(
        self, client: httpx.AsyncClient, media_type: str, tmdb_id: int
    ) -> dict:
        """검색 응답에서 이미지가 비어 있을 때 별도 images endpoint로 fallback 데이터를 가져온다."""
        endpoint = "movie" if media_type == "movie" else "tv"
        response = await client.get(
            f"https://api.themoviedb.org/3/{endpoint}/{tmdb_id}/images",
            params={
                "api_key": settings.TMDB_API_KEY,
                "language": "ko-KR",
                "include_image_language": TMDB_IMAGE_LANGUAGE_FALLBACK,
            },
        )
        response.raise_for_status()
        return response.json()

    async def _enrich_missing_tmdb_images(
        self,
        client: httpx.AsyncClient,
        results: List[MovieSearchResult],
    ) -> None:
        """검색 결과 중 이미지가 비어 있는 상위 일부만 TMDb images endpoint로 보강."""
        candidates = [
            result
            for result in results
            if result.tmdb_id is not None
            and result.source in ("tmdb", "tmdb_tv")
            and (not result.poster_url or not result.backdrop_url)
        ][:TMDB_SEARCH_IMAGE_ENRICH_LIMIT]

        if not candidates:
            return

        tasks = [
            self._get_tmdb_images_payload(
                client,
                (
                    "series"
                    if candidate.content_type == "series"
                    or candidate.source == "tmdb_tv"
                    else "movie"
                ),
                candidate.tmdb_id,
            )
            for candidate in candidates
        ]
        images_results = await asyncio.gather(*tasks, return_exceptions=True)

        for candidate, images_payload in zip(candidates, images_results):
            if isinstance(images_payload, Exception):
                print(
                    f"[search] TMDb 이미지 보강 실패: {candidate.tmdb_id} ({type(images_payload).__name__})"
                )
                continue

            if not candidate.poster_url:
                candidate.poster_url = build_tmdb_image_url(
                    self._select_tmdb_image_path(images_payload, "posters"),
                    "w500",
                )
            if not candidate.backdrop_url:
                candidate.backdrop_url = build_tmdb_image_url(
                    self._select_tmdb_image_path(images_payload, "backdrops"),
                    "original",
                )

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

        current_priority = self._field_priority(
            field_priorities, field_name, current_source
        )
        candidate_priority = self._field_priority(
            field_priorities, field_name, candidate_source
        )

        if candidate_priority != current_priority:
            return candidate_priority > current_priority

        if isinstance(candidate_value, str) and isinstance(current_value, str):
            return len(candidate_value.strip()) > len(current_value.strip())

        return False

    @staticmethod
    def _source_identifiers(result: MovieSearchResult) -> dict:
        """검색 표시 정보를 합쳐도 대표 출처의 식별자만 유지한다."""
        identifiers = {"kobis_code": None, "tmdb_id": None, "kmdb_id": None}
        if result.source in ("tmdb", "tmdb_tv"):
            identifiers["tmdb_id"] = result.tmdb_id
        elif result.source == "kobis":
            identifiers["kobis_code"] = result.kobis_code
        elif result.source == "kmdb":
            identifiers["kmdb_id"] = result.kmdb_id
        return identifiers

    def _build_result_keys(self, result: MovieSearchResult) -> Set[str]:
        """중복 병합용 식별 키 생성."""
        keys: Set[str] = set()
        year_key = str(result.year) if result.year and result.year > 0 else "0"
        content_type = result.content_type or "movie"

        for text in (result.title, result.original_title):
            normalized_text = self._normalize_text(text)
            if normalized_text:
                keys.add(f"title:{content_type}:{normalized_text}:{year_key}")

        identifiers = self._source_identifiers(result)
        if identifiers["tmdb_id"] is not None:
            keys.add(f"tmdb:{content_type}:{identifiers['tmdb_id']}")
        if identifiers["kobis_code"]:
            keys.add(f"kobis:{identifiers['kobis_code']}")
        if identifiers["kmdb_id"]:
            keys.add(f"kmdb:{identifiers['kmdb_id']}")

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
        if (first_result.content_type or "movie") != (
            second_result.content_type or "movie"
        ):
            return False

        if not self._years_are_compatible(first_result.year, second_result.year):
            return False

        return bool(
            self._result_aliases(first_result) & self._result_aliases(second_result)
        )

    def _create_search_bucket(
        self, result: MovieSearchResult, score: int, keys: Set[str]
    ) -> Dict[str, Any]:
        """병합용 검색 버킷 생성."""
        bucket_result = result.model_copy(update=self._source_identifiers(result))
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
            candidate_source = candidate_field_sources.get(
                field_name, candidate_result.source
            )

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

        if candidate_score > bucket["score"] or (
            candidate_score == bucket["score"]
            and not bucket_result.poster_url
            and candidate_result.poster_url
        ):
            bucket["score"] = candidate_score
            bucket_result.source = candidate_result.source
            for field, value in self._source_identifiers(candidate_result).items():
                setattr(bucket_result, field, value)

        bucket["keys"].update(self._build_result_keys(candidate_result))

    async def get_verified_metadata(
        self, source: str, external_id: Any
    ) -> Optional[MovieMetadata]:
        """한 공급자의 확인된 정보만 반환한다. 다른 소스 ID는 alias로 저장하지 않는다."""
        if source in ("tmdb", "tmdb_tv"):
            if (
                not isinstance(external_id, int)
                or isinstance(external_id, bool)
                or external_id <= 0
            ):
                raise ValueError("TMDb ID는 양의 정수여야 합니다.")
            id_field = "tmdb_id"
            content_type = "series" if source == "tmdb_tv" else "movie"
            fetch = (
                self.get_tmdb_tv_metadata
                if source == "tmdb_tv"
                else self.get_tmdb_metadata
            )
        elif source == "kobis":
            if not isinstance(external_id, str) or not re.fullmatch(
                r"[0-9]+", external_id
            ):
                raise ValueError("KOBIS 코드는 숫자로 입력해야 합니다.")
            id_field = "kobis_code"
            content_type = "movie"
            fetch = self.get_kobis_metadata
        elif source == "kmdb":
            if not isinstance(external_id, str) or not re.fullmatch(
                r"[A-Z][0-9]+", external_id
            ):
                raise ValueError("KMDb ID 형식이 올바르지 않습니다.")
            id_field = "kmdb_id"
            content_type = "movie"
            fetch = self.get_kmdb_metadata
        else:
            raise ValueError("지원하지 않는 작품 정보 출처입니다.")

        try:
            metadata = await fetch(external_id)
        except Exception:
            return None
        if (
            metadata is None
            or getattr(metadata, id_field) != external_id
            or metadata.content_type != content_type
            or not metadata.title.strip()
        ):
            return None

        identifiers = {"kobis_code": None, "tmdb_id": None, "kmdb_id": None}
        identifiers[id_field] = external_id
        return metadata.model_copy(update=identifiers)

    async def build_canonical_metadata_from_search_result(
        self, result: MovieSearchResult
    ) -> Optional[MovieMetadata]:
        """클라이언트 검색 필드는 조회 선택자로만 사용하고 공급자 상세 정보로 대체한다."""
        if result.source in ("tmdb", "tmdb_tv"):
            external_id = result.tmdb_id
        elif result.source == "kobis":
            external_id = result.kobis_code
        elif result.source == "kmdb":
            external_id = result.kmdb_id
        else:
            raise ValueError("지원하지 않는 작품 정보 출처입니다.")
        return await self.get_verified_metadata(result.source, external_id)

    def _score_result(self, query: str, result: MovieSearchResult) -> Optional[int]:
        """검색어 대비 결과 관련도 점수 계산."""
        q, query_tokens, query_year, _ = self._parse_query(query)
        title = self._normalize_text(result.title)
        original_title = self._normalize_text(result.original_title)
        director = self._normalize_text(result.director)
        title_candidates = [
            candidate for candidate in (title, original_title) if candidate
        ]

        exact_title_match = bool(q) and any(
            candidate == q for candidate in title_candidates
        )
        prefix_title_match = bool(q) and any(
            candidate.startswith(q) for candidate in title_candidates
        )
        contains_title_match = bool(q) and any(
            q in candidate for candidate in title_candidates
        )

        title_token_hits = self._count_token_matches(
            query_tokens, title, original_title
        )
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
            "tmdb_tv": 3,
            "kobis": 2,
            "kmdb": 1,
        }
        score += source_weight.get(result.source, 0)

        if score < self._minimum_relevance_score(len(query_tokens)):
            return None

        return score

    def _rank_and_dedupe(
        self, query: str, results: List[MovieSearchResult]
    ) -> List[MovieSearchResult]:
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
                index
                for index, bucket in enumerate(buckets)
                if result_keys & bucket["keys"]
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
            print(f"[search] KOBIS 검색 실패: {type(e).__name__}")

        # TMDb에서 검색 (국제 영화)
        try:
            tmdb_results = await self.search_tmdb(api_query)
            results.extend(tmdb_results)
        except Exception as e:
            print(f"[search] TMDb 검색 실패: {type(e).__name__}")

        # KMDb에서 검색 (한국 영화 추가 정보) - 키가 있을 때만
        if settings.KMDB_API_KEY and settings.KMDB_API_KEY != "your_kmdb_api_key_here":
            try:
                kmdb_results = await self.search_kmdb(api_query)
                results.extend(kmdb_results)
            except Exception as e:
                print(f"[search] KMDb 검색 실패: {type(e).__name__}")
        else:
            print("[search] KMDb API 키가 없어 KMDb 검색을 건너뜁니다.")

        return self._rank_and_dedupe(normalized_query, results)

    @cache_external_api(prefix="kobis:search:v3", ttl=86400)
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
                "https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieList.json",
                params={
                    "key": settings.KOBIS_API_KEY,
                    "movieNm": query,
                },
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
                    content_type="movie",
                    release_channel="theatrical",
                    director=director,
                    year=safe_int(movie.get("prdtYear")),
                    runtime=None,  # KOBIS doesn't provide runtime in search
                    total_episodes=None,
                    genre=movie.get("repGenreNm"),
                    poster_url=None,  # KOBIS doesn't provide poster
                    backdrop_url=None,
                    synopsis=None,
                    kobis_code=movie.get("movieCd"),
                    tmdb_id=None,
                    kmdb_id=None,
                    source="kobis",
                )
                results.append(result)

            return results

    @cache_external_api(prefix="tmdb:search:v4", ttl=86400)
    async def search_tmdb(self, query: str) -> List[MovieSearchResult]:
        """
        TMDb API로 영화/시리즈 검색 (The Movie Database)

        Args:
            query: 검색어

        Returns:
            영화/시리즈 검색 결과 리스트
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            common_params = {
                "api_key": settings.TMDB_API_KEY,
                "query": query,
                "language": "ko-KR",
                "include_adult": "false",
                "page": 1,
            }

            movie_response, tv_response = await asyncio.gather(
                client.get(
                    "https://api.themoviedb.org/3/search/movie",
                    params={**common_params, "region": "KR"},
                ),
                client.get(
                    "https://api.themoviedb.org/3/search/tv",
                    params=common_params,
                ),
            )
            movie_response.raise_for_status()
            tv_response.raise_for_status()
            movie_data = movie_response.json()
            tv_data = tv_response.json()

            results = []
            movies = movie_data.get("results", [])

            for movie in movies:
                # Get release year
                release_date = movie.get("release_date", "")
                year = (
                    safe_int(release_date[:4])
                    if (release_date and len(release_date) >= 4)
                    else 0
                )

                # Get poster URL
                poster_url = build_tmdb_image_url(movie.get("poster_path"), "w500")
                backdrop_path = movie.get("backdrop_path")
                backdrop_url = build_tmdb_image_url(backdrop_path, "original")

                result = MovieSearchResult(
                    title=movie.get("title", ""),
                    original_title=movie.get("original_title"),
                    content_type="movie",
                    release_channel="unknown",
                    director=None,  # TMDb search doesn't include director
                    year=year,
                    runtime=None,  # Need to fetch details for runtime
                    total_episodes=None,
                    genre=None,  # Genre requires separate API call
                    poster_url=poster_url,
                    backdrop_url=backdrop_url,
                    synopsis=movie.get("overview"),
                    kobis_code=None,
                    tmdb_id=movie.get("id"),
                    kmdb_id=None,
                    source="tmdb",
                )
                results.append(result)

            tv_items = tv_data.get("results", [])

            for item in tv_items:
                first_air_date = item.get("first_air_date", "")
                year = (
                    safe_int(first_air_date[:4])
                    if (first_air_date and len(first_air_date) >= 4)
                    else 0
                )

                poster_url = build_tmdb_image_url(item.get("poster_path"), "w500")
                backdrop_url = build_tmdb_image_url(
                    item.get("backdrop_path"), "original"
                )

                result = MovieSearchResult(
                    title=item.get("name", ""),
                    original_title=item.get("original_name"),
                    content_type="series",
                    release_channel="tv",
                    director=None,
                    year=year,
                    runtime=None,
                    total_episodes=None,
                    genre=None,
                    poster_url=poster_url,
                    backdrop_url=backdrop_url,
                    synopsis=item.get("overview"),
                    kobis_code=None,
                    tmdb_id=item.get("id"),
                    kmdb_id=None,
                    source="tmdb_tv",
                )
                results.append(result)

            await self._enrich_missing_tmdb_images(client, results)
            return results

    @cache_external_api(prefix="kmdb:search:v3", ttl=86400)
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
                "https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp",
                params={
                    "collection": "kmdb_new2",
                    "ServiceKey": settings.KMDB_API_KEY,
                    "title": query,
                    "listCount": 10,
                },
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
                    content_type="movie",
                    release_channel="unknown",
                    director=director,
                    year=year,
                    runtime=runtime,
                    total_episodes=None,
                    genre=genre,
                    poster_url=poster_url,
                    backdrop_url=None,
                    synopsis=(
                        movie.get("plots", {}).get("plot", [{}])[0].get("plotText")
                        if movie.get("plots")
                        else None
                    ),
                    kobis_code=None,
                    tmdb_id=None,
                    kmdb_id=movie.get("DOCID"),
                    source="kmdb",
                )
                results.append(result)

            return results

    async def get_movie_metadata(
        self, kobis_code: Optional[str] = None, tmdb_id: Optional[int] = None
    ) -> Optional[MovieMetadata]:
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

    @cache_external_api(prefix="tmdb:movie:v3", ttl=86400)
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
                    "append_to_response": "credits,images",
                    "include_image_language": TMDB_IMAGE_LANGUAGE_FALLBACK,
                },
            )
            response.raise_for_status()
            movie = response.json()

            # Get director from credits
            if movie.get("id") != tmdb_id:
                return None

            credits = movie.get("credits", {})
            crew = credits.get("crew", [])
            directors = [c for c in crew if c.get("job") == "Director"]
            director = directors[0].get("name") if directors else None

            # Get release year
            release_date = movie.get("release_date", "")
            year = int(release_date[:4]) if release_date else 0

            # Get poster and backdrop URLs, including appended images fallback.
            poster_url = self._poster_url_from_tmdb_payload(movie)
            backdrop_url = self._backdrop_url_from_tmdb_payload(movie)

            # Get genres
            genres = movie.get("genres", [])
            genre = ", ".join([g.get("name") for g in genres])

            metadata = MovieMetadata(
                title=movie.get("title", ""),
                original_title=movie.get("original_title"),
                content_type="movie",
                release_channel="unknown",
                director=director,
                year=year,
                runtime=movie.get("runtime", 0),
                total_episodes=None,
                genre=genre,
                poster_url=poster_url,
                backdrop_url=backdrop_url,
                synopsis=movie.get("overview"),
                kobis_code=None,
                tmdb_id=movie["id"],
                kmdb_id=None,
            )

            return metadata

    @cache_external_api(prefix="tmdb:tv:v3", ttl=86400)
    async def get_tmdb_tv_metadata(self, tmdb_id: int) -> Optional[MovieMetadata]:
        """
        TMDb에서 시리즈 상세 정보 가져오기

        Args:
            tmdb_id: TMDb TV ID

        Returns:
            시리즈 메타데이터
        """
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.themoviedb.org/3/tv/{tmdb_id}",
                params={
                    "api_key": settings.TMDB_API_KEY,
                    "language": "ko-KR",
                    "append_to_response": "credits,images",
                    "include_image_language": TMDB_IMAGE_LANGUAGE_FALLBACK,
                },
            )
            response.raise_for_status()
            item = response.json()

            if item.get("id") != tmdb_id:
                return None

            credits = item.get("credits", {})
            crew = credits.get("crew", [])
            creators = item.get("created_by", [])
            directors = [
                c for c in crew if c.get("job") in ("Director", "Series Director")
            ]
            director = None
            if creators:
                director = creators[0].get("name")
            elif directors:
                director = directors[0].get("name")

            first_air_date = item.get("first_air_date", "")
            year = safe_int(first_air_date[:4]) if first_air_date else 0

            poster_url = self._poster_url_from_tmdb_payload(item)
            backdrop_url = self._backdrop_url_from_tmdb_payload(item)

            genres = item.get("genres", [])
            genre = ", ".join([g.get("name") for g in genres if g.get("name")])

            runtimes = item.get("episode_run_time") or []
            runtime = safe_int(runtimes[0]) if runtimes else None

            return MovieMetadata(
                title=item.get("name", ""),
                original_title=item.get("original_name"),
                content_type="series",
                release_channel="tv",
                director=director,
                year=year,
                runtime=runtime,
                total_episodes=item.get("number_of_episodes"),
                genre=genre,
                poster_url=poster_url,
                backdrop_url=backdrop_url,
                synopsis=item.get("overview"),
                kobis_code=None,
                tmdb_id=item["id"],
                kmdb_id=None,
            )

    @cache_external_api(prefix="kobis:movie:v2", ttl=86400)
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
                "https://www.kobis.or.kr/kobisopenapi/webservice/rest/movie/searchMovieInfo.json",
                params={
                    "key": settings.KOBIS_API_KEY,
                    "movieCd": kobis_code,
                },
            )
            response.raise_for_status()
            data = response.json()

            movie = data.get("movieInfoResult", {}).get("movieInfo", {})

            if movie.get("movieCd") != kobis_code:
                return None

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
                content_type="movie",
                release_channel="theatrical",
                director=director,
                year=year,
                runtime=runtime,
                total_episodes=None,
                genre=genre,
                poster_url=None,  # KOBIS doesn't provide poster
                backdrop_url=None,
                synopsis=None,  # KOBIS doesn't provide synopsis
                kobis_code=movie["movieCd"],
                tmdb_id=None,
                kmdb_id=None,
            )

            return metadata

    @cache_external_api(prefix="kmdb:movie:v1", ttl=86400)
    async def get_kmdb_metadata(self, kmdb_id: str) -> Optional[MovieMetadata]:
        """KMDb DOCID로 상세 조회하고 응답의 DOCID가 일치하는지 확인한다."""
        match = re.fullmatch(r"([A-Z])([0-9]+)", kmdb_id)
        if not match:
            return None

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp",
                params={
                    "collection": "kmdb_new2",
                    "ServiceKey": settings.KMDB_API_KEY,
                    "movieId": match.group(1),
                    "movieSeq": match.group(2),
                    "detail": "Y",
                    "listCount": 1,
                },
            )
            response.raise_for_status()
            data = response.json()
            matches = [
                movie
                for group in data.get("Data", [])
                for movie in group.get("Result", [])
                if movie.get("DOCID") == kmdb_id
            ]
            if len(matches) != 1:
                return None

            movie = matches[0]
            directors = movie.get("directors", {}).get("director", [])
            posters = (movie.get("posters") or "").split("|")
            plots = movie.get("plots", {}).get("plot", [])
            return MovieMetadata(
                title=(movie.get("title") or "")
                .replace("!HS", "")
                .replace("!HE", "")
                .strip(),
                original_title=movie.get("titleEng"),
                content_type="movie",
                release_channel="unknown",
                director=directors[0].get("directorNm") if directors else None,
                year=safe_int(movie.get("prodYear")) or None,
                runtime=safe_int(movie.get("runtime")) or None,
                genre=movie.get("genre"),
                poster_url=posters[0] or None,
                synopsis=plots[0].get("plotText") if plots else None,
                kmdb_id=movie["DOCID"],
            )


# Singleton instance
external_api_service = ExternalAPIService()
