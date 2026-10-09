/**
 * Authentication Service
 * 자체 JWT 인증 서비스
 */
import api, { isRefreshCredentialRejected, refreshStoredTokens, unwrapResponse } from '../lib/api';
import { isAxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isWebOAuthOnlyMode } from '../config/runtime';
import type { OAuthBridgeProvider } from '../config/runtime';

// ===========================
// Types
// ===========================

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_storage_url?: string | null;
  auth_provider: string;
  auth_methods: string[];
  email_verified: boolean;
  has_password: boolean;
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

export class AuthSessionUnavailableError extends Error {
  constructor() {
    super('인증 상태를 확인할 수 없습니다.');
    this.name = 'AuthSessionUnavailableError';
    Object.setPrototypeOf(this, AuthSessionUnavailableError.prototype);
  }
}

export const isAuthSessionUnavailableError = (
  error: unknown
): error is AuthSessionUnavailableError => error instanceof AuthSessionUnavailableError;

const isAuthSessionInvalidError = (error: unknown) => {
  if (!isAxiosError(error)) return false;
  return error.response?.status === 401 || (
    error.response?.status === 404 && error.config?.url === `${AUTH_BASE}/me`
  );
};

// ===========================
// Token Storage
// ===========================

const ACCESS_TOKEN_KEY = 'cineentry_access_token';
const REFRESH_TOKEN_KEY = 'cineentry_refresh_token';
const AUTH_BASE = '/api/v1/auth';
const WEB_AUTH_DISABLED_MESSAGE =
  '웹에서는 모바일 앱 인증 브릿지만 지원합니다.';

const assertInteractiveWebAuthEnabled = () => {
  if (isWebOAuthOnlyMode) {
    throw new Error(WEB_AUTH_DISABLED_MESSAGE);
  }
};

/**
 * 토큰 저장 (SecureStore 또는 localStorage)
 */
