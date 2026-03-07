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

// ===========================
// Streak & Calendar Types
// ===========================

export interface StreakData {
  current_streak: number;
  longest_streak: number;
  streak_type: string; // 'daily' | 'weekly' | 'custom'
  streak_min_days: number;
  last_watch_date?: string;
  is_active_today: boolean;
  streak_dates: string[]; // current week dates for HomeScreen
  current_streak_start?: string;
  current_streak_end?: string;
  longest_streak_start?: string;
  longest_streak_end?: string;
  weekly_watch_count: number;
}

export interface StreakDates {
  year: number;
  month: number;
  dates: string[];
}

export interface CalendarDay {
  date: string;
  movie_count: number;
  movies?: { id: number; title: string; poster_url?: string }[];
}

export interface CalendarData {
  year: number;
  month: number;
  days: CalendarDay[];
}

export interface StreakSettingsUpdate {
  streak_type?: string;
  streak_min_days?: number;
}

// ===========================
// Streak & Calendar API Functions
// ===========================

/**
 * 스트릭 데이터 조회
 */
export const getStreakData = async (): Promise<StreakData> => {
  const response = await api.get('/api/v1/stats/streak');
  return unwrapResponse<StreakData>(response);
};

/**
 * 특정 연/월의 스트릭 날짜 목록 조회
 */
export const getStreakDates = async (year: number, month: number): Promise<StreakDates> => {
  const response = await api.get('/api/v1/stats/streak/dates', {
    params: { year, month },
  });
  return unwrapResponse<StreakDates>(response);
};

/**
 * 특정 연/월의 캘린더 데이터 조회
 */
export const getCalendarData = async (year: number, month: number): Promise<CalendarData> => {
  const response = await api.get('/api/v1/stats/calendar', {
    params: { year, month },
  });
  return unwrapResponse<CalendarData>(response);
};

/**
 * 스트릭 설정 업데이트
 */
export const updateStreakSettings = async (settings: StreakSettingsUpdate): Promise<StreakData> => {
  const response = await api.put('/api/v1/stats/streak/settings', settings);
  return unwrapResponse<StreakData>(response);
};
