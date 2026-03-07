import api, { unwrapResponse } from '../lib/api';

// ===========================
// Tag Service
// ===========================

export interface Tag {
  id: number;
  name: string;
  is_predefined: boolean;
  created_at: string;
}

export interface TagCreate {
  name: string;
}

export interface PopularTag {
  id: number;
  name: string;
  is_predefined: boolean;
  user_id?: string | null;
  created_at: string;
  count: number;
}

// ===========================
// API Functions
// ===========================

/**
 * 태그 목록 조회 (사전 정의 + 커스텀)
 */
export const getTags = async (): Promise<Tag[]> => {
  const response = await api.get('/api/v1/tags');
  return unwrapResponse<Tag[]>(response);
};

/**
 * 인기 태그 조회
 * @param limit - 조회할 태그 개수 (기본값: 10)
 */
export const getPopularTags = async (limit: number = 10): Promise<PopularTag[]> => {
  const response = await api.get('/api/v1/tags/popular', {
    params: { limit },
  });
  return unwrapResponse<PopularTag[]>(response);
};

/**
 * 커스텀 태그 생성
 * @param data - 태그 생성 데이터
 */
export const createTag = async (data: TagCreate): Promise<Tag> => {
  const response = await api.post('/api/v1/tags', data);
  return unwrapResponse<Tag>(response);
};

/**
 * 영화에 태그 추가
 * @param movieId - 영화 ID
 * @param tagId - 태그 ID
 */
export const addTagToMovie = async (movieId: number, tagId: number): Promise<void> => {
  const response = await api.post(`/api/v1/tags/movies/${movieId}/tags`, null, {
    params: { tag_id: tagId }
  });
  unwrapResponse<any>(response);
};

/**
 * 영화에서 태그 제거
 * @param movieId - 영화 ID
 * @param tagId - 태그 ID
 */
export const removeTagFromMovie = async (movieId: number, tagId: number): Promise<void> => {
  const response = await api.delete(`/api/v1/tags/movies/${movieId}/tags/${tagId}`);
  unwrapResponse<any>(response);
};

/**
 * 커스텀 태그 삭제
 * @param tagId - 태그 ID
 */
export const deleteTag = async (tagId: number): Promise<void> => {
  const response = await api.delete(`/api/v1/tags/${tagId}`);
  unwrapResponse<any>(response);
};
