import api, { unwrapResponse } from '../lib/api';

// ===========================
// User Service
// ===========================

export interface User {
  id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  yearly_goal?: number;
  auth_provider?: string;
  auth_methods?: string[];
  email_verified?: boolean;
  has_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserUpdate {
  display_name?: string;
  avatar_url?: string | null;
  yearly_goal?: number;
}

export interface UserCreate {
  email: string;
  display_name?: string;
  avatar_url?: string;
}

// ===========================
// API Functions
// ===========================

/**
 * 현재 사용자 정보 조회
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get('/api/v1/users/me');
  return unwrapResponse<User>(response);
};

/**
 * 사용자 프로필 수정
 * @param data - 수정할 사용자 정보
 */
export const updateUserProfile = async (data: UserUpdate): Promise<User> => {
  const response = await api.put('/api/v1/users/me', data);
  return unwrapResponse<User>(response);
};

/**
 * 사용자 생성 (Webhook용 또는 자동 생성)
 * @param data - 사용자 생성 데이터
 */
export const createUser = async (data: UserCreate): Promise<User> => {
  const response = await api.post('/api/v1/users', data);
  return unwrapResponse<User>(response);
};

/**
 * 회원 탈퇴
 */
export const deleteUser = async (): Promise<void> => {
  const response = await api.delete('/api/v1/users/me');
  unwrapResponse<any>(response);
};
