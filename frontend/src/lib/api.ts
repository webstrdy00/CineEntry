import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isWebOAuthOnlyMode } from '../config/runtime';

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

// ===========================
// Token Storage Keys
// ===========================
const ACCESS_TOKEN_KEY = 'cineentry_access_token';
const REFRESH_TOKEN_KEY = 'cineentry_refresh_token';

// ===========================
// Token Helpers
// ===========================
const getAccessToken = async (): Promise<string | null> => {
  if (isWebOAuthOnlyMode) {
    return null;
  }

  if (Platform.OS === 'web') {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
};

const getRefreshToken = async (): Promise<string | null> => {
  if (isWebOAuthOnlyMode) {
    return null;
  }

  if (Platform.OS === 'web') {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

const saveTokens = async (accessToken: string, refreshToken: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (isWebOAuthOnlyMode) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      return;
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
};

const clearTokens = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
};

// ===========================
// 401 처리 콜백
// ===========================
let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (callback: () => void) => {
  onUnauthorized = callback;
};

// ===========================
// Token Refresh 상태 관리
// ===========================
type TokenRefreshSubscriber = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let refreshSubscribers: TokenRefreshSubscriber[] = [];

const subscribeTokenRefresh = (subscriber: TokenRefreshSubscriber) => {
  refreshSubscribers.push(subscriber);
};

const onTokenRefreshed = (token: string) => {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  subscribers.forEach(({ resolve }) => resolve(token));
};

const onTokenRefreshFailed = (error: unknown) => {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  subscribers.forEach(({ reject }) => reject(error));
};

// ===========================
// Request Interceptor
// ===========================
api.interceptors.request.use(
  async (config) => {
    try {
      const accessToken = await getAccessToken();

      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
        if (__DEV__) {
          console.log('🔑 JWT 토큰 설정');
        }
      } else if (__DEV__) {
        console.warn('⚠️ 세션 없음 - 로그인 필요');
      }
    } catch (error) {
      if (__DEV__) {
        console.error('❌ 토큰 가져오기 실패:', error);
      }
    }

    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers && 'Content-Type' in config.headers) {
        delete (config.headers as any)['Content-Type'];
      }
    }

    if (__DEV__) {
      console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ===========================
// Response Interceptor
// ===========================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl: string = originalRequest?.url ?? '';

    // 401 에러 & 재시도 안 한 요청
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // 로그인/회원가입/OAuth 콜백 등은 토큰 재발급 대상이 아님
      const nonRefreshableAuthPaths = [
        '/api/v1/auth/login',
        '/api/v1/auth/register',
        '/api/v1/auth/google',
        '/api/v1/auth/google/callback',
        '/api/v1/auth/kakao',
        '/api/v1/auth/kakao/callback',
      ];
      const shouldSkipRefresh = nonRefreshableAuthPaths.some((path) =>
        requestUrl.includes(path)
      );
      if (shouldSkipRefresh) {
        return Promise.reject(error);
      }

      // refresh 엔드포인트 자체에서 401이면 로그아웃
      if (requestUrl.includes('/api/v1/auth/refresh') || requestUrl.includes('/auth/refresh')) {
        await clearTokens();
        if (onUnauthorized) {
          onUnauthorized();
        }
        return Promise.reject(error);
      }

      // 이미 갱신 중이면 대기
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh({
            resolve: (token: string) => {
              const headers = originalRequest.headers ?? {};
              headers.Authorization = `Bearer ${token}`;
              originalRequest.headers = headers;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
          throw error;
        }

        // 토큰 갱신 요청
        const response = await axios.post(
          `${process.env.EXPO_PUBLIC_API_URL}/api/v1/auth/refresh`,
          { refresh_token: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { access_token, refresh_token } = response.data.data;

        await saveTokens(access_token, refresh_token);

        onTokenRefreshed(access_token);

        // 원래 요청 재시도
        const headers = originalRequest.headers ?? {};
        headers.Authorization = `Bearer ${access_token}`;
        originalRequest.headers = headers;
        return api(originalRequest);
      } catch (refreshError) {
        onTokenRefreshFailed(refreshError);

        if (__DEV__) {
          console.log('🔒 토큰 갱신 실패 - 로그아웃');
        }
        await clearTokens();

        if (onUnauthorized) {
          onUnauthorized();
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
