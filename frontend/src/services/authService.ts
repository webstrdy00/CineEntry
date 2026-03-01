/**
 * Authentication Service
 * 자체 JWT 인증 서비스
 */
import api from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ===========================
// Types
// ===========================

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  auth_provider: string;
  email_verified: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: TokenResponse;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ===========================
// Token Storage
// ===========================

const ACCESS_TOKEN_KEY = 'cineentry_access_token';
const REFRESH_TOKEN_KEY = 'cineentry_refresh_token';
const AUTH_BASE = '/api/v1/auth';

/**
 * 토큰 저장 (SecureStore 또는 localStorage)
 */
export const saveTokens = async (tokens: TokenResponse): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  } else {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access_token);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }
};

/**
 * Access Token 조회
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
};

/**
 * Refresh Token 조회
 */
export const getRefreshToken = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
};

/**
 * 토큰 삭제 (로그아웃 시)
 */
export const clearTokens = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
};

// ===========================
// Auth API Calls
// ===========================

/**
 * 이메일 회원가입
 */
export const register = async (data: RegisterRequest): Promise<LoginResponse> => {
  const response = await api.post(`${AUTH_BASE}/register`, data);
  const result = response.data.data as LoginResponse;

  // 토큰 저장
  await saveTokens(result.tokens);

  return result;
};

/**
 * 이메일 로그인
 */
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await api.post(`${AUTH_BASE}/login`, data);
  const result = response.data.data as LoginResponse;

  // 토큰 저장
  await saveTokens(result.tokens);

  return result;
};

/**
 * 토큰 갱신
 */
export const refreshTokens = async (): Promise<TokenResponse | null> => {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  try {
    const response = await api.post(`${AUTH_BASE}/refresh`, {
      refresh_token: refreshToken,
    });

    const tokens = response.data.data as TokenResponse;
    await saveTokens(tokens);

    return tokens;
  } catch (error) {
    // Refresh 실패 시 토큰 삭제
    await clearTokens();
    return null;
  }
};

/**
 * 로그아웃
 */
export const logout = async (): Promise<void> => {
  try {
    await api.post(`${AUTH_BASE}/logout`);
  } catch (error) {
    // 서버 에러는 무시
    console.log('Logout API error (ignored):', error);
  }

  await clearTokens();
};

/**
 * 현재 사용자 정보 조회
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  try {
    const response = await api.get(`${AUTH_BASE}/me`);
    return response.data.data as AuthUser;
  } catch (error) {
    return null;
  }
};

/**
 * 비밀번호 변경
 */
export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  await api.post(`${AUTH_BASE}/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
};

// ===========================
// OAuth
// ===========================

export interface OAuthUrlResponse {
  url: string;
  state: string;
}

/**
 * Google OAuth URL 가져오기
 */
export const getGoogleAuthUrl = async (): Promise<OAuthUrlResponse> => {
  const response = await api.get(`${AUTH_BASE}/google`);
  return response.data.data as OAuthUrlResponse;
};

/**
 * Google OAuth 콜백 처리
 */
export const handleGoogleCallback = async (
  code: string,
  state?: string
): Promise<LoginResponse> => {
  const response = await api.post(`${AUTH_BASE}/google/callback`, { code, state });
  const result = response.data.data as LoginResponse;

  await saveTokens(result.tokens);

  return result;
};

/**
 * Kakao OAuth URL 가져오기
 */
export const getKakaoAuthUrl = async (): Promise<OAuthUrlResponse> => {
  const response = await api.get(`${AUTH_BASE}/kakao`);
  return response.data.data as OAuthUrlResponse;
};

/**
 * Kakao OAuth 콜백 처리
 */
export const handleKakaoCallback = async (
  code: string,
  state?: string
): Promise<LoginResponse> => {
  const response = await api.post(`${AUTH_BASE}/kakao/callback`, { code, state });
  const result = response.data.data as LoginResponse;

  await saveTokens(result.tokens);

  return result;
};
