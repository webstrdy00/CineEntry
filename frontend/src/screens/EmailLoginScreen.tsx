import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { login } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

const EmailLoginScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('오류', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const result = await login({ email: email.trim(), password });

      console.log('✅ 로그인 성공:', result.user.email);

      // AuthContext 업데이트
      setUser(result.user);
    } catch (error: any) {
      console.error('❌ 로그인 실패:', error);

      const message =
        error.response?.data?.detail ||
        error.message ||
        '로그인에 실패했습니다.';

      Alert.alert('로그인 실패', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        {/* 뒤로 가기 버튼 */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.gold} />
        </TouchableOpacity>

        <Text style={styles.title}>이메일로 로그인</Text>
        <Text style={styles.subtitle}>Filmory 계정으로 로그인하세요</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotPasswordText}>비밀번호를 잊으셨나요?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>로그인</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>계정이 없으신가요?</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SignUp')}
            disabled={loading}
          >
            <Text style={styles.footerLink}>가입하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    marginBottom: 40,
  },
  form: {
    gap: 15,
  },
  input: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.white,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -5,
    marginBottom: 10,
  },
  forgotPasswordText: {
    color: COLORS.gold,
    fontSize: 14,
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.darkNavy,
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
    gap: 5,
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
});

export default EmailLoginScreen;