export const saveTokens = async (tokens: TokenResponse): Promise<void> => {
  if (Platform.OS === 'web') {
    if (isWebOAuthOnlyMode) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      return;
    }

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
  if (isWebOAuthOnlyMode) {
    return null;
  }

  if (Platform.OS === 'web') {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
};

/**
 * Refresh Token 조회
 */
export const getRefreshToken = async (): Promise<string | null> => {
  if (isWebOAuthOnlyMode) {
    return null;
  }

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
  assertInteractiveWebAuthEnabled();

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
  assertInteractiveWebAuthEnabled();

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
  try {
    return await refreshStoredTokens();
  } catch (error) {
    if (isRefreshCredentialRejected(error)) {
      return null;
    }
    throw new AuthSessionUnavailableError();
  }
};

/**
 * 로그아웃
 */
export const logout = async (): Promise<void> => {
  try {
    await api.post(`${AUTH_BASE}/logout`);
  } catch {
    // 서버 에러는 무시
    if (__DEV__) {
      console.log('Logout API error (ignored)');
    }
  }

  await clearTokens();
};

/**
 * 현재 사용자 정보 조회
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  if (isWebOAuthOnlyMode) {
    return null;
  }

  try {
    const response = await api.get(`${AUTH_BASE}/me`);
    return response.data.data as AuthUser;
  } catch (error) {
    if (!isAuthSessionInvalidError(error)) {
      throw new AuthSessionUnavailableError();
    }

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
  assertInteractiveWebAuthEnabled();

  await api.post(`${AUTH_BASE}/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
};

/**
 * 인증 메일 재전송
 */
export const resendVerificationEmail = async (): Promise<void> => {
  assertInteractiveWebAuthEnabled();

  await api.post(`${AUTH_BASE}/email/verification/resend`);
};

/**
 * 비밀번호 재설정 메일 요청
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  assertInteractiveWebAuthEnabled();

  await api.post(`${AUTH_BASE}/password-reset/request`, { email });
};

// ===========================
// OAuth
// ===========================

export interface OAuthUrlResponse {
  url: string;
  state: string;
  transaction_token: string;
  expires_in: number;
}

export type OAuthClient = 'web' | 'mobile';

interface PendingOAuthAttempt {
  provider: OAuthBridgeProvider;
  state: string;
  transaction_token: string;
  expires_at: number;
}

const consumingOAuthProviders = new Set<OAuthBridgeProvider>();
const getPendingOAuthKey = (provider: OAuthBridgeProvider) =>
  `cineentry_oauth_pending_${provider}`;

const requestOAuthUrl = async (
  provider: OAuthBridgeProvider,
  client: OAuthClient
): Promise<OAuthUrlResponse> => {
  assertInteractiveWebAuthEnabled();

  try {
    const response = await api.get(`${AUTH_BASE}/${provider}`, {
      params: { client },
    });
    const result = unwrapResponse<OAuthUrlResponse>(response);
    if (
      !result ||
      typeof result.url !== 'string' ||
      typeof result.state !== 'string' ||
      !result.state.trim() ||
      result.state.length > 512 ||
      typeof result.transaction_token !== 'string' ||
      !result.transaction_token.trim() ||
      result.transaction_token.length < 32 ||
      result.transaction_token.length > 128 ||
      !Number.isSafeInteger(result.expires_in) ||
      result.expires_in <= 0
    ) {
      throw new Error('OAuth 인증 응답이 유효하지 않습니다.');
    }

    const url = new URL(result.url);
    const providerHost = provider === 'google' ? 'accounts.google.com' : 'kauth.kakao.com';
    const expiresAt = Date.now() + result.expires_in * 1000;
    if (
      url.protocol !== 'https:' ||
      url.host !== providerHost ||
      url.username ||
      url.password ||
      url.hash ||
      url.searchParams.get('state') !== result.state ||
      url.searchParams.has('transaction_token') ||
      result.url.includes(result.transaction_token) ||
      !Number.isSafeInteger(expiresAt)
    ) {
      throw new Error('OAuth 인증 응답이 유효하지 않습니다.');
    }

    const pending: PendingOAuthAttempt = {
      provider,
      state: result.state,
      transaction_token: result.transaction_token,
      expires_at: expiresAt,
    };
    const key = getPendingOAuthKey(provider);
    const value = JSON.stringify(pending);
    if (Platform.OS === 'web') {
      sessionStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }

    return result;
  } catch {
    // 서버 응답이나 저장 오류에 거래 증명이 담겨 있어도 호출자 로그에 노출하지 않는다.
    throw new Error('OAuth 인증 요청을 시작할 수 없습니다. 다시 시도해주세요.');
  }
};

const consumePendingOAuthAttempt = async (
  provider: OAuthBridgeProvider,
  state: string | undefined
): Promise<PendingOAuthAttempt> => {
  if (typeof state !== 'string' || !state.trim() || consumingOAuthProviders.has(provider)) {
    throw new Error('OAuth 인증 요청이 유효하지 않거나 이미 사용되었습니다.');
  }

  consumingOAuthProviders.add(provider);
  try {
    const key = getPendingOAuthKey(provider);
    const value = Platform.OS === 'web'
      ? sessionStorage.getItem(key)
      : await SecureStore.getItemAsync(key);
    const pending: PendingOAuthAttempt | null = value ? JSON.parse(value) : null;
    if (
      !pending ||
      pending.provider !== provider ||
      pending.state !== state ||
      typeof pending.transaction_token !== 'string' ||
      !pending.transaction_token.trim() ||
      !Number.isSafeInteger(pending.expires_at) ||
      pending.expires_at <= Date.now()
    ) {
      throw new Error('OAuth 인증 요청이 유효하지 않거나 만료되었습니다.');
    }

    // 네트워크 요청 전에 삭제하고 동시 콜백도 직렬화해 증명을 한 번만 사용한다.
    if (Platform.OS === 'web') {
      sessionStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
    return pending;
  } catch {
    throw new Error('OAuth 인증 요청이 유효하지 않거나 만료되었습니다.');
  } finally {
    consumingOAuthProviders.delete(provider);
  }
};

const completeOAuthLogin = async (
  provider: OAuthBridgeProvider,
  code: string,
  state: string | undefined
): Promise<LoginResponse> => {
  assertInteractiveWebAuthEnabled();
  if (typeof code !== 'string' || !code.trim()) {
    throw new Error('OAuth 인증 코드가 필요합니다.');
  }
  const pending = await consumePendingOAuthAttempt(provider, state);

  try {
    const response = await api.post(`${AUTH_BASE}/${provider}/callback`, {
      code,
      state: pending.state,
      transaction_token: pending.transaction_token,
    });
    const result = unwrapResponse<LoginResponse>(response);
    await saveTokens(result.tokens);
    return result;
  } catch {
    // Axios 오류의 요청 본문에는 거래 증명이 있으므로 원본 오류를 전달하지 않는다.
    throw new Error('OAuth 로그인에 실패했습니다. 로그인을 다시 시작해주세요.');
  }
};

/**
 * Google OAuth URL 가져오기
 */
export const getGoogleAuthUrl = async (
  client: OAuthClient = 'web'
): Promise<OAuthUrlResponse> => {
  return requestOAuthUrl('google', client);
};

/**
 * Google OAuth 콜백 처리
 */
export const handleGoogleCallback = async (
  code: string,
  state?: string
): Promise<LoginResponse> => {
  return completeOAuthLogin('google', code, state);
};

/**
 * Kakao OAuth URL 가져오기
 */
export const getKakaoAuthUrl = async (
  client: OAuthClient = 'web'
): Promise<OAuthUrlResponse> => {
  return requestOAuthUrl('kakao', client);
};

/**
 * Kakao OAuth 콜백 처리
 */
export const handleKakaoCallback = async (
  code: string,
  state?: string
): Promise<LoginResponse> => {
  return completeOAuthLogin('kakao', code, state);
};
