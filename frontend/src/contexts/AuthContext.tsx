import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { setOnUnauthorized } from '../lib/api';
import {
  AuthUser,
  getAccessToken,
  getCurrentUser,
  logout as authLogout,
  handleGoogleCallback,
  handleKakaoCallback,
  clearTokens,
} from '../services/authService';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  handleAuthRedirectUrl: (url: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  signOut: async () => {},
  refreshUser: async () => {},
  setUser: () => {},
  handleAuthRedirectUrl: async () => {},
});

const MIN_BOOT_LOADING_MS = 700;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const handledAuthUrlsRef = useRef<Map<string, Promise<void>>>(new Map());

  const handleAuthRedirectUrl = async (url: string) => {
    const normalizedUrl = url.trim();

    if (!normalizedUrl || !normalizedUrl.includes('/auth/')) {
      return;
    }

    const existingHandler = handledAuthUrlsRef.current.get(normalizedUrl);
    if (existingHandler) {
      return existingHandler;
    }

    const handlerPromise = (async () => {
      console.log('🔗 Deep link received:', normalizedUrl);

      const urlParts = normalizedUrl.split('?');
      const params = new URLSearchParams(urlParts[1] || '');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      try {
        if (normalizedUrl.includes('/auth/email/verified')) {
          const currentUser = await getCurrentUser();
          if (currentUser) {
            setUser(currentUser);
          }
          return;
        }

        if (normalizedUrl.includes('/auth/password-reset-complete')) {
          await clearTokens();
          setUser(null);
          return;
        }

        if (normalizedUrl.includes('/auth/google/callback')) {
          if (error) {
            throw new Error(errorDescription || 'Google 로그인에 실패했습니다.');
          }

          const code = params.get('code');
          const state = params.get('state');

          if (code) {
            console.log('📱 Google OAuth 콜백 처리');
            const result = await handleGoogleCallback(code, state || undefined);
            setUser(result.user);
            console.log('✅ Google 로그인 성공:', result.user.email);
          }
          return;
        }

        if (normalizedUrl.includes('/auth/kakao/callback')) {
          if (error) {
            throw new Error(errorDescription || 'Kakao 로그인에 실패했습니다.');
          }

          const code = params.get('code');
          const state = params.get('state');

          if (code) {
            console.log('📱 Kakao OAuth 콜백 처리');
            const result = await handleKakaoCallback(code, state || undefined);
            setUser(result.user);
            console.log('✅ Kakao 로그인 성공:', result.user.email);
          }
        }
      } catch (error) {
        console.error('❌ OAuth 콜백 처리 실패:', error);
        throw error;
      }
    })();

    handledAuthUrlsRef.current.set(normalizedUrl, handlerPromise);
    return handlerPromise;
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const startedAt = Date.now();
      const finishLoading = async () => {
        const remainingMs = MIN_BOOT_LOADING_MS - (Date.now() - startedAt);

        if (remainingMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingMs));
        }

        if (mounted) {
          setLoading(false);
        }
      };

      try {
        console.log('🚀 initAuth 시작');

        // 저장된 토큰 확인
        const accessToken = await getAccessToken();

        if (!accessToken) {
          console.log('📱 저장된 토큰 없음');
          await finishLoading();
          return;
        }

        // 토큰이 있으면 사용자 정보 조회
        const currentUser = await getCurrentUser();

        if (mounted) {
          if (currentUser) {
            console.log('✅ 사용자 복원:', currentUser.email);
            setUser(currentUser);
          } else {
            console.log('❌ 토큰 만료 또는 유효하지 않음');
            await clearTokens();
          }
        }
        await finishLoading();
      } catch (error) {
        console.error('❌ initAuth 실패:', error);
        if (mounted) {
          await clearTokens();
        }
        await finishLoading();
      }
    };

    // 401 처리 콜백 등록
    setOnUnauthorized(() => {
      if (!mounted) return;
      console.log('🔒 401 에러 감지 - 세션 초기화');
      setUser(null);
    });

    // 초기화
    initAuth();

    // Deep Link 처리 (OAuth 콜백)
    let linkingSubscription: any;

    // 웹 환경에서 URL 파라미터 처리
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      const url = window.location.href;
      if (url.includes('/auth/')) {
        handleAuthRedirectUrl(url)
          .then(() => {
            if (url.includes('code=') || url.includes('/auth/email/verified') || url.includes('/auth/password-reset-complete')) {
              window.history.replaceState({}, document.title, '/');
            }
          })
          .catch(() => {});
      }
    }

    // 모바일 환경에서 Deep Link 처리
    if (Platform.OS !== 'web') {
      linkingSubscription = Linking.addEventListener('url', ({ url }) => {
        handleAuthRedirectUrl(url).catch(() => {});
      });

      // 앱이 닫힌 상태에서 링크로 열린 경우
      Linking.getInitialURL().then((url) => {
        if (url) {
          handleAuthRedirectUrl(url).catch(() => {});
        }
      });
    }

    return () => {
      mounted = false;
      if (linkingSubscription) {
        linkingSubscription.remove();
      }
    };
  }, []);

  const signOut = async () => {
    await authLogout();
    setUser(null);
  };

  const refreshUser = async () => {
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        signOut,
        refreshUser,
        setUser,
        handleAuthRedirectUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
