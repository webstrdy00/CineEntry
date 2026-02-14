/**
 * TypeScript Type Definitions for Filmory App
 *
 * 모든 데이터 모델과 인터페이스 정의
 */

// ============================================
// Movie Related Types
// ============================================

export type MovieStatus = "watchlist" | "watching" | "completed"

export interface Movie {
  id: number
  title: string
  original_title?: string
  poster?: string
  poster_url: string
  backdrop?: string
  backdrop_url?: string
  year?: number
  runtime?: number // minutes
  genre?: string
  director?: string
  synopsis?: string
  rating?: number // 0-5 (0.5 단위)
  status: MovieStatus
  watch_date?: Date | string
  created_at?: Date | string
  updated_at?: Date | string
}

export interface MovieDetail extends Movie {
  actors?: string
  one_line_review?: string
  detailed_review?: string
  tags?: string[]
  watch_location?: string
  watch_method?: "theater" | "ott" | "tv" | "other"
  watched_with?: string
  is_best_movie?: boolean
  progress?: number // minutes watched (for status: "watching")
}

// ============================================
// User Related Types
// ============================================

export interface User {
  id: string
  email: string
  display_name?: string
  avatar_url?: string
  yearly_goal?: number
  created_at?: Date | string
  updated_at?: Date | string
}

// ============================================
// Statistics Types
// ============================================

export interface MonthlyData {
  month: string // "1월", "2월", etc.
  count: number
}

export interface GenreStat {
  genre: string
  count: number
  color: string
}

export interface TagStat {
  tag: string
  count: number
}

export interface UserStats {
  total_watched: number
  total_watch_time: number // minutes
  average_rating: number
  current_streak: number // days
  yearly_goal: number
  current_year_count: number
  monthly_data: MonthlyData[]
  genre_breakdown: GenreStat[]
  top_tags: TagStat[]
}

// ============================================
// Collection Types
// ============================================

export interface Collection {
  id: number
  name: string
  description?: string
  movie_count: number
  is_auto?: boolean
  created_at?: Date | string
  updated_at?: Date | string
}

export interface CollectionDetail extends Collection {
  movies: Movie[]
}

// ============================================
// Navigation Types
// ============================================

export type RootStackParamList = {
  Login: undefined
  EmailLogin: undefined
  SignUp: undefined
  ForgotPassword: undefined
  Main: undefined
  MovieDetail: { id: number }
  MovieSearch: undefined
  CollectionDetail: { id: number }
}

export type TabParamList = {
  Home: undefined
  Movies: undefined
  Stats: undefined
  Profile: undefined
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  data: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasNext: boolean
}

// ============================================
// Form Types
// ============================================

export interface MovieFormData {
  rating?: number
  one_line_review?: string
  detailed_review?: string
  watch_date?: Date
  watch_location?: string
  watch_method?: "theater" | "ott" | "tv" | "other"
  watched_with?: string
  is_best_movie?: boolean
  tags?: string[]
  status: MovieStatus
}

// ============================================
// UI Component Types
// ============================================

export interface MovieCardProps {
  movie: Movie
  onPress?: (movie: Movie) => void
}

export interface StatCardProps {
  title: string
  value: string | number
  icon?: keyof typeof import("@expo/vector-icons").Ionicons["glyphMap"]
  color?: string
}

export interface FilterChipProps {
  label: string
  isActive: boolean
  onPress: () => void
}
