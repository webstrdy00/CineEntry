from typing import Optional

from app.schemas.movie import MovieSearchResult
from app.services.external_api_service import ExternalAPIService


def make_result(
    title: str,
    *,
    original_title: Optional[str] = None,
    director: Optional[str] = None,
    year: int = 0,
    poster_url: Optional[str] = "https://example.com/poster.jpg",
    synopsis: Optional[str] = "overview",
    source: str = "tmdb",
) -> MovieSearchResult:
    return MovieSearchResult(
        title=title,
        original_title=original_title,
        director=director,
        year=year,
        runtime=None,
        genre=None,
        poster_url=poster_url,
        backdrop_url=None,
        synopsis=synopsis,
        kobis_code=None,
        tmdb_id=None,
        kmdb_id=None,
        source=source,
    )


def test_parse_query_strips_year_from_api_query() -> None:
    service = ExternalAPIService()

    query_key, tokens, query_year, api_query = service._parse_query("듄 2021")

    assert query_key == "듄"
    assert tokens == ["듄"]
    assert query_year == 2021
    assert api_query == "듄"


def test_rank_and_dedupe_filters_unrelated_results() -> None:
    service = ExternalAPIService()
    results = [
        make_result("인터스텔라", original_title="Interstellar", year=2014),
        make_result("스타워즈", original_title="Star Wars", year=1977),
    ]

    ranked = service._rank_and_dedupe("인터스텔라", results)

    assert [result.title for result in ranked] == ["인터스텔라"]


def test_rank_and_dedupe_prioritizes_query_year_match() -> None:
    service = ExternalAPIService()
    results = [
        make_result("듄", original_title="Dune", year=1984),
        make_result("듄", original_title="Dune", year=2021),
    ]

    ranked = service._rank_and_dedupe("듄 2021", results)

    assert [result.year for result in ranked[:2]] == [2021, 1984]


def test_rank_and_dedupe_filters_partial_multi_token_noise() -> None:
    service = ExternalAPIService()
    results = [
        make_result(
            "해리 포터와 마법사의 돌",
            original_title="Harry Potter and the Sorcerer's Stone",
            year=2001,
        ),
        make_result("해리와 친구들", year=2004),
    ]

    ranked = service._rank_and_dedupe("해리 포터", results)

    assert [result.title for result in ranked] == ["해리 포터와 마법사의 돌"]


def test_rank_and_dedupe_merges_same_alias_when_one_year_is_missing() -> None:
    service = ExternalAPIService()
    results = [
        make_result("곡성", year=0, source="tmdb"),
        make_result("곡성", year=2016, director="나홍진", source="kobis"),
    ]

    ranked = service._rank_and_dedupe("곡성", results)

    assert len(ranked) == 1
    assert ranked[0].year == 2016
    assert ranked[0].director == "나홍진"


def test_rank_and_dedupe_enriches_display_fields_but_retains_only_representative_identity() -> (
    None
):
    service = ExternalAPIService()
    results = [
        MovieSearchResult(
            title="괴물",
            original_title="The Host",
            director=None,
            year=2006,
            runtime=None,
            genre=None,
            poster_url="https://example.com/tmdb-poster.jpg",
            backdrop_url="https://example.com/tmdb-backdrop.jpg",
            synopsis="tmdb overview",
            kobis_code=None,
            tmdb_id=101,
            kmdb_id=None,
            source="tmdb",
        ),
        MovieSearchResult(
            title="괴물",
            original_title="The Host",
            director="봉준호",
            year=2006,
            runtime=120,
            genre="드라마",
            poster_url=None,
            backdrop_url=None,
            synopsis=None,
            kobis_code="20060123",
            tmdb_id=None,
            kmdb_id="KM0001",
            source="kobis",
        ),
    ]

    ranked = service._rank_and_dedupe("괴물", results)

    assert len(ranked) == 1
    assert ranked[0].source == "tmdb"
    assert ranked[0].tmdb_id == 101
    assert ranked[0].kobis_code is None
    assert ranked[0].kmdb_id is None
    assert ranked[0].poster_url == "https://example.com/tmdb-poster.jpg"
    assert ranked[0].backdrop_url == "https://example.com/tmdb-backdrop.jpg"
    assert ranked[0].director == "봉준호"
    assert ranked[0].runtime == 120
    assert ranked[0].genre == "드라마"
    assert ranked[0].year == 2006
    assert ranked[0].synopsis == "tmdb overview"
