import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS } from '../constants/colors';

const LoginScreen = ({ navigation }: any) => {
  const [loading, setLoading] = useState(false);

  // Google 로그인
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);

      // 웹 환경과 모바일 환경에 따라 redirectTo 설정
      const redirectTo = typeof window !== 'undefined'
        ? window.location.origin // 웹: http://localhost:8081
        : 'filmory://auth/callback'; // 모바일: Deep Link

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;

      console.log('🔗 Google 로그인 시작:', data);
    } catch (error: any) {
      console.error('❌ Google 로그인 실패:', error.message);
      Alert.alert('로그인 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Apple 로그인
  const handleAppleLogin = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: 'filmory://auth/callback',
        },
      });

      if (error) throw error;

      console.log('🔗 Apple 로그인 시작:', data);
    } catch (error: any) {
      console.error('❌ Apple 로그인 실패:', error.message);
      Alert.alert('로그인 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Kakao 로그인
  const handleKakaoLogin = async () => {
    try {
      setLoading(true);

      // 웹 환경과 모바일 환경에 따라 redirectTo 설정
      const redirectTo = typeof window !== 'undefined'
        ? window.location.origin
        : 'filmory://auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;

      console.log('🔗 Kakao 로그인 시작:', data);
    } catch (error: any) {
      console.error('❌ Kakao 로그인 실패:', error.message);
      Alert.alert('로그인 실패', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Ionicons name="film" size={72} color={COLORS.gold} />
        <Text style={styles.title}>Filmory</Text>
        <Text style={styles.subtitle}>당신만의 영화 기록장</Text>
      </View>

      {/* 로그인 버튼들 */}
      <View style={styles.loginButtons}>
        {/* Google 로그인 */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          <Ionicons name="logo-google" size={24} color={COLORS.gold} />
          <Text style={styles.loginButtonText}>Google로 계속하기</Text>
        </TouchableOpacity>

        {/* Apple 로그인 - 개발자 계정 필요로 임시 비활성화
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleAppleLogin}
          disabled={loading}
        >
          <Ionicons name="logo-apple" size={24} color={COLORS.gold} />
          <Text style={styles.loginButtonText}>Apple로 계속하기</Text>
        </TouchableOpacity>
        */}

        {/* Kakao 로그인 */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleKakaoLogin}
          disabled={loading}
        >
          <Ionicons name="chatbubble" size={24} color={COLORS.gold} />
          <Text style={styles.loginButtonText}>Kakao로 계속하기</Text>
        </TouchableOpacity>

        {/* 이메일 로그인 */}
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('EmailLogin')}
          disabled={loading}
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
          disabled={loading}
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
