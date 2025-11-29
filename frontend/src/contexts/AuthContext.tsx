import React, { createContext, useState, useEffect, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { createUser } from '../services/userService';
import { setOnUnauthorized } from '../lib/api';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log('🚀 initAuth 시작');

        // 웹 환경에서 URL 처리
        if (typeof window !== 'undefined') {
          // 1. PKCE 플로우 처리 (?code=...)
          const urlParams = new URLSearchParams(window.location.search);
          const code = urlParams.get('code');

          if (code) {
            console.log('🌐 웹 환경: PKCE code 감지');
            try {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) {
                console.error('❌ PKCE code exchange 실패:', error.message);
              } else {
                console.log('✅ 웹 PKCE 로그인 성공:', data.user?.email);
                // URL에서 code 제거
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            } catch (err) {
              console.error('❌ exchangeCodeForSession 예외:', err);
            }
          }

          // 2. Implicit 플로우 처리 (#access_token=...)
          if (window.location.hash) {
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const access_token = hashParams.get('access_token');
            const refresh_token = hashParams.get('refresh_token');

            if (access_token && refresh_token) {
              console.log('🌐 웹 환경: Implicit 토큰 감지');

              try {
                const { data, error } = await supabase.auth.setSession({
                  access_token,
                  refresh_token,
                });

                if (error) {
                  console.error('❌ 세션 설정 실패:', error.message, error);
                } else {
                  console.log('✅ 웹 Implicit 로그인 성공:', data.user?.email);
                  // URL에서 fragment 제거
                  window.history.replaceState({}, document.title, window.location.pathname);
                }
              } catch (err) {
                console.error('❌ setSession 예외:', err);
              }
            }
          }
        }

        // 세션 가져오기 (위에서 setSession이 완료된 후 실행)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('❌ getSession 실패:', sessionError);
        }

        console.log('📱 현재 세션:', session?.user?.email || '없음');

        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          console.log('✅ initAuth 완료 - loading: false');
        }
      } catch (error) {
        console.error('❌ initAuth 실패:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // 401 처리 콜백 등록
    setOnUnauthorized(() => {
      if (!mounted) return;
      console.log('🔒 401 에러 감지 - 세션 초기화');
      setSession(null);
      setUser(null);
    });

    // 초기화
    initAuth();

    // 세션 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('🔄 Auth state changed:', _event, 'User:', session?.user?.email);

        // 로그인 성공 시 Backend에 사용자 자동 생성
        if (_event === 'SIGNED_IN' && session?.user) {
          console.log('👤 백엔드에 사용자 생성 시도:', session.user.email);
          try {
            // display_name 우선순위: display_name > full_name > name > email 앞부분
            const metadata = session.user.user_metadata || {};
            const displayName =
              metadata.display_name ||
              metadata.full_name ||
              metadata.name ||
              session.user.email?.split('@')[0];

            const userData = {
              email: session.user.email!,
              display_name: displayName,
              avatar_url: metadata.avatar_url || metadata.picture,
            };
            console.log('📝 사용자 데이터:', userData);

            const result = await createUser(userData);
            console.log('✅ Backend 사용자 생성 완료:', result);
          } catch (error: any) {
            console.error('❌ Backend 사용자 생성 오류:', error);
            // 이미 존재하는 사용자는 무시 (409 Conflict)
            if (error.response?.status === 409) {
              console.log('ℹ️ 사용자가 이미 존재함');
            } else {
              console.error('❌ Backend 사용자 생성 실패:', error.message, error.response?.data);
            }
          }
        }

        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          // initAuth에서만 setLoading(false)를 호출하도록 변경
          // onAuthStateChange는 initAuth 이후에도 계속 트리거되므로
          // 여기서 setLoading을 호출하면 안 됨
          console.log('🔄 Auth state 업데이트 완료');
        }
      }
    );

    // Deep Link 처리 (모바일 환경만)
    let linkingSubscription: any;

    if (typeof window === 'undefined') {
      // 모바일 환경에서만 Deep Link 처리
      const handleDeepLink = async (url: string) => {
        console.log('🔗 Deep link received:', url);

        // 1. PKCE 플로우 처리 (?code=...)
        if (url.includes('?code=') || url.includes('&code=')) {
          const urlParts = url.split('?');
          if (urlParts.length > 1) {
            const params = new URLSearchParams(urlParts[1]);
            const code = params.get('code');

            if (code) {
              console.log('📱 모바일: PKCE code 감지');
              try {
                const { data, error } = await supabase.auth.exchangeCodeForSession(code);
                if (error) {
                  console.error('❌ PKCE code exchange 실패:', error.message);
                } else {
                  console.log('✅ 모바일 PKCE 로그인 성공:', data.user?.email);
                }
              } catch (err) {
                console.error('❌ exchangeCodeForSession 예외:', err);
              }
              return;
            }
          }
        }

        // 2. Implicit 플로우 처리 (#access_token=... 또는 ?access_token=...)
        if (url.includes('#access_token=') || url.includes('?access_token=')) {
          const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1]);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            console.log('📱 모바일: Implicit 토큰 감지');
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            if (error) {
              console.error('❌ 세션 설정 실패:', error.message);
            } else {
              console.log('✅ 모바일 Implicit 로그인 성공:', data.user?.email);
            }
          }
        }
      };

      // Deep Link 리스너 등록
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
      subscription.unsubscribe();
      if (linkingSubscription) {
        linkingSubscription.remove();
      }
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
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
