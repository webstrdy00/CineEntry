import axios, { isAxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isWebOAuthOnlyMode } from '../config/runtime';
import type { TokenResponse } from '../services/authService';

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

const API_TIMEOUT_MS = 10000;

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: API_TIMEOUT_MS,
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
  resolve: (tokens: TokenResponse | null) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let refreshSubscribers: TokenRefreshSubscriber[] = [];

const subscribeTokenRefresh = (subscriber: TokenRefreshSubscriber) => {
  refreshSubscribers.push(subscriber);
};

const onTokenRefreshed = (tokens: TokenResponse | null) => {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  subscribers.forEach(({ resolve }) => resolve(tokens));
};

const onTokenRefreshFailed = (error: unknown) => {
  const subscribers = refreshSubscribers;
  refreshSubscribers = [];
  subscribers.forEach(({ reject }) => reject(error));
};

export const isRefreshCredentialRejected = (error: unknown): boolean =>
  isAxiosError(error) && error.response?.status === 401;

export const refreshStoredTokens = async (): Promise<TokenResponse | null> => {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      subscribeTokenRefresh({ resolve, reject });
    });
  }

  isRefreshing = true;

  try {
    if (isWebOAuthOnlyMode) {
      await clearTokens();
      onTokenRefreshed(null);
      return null;
    }

    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await clearTokens();
      if (onUnauthorized) {
        onUnauthorized();
      }
      onTokenRefreshed(null);
      return null;
    }

    const response = await axios.post<BaseResponse<TokenResponse>>(
      `${process.env.EXPO_PUBLIC_API_URL}/api/v1/auth/refresh`,
      { refresh_token: refreshToken },
      {
        timeout: API_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const tokens = unwrapResponse(response);
    if (
      !tokens ||
      typeof tokens.access_token !== 'string' ||
      !tokens.access_token ||
      typeof tokens.refresh_token !== 'string' ||
      !tokens.refresh_token ||
      tokens.token_type !== 'bearer' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    ) {
      throw new Error('토큰 갱신 응답이 유효하지 않습니다.');
    }

    await saveTokens(tokens.access_token, tokens.refresh_token);
    onTokenRefreshed(tokens);
    return tokens;
  } catch (refreshError) {
    try {
      if (isRefreshCredentialRejected(refreshError)) {
        await clearTokens();
        if (onUnauthorized) {
          onUnauthorized();
        }
      }
    } finally {
      // 정리 중 도착한 요청도 모두 실패시키고 다음 갱신을 허용한다.
      onTokenRefreshFailed(refreshError);
    }
    throw refreshError;
  } finally {
    isRefreshing = false;
  }
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

      // 대기 요청에도 재시도 표시를 먼저 남겨 무한 갱신을 막는다.
      originalRequest._retry = true;
      const currentAccessToken = await getAccessToken();
      // 이전 토큰으로 보낸 요청이 늦게 실패한 경우 이미 갱신된 토큰을 사용한다.
      const accessToken = currentAccessToken &&
        originalRequest.headers?.Authorization !== `Bearer ${currentAccessToken}`
        ? currentAccessToken
        : (await refreshStoredTokens())?.access_token;
      if (!accessToken) {
        return Promise.reject(error);
      }

      const headers = originalRequest.headers ?? {};
      headers.Authorization = `Bearer ${accessToken}`;
      originalRequest.headers = headers;
      return api(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default api;
