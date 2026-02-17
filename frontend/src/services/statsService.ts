import api, { unwrapResponse } from '../lib/api';

// ===========================
// Stats Service
// ===========================

export interface OverallStats {
  total_watched: number;
  total_watch_time: number;
  average_rating: number;
  current_streak: number;
  yearly_goal: number;
  yearly_progress: number;
  yearly_goal_percentage: number;
}

export interface MonthlyData {
  month: string; // "2025-01"
  count: number;
}

export interface GenreStats {
  genre: string;
  count: number;
  percentage: number;
}

export interface TagStats {
  tag: string;
  count: number;
}

export interface BestMovie {
  id: number;
  title: string;
  director?: string | null;
  year?: number | null;
  poster_url?: string | null;
  rating: number;
  review: string;
  watch_date?: string | null;
}

// ===========================
// API Functions
// ===========================

/**
 * 전체 통계 조회
 */
export const getOverallStats = async (year?: number): Promise<OverallStats> => {
  const response = await api.get('/api/v1/stats', {
    params: typeof year === 'number' ? { year } : undefined,
  });
  return unwrapResponse<OverallStats>(response);
};

/**
 * 월별 관람 추이 조회
 * @param months - 조회할 개월 수 (기본값 6)
 */
export const getMonthlyStats = async (months: number = 6): Promise<MonthlyData[]> => {
  const response = await api.get('/api/v1/stats/monthly', {
    params: { months },
  });
  return unwrapResponse<MonthlyData[]>(response);
};

/**
 * 장르 통계 조회
 * @param limit - 조회할 장르 개수 (기본값 5)
 */
export const getGenreStats = async (limit: number = 5): Promise<GenreStats[]> => {
  const response = await api.get('/api/v1/stats/genres', {
    params: { limit },
  });
  return unwrapResponse<GenreStats[]>(response);
};

/**
 * 태그 통계 조회
 * @param limit - 조회할 태그 개수 (기본값 10)
 */
export const getTagStats = async (limit: number = 10): Promise<TagStats[]> => {
  const response = await api.get('/api/v1/stats/tags', {
    params: { limit },
  });
  return unwrapResponse<TagStats[]>(response);
};

/**
 * 인생 영화 목록 조회
 * @param limit - 조회할 영화 개수 (기본값 10)
 */
export const getBestMovies = async (limit: number = 10): Promise<BestMovie[]> => {
  const response = await api.get('/api/v1/stats/best-movies', {
    params: { limit },
  });
  return unwrapResponse<BestMovie[]>(response);
};
