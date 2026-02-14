import api, { unwrapResponse } from '../lib/api';

// ===========================
// Stats Service
// ===========================

export interface OverallStats {
  total_watched: number;
  total_watch_time: number; // �?
  average_rating: number;
  current_streak: number; // ?�속 기록 ?�수
  yearly_goal: number;
  yearly_progress: number;
  yearly_goal_percentage: number; // 백엔?�에??계산??목표 ?�성�?
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
  review: string; // one_line_review
  watch_date?: string | null; // ISO 8601 format
}

// ===========================
// API Functions
// ===========================

/**
 * ?�체 ?�계 조회
 */
export const getOverallStats = async (): Promise<OverallStats> => {
  const response = await api.get('/api/v1/stats');
  return unwrapResponse<OverallStats>(response);
};

/**
 * ?�별 관??추이 조회
 * @param months - 조회??개월 ??(기본�? 6)
 */
export const getMonthlyStats = async (months: number = 6): Promise<MonthlyData[]> => {
  const response = await api.get('/api/v1/stats/monthly', {
    params: { months },
  });
  return unwrapResponse<MonthlyData[]>(response);
};

/**
 * ?�르 ?�계 조회
 * @param limit - 조회???�르 개수 (기본�? 5)
 */
export const getGenreStats = async (limit: number = 5): Promise<GenreStats[]> => {
  const response = await api.get('/api/v1/stats/genres', {
    params: { limit },
  });
  return unwrapResponse<GenreStats[]>(response);
};

/**
 * ?�그 ?�계 조회
 * @param limit - 조회???�그 개수 (기본�? 10)
 */
export const getTagStats = async (limit: number = 10): Promise<TagStats[]> => {
  const response = await api.get('/api/v1/stats/tags', {
    params: { limit },
  });
  return unwrapResponse<TagStats[]>(response);
};

/**
 * ?�생 ?�화 목록 조회
 * @param limit - 조회???�화 개수 (기본�? 10)
 */
export const getBestMovies = async (limit: number = 10): Promise<BestMovie[]> => {
  const response = await api.get('/api/v1/stats/best-movies', {
    params: { limit },
  });
  return unwrapResponse<BestMovie[]>(response);
};

