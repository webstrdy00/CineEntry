import api, { unwrapResponse } from '../lib/api';

// ===========================
// Movie Service
// ===========================

export interface UserMovieCreate {
  movie_id: number;
  title: string;
  original_title?: string;
  director?: string;
  year?: number;
  runtime?: number;
  genre?: string;
  poster_url?: string;
  backdrop_url?: string;
  synopsis?: string;
  status: 'watching' | 'completed' | 'watchlist';
  rating?: number; // 1-5
  review?: string;
  watch_date?: string; // ISO 8601 format
  is_best_movie?: boolean;
}

export interface UserMovieUpdate {
  status?: 'watching' | 'completed' | 'watchlist';
  rating?: number;
  review?: string;
  watch_date?: string;
  is_best_movie?: boolean;
  progress?: number; // 시청 시간(분)
}

export interface MovieSearchParams {
  q: string; // 검색어
}

// ===========================
// API Functions
// ===========================

/**
 * 사용자 영화 목록 조회
 * @param status - 필터링할 상태 (watching, completed, watchlist)
 */
export const getMovies = async (status?: string) => {
  const params = status ? { status } : {};
  const response = await api.get('/api/v1/movies/', { params });
  return unwrapResponse<any[]>(response);
};

/**
 * 영화 상세 조회
 * @param movieId - 영화 ID
 */
export const getMovieDetail = async (movieId: number) => {
  const response = await api.get(`/api/v1/movies/${movieId}`);
  return unwrapResponse<any>(response);
};

/**
 * 영화 추가
 * @param data - 영화 생성 데이터
 */
export const addMovie = async (data: UserMovieCreate) => {
  const response = await api.post('/api/v1/movies/', data);
  return unwrapResponse<any>(response);
};

/**
 * 영화 수정
 * @param movieId - 영화 ID
 * @param data - 영화 수정 데이터
 */
export const updateMovie = async (movieId: number, data: UserMovieUpdate) => {
  const response = await api.put(`/api/v1/movies/${movieId}`, data);
  return unwrapResponse<any>(response);
};

/**
 * 영화 삭제
 * @param movieId - 영화 ID
 */
export const deleteMovie = async (movieId: number) => {
  const response = await api.delete(`/api/v1/movies/${movieId}`);
  return unwrapResponse<any>(response);
};

/**
 * 영화 검색 (외부 API)
 * @param query - 검색어
 */
export const searchMovies = async (query: string) => {
  const response = await api.get('/api/v1/movies/search', {
    params: { q: query },
  });
  return unwrapResponse<any[]>(response);
};

/**
 * 영화 메타데이터 조회 (외부 API)
 * @param movieId - KOBIS/TMDb 영화 ID
 */
export const getMovieMetadata = async (movieId: string) => {
  const response = await api.get(`/api/v1/movies/${movieId}/metadata`);
  return unwrapResponse<any>(response);
};
