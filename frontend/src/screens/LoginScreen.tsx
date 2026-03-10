import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAlert } from '../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { getGoogleAuthUrl, getKakaoAuthUrl } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

WebBrowser.maybeCompleteAuthSession();

type LoginProvider = 'google' | 'kakao' | null;

const LoginScreen = ({ navigation }: any) => {
  const { showAlert } = useAlert();
  const { handleAuthRedirectUrl } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider>(null);
  const isLoading = loadingProvider !== null;

  // Google 로그인
  const handleGoogleLogin = async () => {
    try {
      setLoadingProvider('google');

      const { url } = await getGoogleAuthUrl(Platform.OS === 'web' ? 'web' : 'mobile');

      console.log('🔗 Google 로그인 시작:', url);

      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          url,
          'cineentry://auth/google/callback'
        );

        if (result.type === 'success' && result.url) {
          await handleAuthRedirectUrl(result.url);
          console.log('🔗 Google OAuth 콜백 URL:', result.url);
        }
      }
    } catch (error: any) {
      console.error('❌ Google 로그인 실패:', error.message);
      showAlert('로그인 실패', error.message || 'Google 로그인에 실패했습니다.');
    } finally {
      setLoadingProvider(null);
    }
  };

  // Kakao 로그인
  const handleKakaoLogin = async () => {
    try {
      setLoadingProvider('kakao');

      const { url } = await getKakaoAuthUrl(Platform.OS === 'web' ? 'web' : 'mobile');

      console.log('🔗 Kakao 로그인 시작:', url);

      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          url,
          'cineentry://auth/kakao/callback'
        );

        if (result.type === 'success' && result.url) {
          await handleAuthRedirectUrl(result.url);
          console.log('🔗 Kakao OAuth 콜백 URL:', result.url);
        }
      }
    } catch (error: any) {
      console.error('❌ Kakao 로그인 실패:', error.message);
      showAlert('로그인 실패', error.message || 'Kakao 로그인에 실패했습니다.');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Ionicons name="film" size={72} color={COLORS.gold} />
        <Text style={styles.title}>CineEntry</Text>
        <Text style={styles.subtitle}>당신만의 영화 기록장</Text>
      </View>

      {/* 로그인 버튼들 */}
      <View style={styles.loginButtons}>
        {/* Google 로그인 */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleGoogleLogin}
          disabled={isLoading}
        >
          {loadingProvider === 'google' ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : (
            <>
              <Ionicons name="logo-google" size={24} color={COLORS.gold} />
              <Text style={styles.loginButtonText}>Google로 계속하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Kakao 로그인 */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleKakaoLogin}
          disabled={isLoading}
        >
          {loadingProvider === 'kakao' ? (
            <ActivityIndicator color={COLORS.gold} />
          ) : (
            <>
              <Ionicons name="chatbubble" size={24} color={COLORS.gold} />
              <Text style={styles.loginButtonText}>Kakao로 계속하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* 이메일 로그인 */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('EmailLogin')}
          disabled={isLoading}
        >
          <Ionicons name="mail-outline" size={24} color={COLORS.gold} />
          <Text style={styles.loginButtonText}>이메일로 계속하기</Text>
        </TouchableOpacity>
      </View>

      {/* 회원가입 링크 */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>계정이 없으신가요?</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('SignUp')}
          disabled={isLoading}
        >
          <Text style={styles.footerLink}>가입하기</Text>
        </TouchableOpacity>
      </View>

      {/* 약관 동의 */}
      <Text style={styles.terms}>
        계속 진행하면{' '}
        <Text style={styles.termsLink}>서비스 약관</Text> 및{' '}
        <Text style={styles.termsLink}>개인정보 처리방침</Text>에 동의하게 됩니다.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: 30,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 56,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginTop: 20,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    marginTop: 10,
  },
  loginButtons: {
    gap: 14,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    backgroundColor: COLORS.deepGray,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
  },
  loginButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
    gap: 6,
  },
  footerText: {
    color: COLORS.lightGray,
    fontSize: 14,
  },
  footerLink: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: 'bold',
  },
  terms: {
    textAlign: 'center',
    color: COLORS.lightGray,
    fontSize: 12,
    marginTop: 30,
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.gold,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
