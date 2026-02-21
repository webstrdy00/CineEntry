import api, { unwrapResponse } from '../lib/api';

// ===========================
// Collection Service
// ===========================

export interface CollectionCreate {
  name: string;
  description?: string;
  is_auto: boolean;
  auto_rules?: AutoCollectionRules;
}

export interface CollectionUpdate {
  name?: string;
  description?: string;
  auto_rules?: AutoCollectionRules;
}

export interface AutoCollectionRules {
  status?: 'watching' | 'completed' | 'watchlist';
  min_rating?: number; // 1-5
  max_rating?: number; // 1-5
  year?: number;
  genre?: string;
  director?: string;
  is_best_movie?: boolean;
  watch_date_from?: string; // ISO 8601
  watch_date_to?: string; // ISO 8601
}

export interface Collection {
  id: number;
  name: string;
  description?: string;
  is_auto: boolean;
  auto_rules?: AutoCollectionRules;
  movie_count: number;
  preview_posters: string[];
  created_at: string;
  updated_at: string;
}

export interface CollectionDetail extends Collection {
  movies: Array<{
    id: number;
    title: string;
    poster_url?: string;
    rating?: number;
    year?: number;
    status?: string;
  }>;
}

export interface SyncResult {
  added_count: number;
  removed_count: number;
  total_count: number;
}

// ===========================
// API Functions
// ===========================

/**
 * 컬렉션 목록 조회
 */
export const getCollections = async (): Promise<Collection[]> => {
  const response = await api.get('/api/v1/collections');
  return unwrapResponse<Collection[]>(response);
};

/**
 * 컬렉션 상세 조회
 * @param collectionId - 컬렉션 ID
 */
export const getCollectionDetail = async (collectionId: number): Promise<CollectionDetail> => {
  const response = await api.get(`/api/v1/collections/${collectionId}`);
  return unwrapResponse<CollectionDetail>(response);
};

/**
 * 컬렉션 생성
 * @param data - 컬렉션 생성 데이터
 */
export const createCollection = async (data: CollectionCreate): Promise<Collection> => {
  const response = await api.post('/api/v1/collections', data);
  return unwrapResponse<Collection>(response);
};

/**
 * 컬렉션 수정
 * @param collectionId - 컬렉션 ID
 * @param data - 컬렉션 수정 데이터
 */
export const updateCollection = async (
  collectionId: number,
  data: CollectionUpdate
): Promise<Collection> => {
  const response = await api.put(`/api/v1/collections/${collectionId}`, data);
  return unwrapResponse<Collection>(response);
};

/**
 * 컬렉션 삭제
 * @param collectionId - 컬렉션 ID
 */
export const deleteCollection = async (collectionId: number): Promise<void> => {
  const response = await api.delete(`/api/v1/collections/${collectionId}`);
  unwrapResponse<any>(response);
};

/**
 * 컬렉션에 영화 추가 (수동 컬렉션)
 * @param collectionId - 컬렉션 ID
 * @param movieId - 영화 ID
 */
export const addMovieToCollection = async (
  collectionId: number,
  movieId: number
): Promise<void> => {
  const response = await api.post(`/api/v1/collections/${collectionId}/movies/${movieId}`);
  unwrapResponse<any>(response);
};

/**
 * 컬렉션에서 영화 제거
 * @param collectionId - 컬렉션 ID
 * @param movieId - 영화 ID
 */
export const removeMovieFromCollection = async (
  collectionId: number,
  movieId: number
): Promise<void> => {
  const response = await api.delete(`/api/v1/collections/${collectionId}/movies/${movieId}`);
  unwrapResponse<any>(response);
};

/**
 * 자동 컬렉션 동기화
 * @param collectionId - 컬렉션 ID
 * @returns 동기화 결과 (추가/제거/전체 개수)
 */
export const syncAutoCollection = async (collectionId: number): Promise<SyncResult> => {
  const response = await api.post(`/api/v1/collections/${collectionId}/sync`);
  return unwrapResponse<SyncResult>(response);
};
