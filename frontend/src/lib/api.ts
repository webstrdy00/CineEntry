import axios from 'axios';
import { supabase } from './supabase';

// ===========================
// BaseResponse Type (백엔드 응답 구조)
// ===========================
export interface BaseResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

// ===========================
// Utility: BaseResponse 래퍼 제거
// ===========================
/**
 * BaseResponse 래퍼를 벗기고 실제 데이터만 반환
 * @param response - Axios 응답
 * @returns 실제 데이터 (response.data.data)
 */
export const unwrapResponse = <T>(response: { data: BaseResponse<T> }): T => {
  if (!response.data.success) {
    throw new Error(response.data.message || 'API 요청 실패');
  }
  return response.data.data as T;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 401 처리용 콜백 (AuthContext에서 설정)
let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (callback: () => void) => {
  onUnauthorized = callback;
};

// Request Interceptor: JWT 토큰 자동 추가 및 trailing slash 처리
api.interceptors.request.use(
  async (config) => {
    try {
      // Supabase에서 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
        console.log('🔑 JWT 토큰 설정:', session.access_token.substring(0, 20) + '...');
      } else {
        console.warn('⚠️ 세션 없음 - 로그인 필요');
      }
    } catch (error) {
      console.error('❌ 토큰 가져오기 실패:', error);
    }

    // FastAPI trailing slash 처리: 숫자나 특수 경로가 아닌 기본 리소스 경로에 trailing slash 추가
    if (config.url && !config.url.match(/\/\d+/) && !config.url.endsWith('/')) {
      const specialPaths = ['/search', '/metadata', '/sync', '/popular', '/monthly', '/genres', '/best-movies', '/me', '/tags'];
      const hasSpecialPath = specialPaths.some(path => config.url!.includes(path));
      if (!hasSpecialPath) {
        config.url = config.url + '/';
      }
    }

    console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`);

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: 에러 처리
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // 토큰 만료 또는 유효하지 않음
      console.log('🔒 인증 오류: 세션 만료 - 자동 로그아웃');

      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error('❌ Supabase 로그아웃 실패:', signOutError);
      }

      if (onUnauthorized) {
        onUnauthorized();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
