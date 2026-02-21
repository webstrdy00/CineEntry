import api, { unwrapResponse } from '../lib/api';

// ===========================
// Movie Service
// ===========================

export interface UserMovieCreate {
  movie_id: number;
  status: 'watching' | 'completed' | 'watchlist';
  rating?: number;
  one_line_review?: string;
  watch_date?: string;
  progress?: number;
  is_best_movie?: boolean;
}

export interface UserMovieUpdate {
  status?: 'watching' | 'completed' | 'watchlist';
  rating?: number;
  one_line_review?: string;
  watch_date?: string;
  progress?: number;
  is_best_movie?: boolean;
  genre?: string;
  runtime?: number;
}

export interface MovieSearchParams {
  q: string;
}

const normalizeMovie = (movie: any) => ({
  ...movie,
  poster: movie?.poster ?? movie?.poster_url ?? null,
  backdrop: movie?.backdrop ?? movie?.backdrop_url ?? null,
  poster_url: movie?.poster_url ?? movie?.poster ?? null,
  backdrop_url: movie?.backdrop_url ?? movie?.backdrop ?? null,
  review: movie?.review ?? movie?.one_line_review ?? '',
});

// ===========================
// API Functions
// ===========================

export const getMovies = async (status?: string) => {
  const params = status ? { status } : {};
  const response = await api.get('/api/v1/movies/', { params });
  return unwrapResponse<any[]>(response).map(normalizeMovie);
};

export const getMovieDetail = async (movieId: number) => {
  const response = await api.get(`/api/v1/movies/${movieId}`);
  return normalizeMovie(unwrapResponse<any>(response));
};

export const addMovie = async (data: UserMovieCreate) => {
  const response = await api.post('/api/v1/movies/', data);
  return normalizeMovie(unwrapResponse<any>(response));
};

export const updateMovie = async (movieId: number, data: UserMovieUpdate) => {
  const response = await api.put(`/api/v1/movies/${movieId}`, data);
  return normalizeMovie(unwrapResponse<any>(response));
};

export const deleteMovie = async (movieId: number) => {
  const response = await api.delete(`/api/v1/movies/${movieId}`);
  return unwrapResponse<any>(response);
};

export const searchMovies = async (query: string) => {
  const response = await api.get('/api/v1/movies/search', {
    params: { q: query },
  });
  return unwrapResponse<any[]>(response);
};

export const getMovieMetadata = async (source: 'kobis' | 'tmdb', movieId: string | number) => {
  const response = await api.get(`/api/v1/movies/metadata/${source}/${movieId}`);
  return unwrapResponse<any>(response);
};

export const createMovieFromMetadata = async (metadata: any) => {
  const response = await api.post('/api/v1/movies/from-metadata', metadata);
  return unwrapResponse<any>(response);
};
