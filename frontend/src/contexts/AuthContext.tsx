import React, { createContext, useState, useEffect, useContext } from 'react';
import * as Linking from 'expo-linking';
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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  signOut: async () => {},
  refreshUser: async () => {},
  setUser: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log('🚀 initAuth 시작');

        // 저장된 토큰 확인
        const accessToken = await getAccessToken();

        if (!accessToken) {
          console.log('📱 저장된 토큰 없음');
          if (mounted) {
            setLoading(false);
          }
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
          setLoading(false);
        }
      } catch (error) {
        console.error('❌ initAuth 실패:', error);
        if (mounted) {
          await clearTokens();
          setLoading(false);
        }
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

    const handleDeepLink = async (url: string) => {
      console.log('🔗 Deep link received:', url);

      try {
        // Google OAuth 콜백
        if (url.includes('/auth/google/callback')) {
          const urlParts = url.split('?');
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const code = params.get('code');
            const state = params.get('state');

            if (code) {
              console.log('📱 Google OAuth 콜백 처리');
              const result = await handleGoogleCallback(code, state || undefined);
              setUser(result.user);
              console.log('✅ Google 로그인 성공:', result.user.email);
            }
          }
          return;
        }

        // Kakao OAuth 콜백
        if (url.includes('/auth/kakao/callback')) {
          const urlParts = url.split('?');
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const code = params.get('code');
            const state = params.get('state');

            if (code) {
              console.log('📱 Kakao OAuth 콜백 처리');
              const result = await handleKakaoCallback(code, state || undefined);
              setUser(result.user);
              console.log('✅ Kakao 로그인 성공:', result.user.email);
            }
          }
          return;
        }
      } catch (error) {
        console.error('❌ OAuth 콜백 처리 실패:', error);
      }
    };

    // 웹 환경에서 URL 파라미터 처리
    if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      const url = window.location.href;
      if (url.includes('/auth/') && url.includes('code=')) {
        handleDeepLink(url).then(() => {
          // OAuth 콜백 처리 후 콜백 경로를 제거하고 루트로 정리
          window.history.replaceState({}, document.title, '/');
        });
      }
    }

    // 모바일 환경에서 Deep Link 처리
    if (typeof window === 'undefined') {
      linkingSubscription = Linking.addEventListener('url', ({ url }) => {
        handleDeepLink(url);
      });

      // 앱이 닫힌 상태에서 링크로 열린 경우
      Linking.getInitialURL().then((url) => {
        if (url) handleDeepLink(url);
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
