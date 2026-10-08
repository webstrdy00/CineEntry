import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useAlert } from '../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { getGoogleAuthUrl, getKakaoAuthUrl } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from '../components/BrandMark';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

type LoginProvider = 'google' | 'kakao' | null;

const LoginScreen = ({ navigation }: any) => {
  const { showAlert } = useAlert();
  const { handleAuthRedirectUrl } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider>(null);
  const isLoading = loadingProvider !== null;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compactLayout = height < 760;
  const logoWidth = Math.max(
    152,
    Math.min(width * (compactLayout ? 0.44 : 0.46), height * 0.2, 186)
  );
  const contentMinHeight = Math.max(height - insets.top - insets.bottom, 0);
  const topPadding = compactLayout ? 18 : 26;
  const bottomPadding = Math.max(insets.bottom + (compactLayout ? 20 : 28), 28);
  const headerMarginBottom = compactLayout ? 28 : 40;
  const footerMarginTop = compactLayout ? 22 : 30;
  const termsMarginTop = compactLayout ? 20 : 30;

  // Google 로그인
  const handleGoogleLogin = async () => {
    try {
      setLoadingProvider('google');

      const { url } = await getGoogleAuthUrl(Platform.OS === 'web' ? 'web' : 'mobile');

      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          url,
          'cineentry://auth/google/callback'
        );

        if (result.type === 'success' && result.url) {
          await handleAuthRedirectUrl(result.url);
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

      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          url,
          'cineentry://auth/kakao/callback'
        );

        if (result.type === 'success' && result.url) {
          await handleAuthRedirectUrl(result.url);
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
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: contentMinHeight,
            paddingTop: topPadding,
            paddingBottom: bottomPadding,
          },
        ]}
      >
        {/* 헤더 */}
        <View style={[styles.header, { marginBottom: headerMarginBottom }]}>
          <BrandMark
            width={logoWidth}
            variant="immersive"
          />
          <Text style={styles.headline}>영화가 끝난 뒤,{'\n'}나의 기록은 남도록.</Text>
          <Text style={styles.description}>본 영화와 짧은 감상, 다시 보고 싶은 작품을{'\n'}한곳에 모아두세요.</Text>
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
        <View style={[styles.footer, { marginTop: footerMarginTop }]}>
          <Text style={styles.footerText}>계정이 없으신가요?</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            disabled={isLoading}
          >
            <Text style={styles.footerLink}>가입하기</Text>
          </TouchableOpacity>
        </View>

        {/* 약관 동의 */}
        <Text style={[styles.terms, { marginTop: termsMarginTop }]}>
          계속 진행하면{' '}
          <Text style={styles.termsLink}>서비스 약관</Text> 및{' '}
          <Text style={styles.termsLink}>개인정보 처리방침</Text>에 동의하게 됩니다.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
  },
  headline: {
    color: COLORS.white,
    fontSize: 29,
    lineHeight: 40,
    letterSpacing: -1,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 32,
  },
  description: {
    color: COLORS.lightGray,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 16,
  },
  loginButtons: {
    gap: 14,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 4,
    gap: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.mediumGray,
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
