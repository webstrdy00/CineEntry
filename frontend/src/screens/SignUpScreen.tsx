import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAlert } from '../components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { register } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import {
  PASSWORD_MIN_LENGTH,
  evaluatePasswordPolicy,
} from '../lib/passwordPolicy';

const getErrorMessage = (error: any) => {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') {
    return detail[0].msg;
  }

  return error?.message || '회원가입에 실패했습니다.';
};

const getStrengthColor = (level: 0 | 1 | 2 | 3) => {
  if (level === 1) {
    return COLORS.warning;
  }
  if (level === 2) {
    return COLORS.gold;
  }
  if (level === 3) {
    return COLORS.success;
  }
  return COLORS.mediumGray;
};

const SignUpScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { showAlert } = useAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { setUser } = useAuth();

  const trimmedEmail = email.trim();
  const trimmedDisplayName = displayName.trim();
  const passwordPolicy = evaluatePasswordPolicy({
    password,
    confirmPassword,
    email: trimmedEmail,
    displayName: trimmedDisplayName,
  });
  const canSubmit =
    !!trimmedEmail &&
    !!trimmedDisplayName &&
    !!password &&
    !!confirmPassword &&
    passwordPolicy.isValid &&
    !loading;

  const handleSignUp = async () => {
    if (!trimmedEmail || !password || !confirmPassword || !trimmedDisplayName) {
      showAlert('오류', '모든 항목을 입력해주세요.');
      return;
    }

    if (!passwordPolicy.isValid) {
      showAlert('오류', passwordPolicy.errors[0] || '비밀번호 정책을 확인해주세요.');
      return;
    }

    setLoading(true);

    try {
      const result = await register({
        email: trimmedEmail,
        password,
        display_name: trimmedDisplayName,
      });

      setUser(result.user);

      showAlert(
        '회원가입 완료!',
        'CineEntry에 오신 것을 환영합니다.\n지금 기기에서는 바로 사용할 수 있지만, 다음 이메일 로그인과 비밀번호 변경은 인증 후 가능합니다.'
      );
    } catch (error: any) {
      showAlert('회원가입 실패', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const strengthColor = getStrengthColor(passwordPolicy.strengthLevel);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.gold} />
        </TouchableOpacity>

        <Text style={styles.title}>계정 만들기</Text>
        <Text style={styles.subtitle}>안전한 비밀번호로 CineEntry를 시작하세요</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor={COLORS.lightGray}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="이름 (닉네임)"
            placeholderTextColor={COLORS.lightGray}
            value={displayName}
            onChangeText={setDisplayName}
            autoComplete="nickname"
            editable={!loading}
          />

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.inputField}
              placeholder={`비밀번호 (최소 ${PASSWORD_MIN_LENGTH}자)`}
              placeholderTextColor={COLORS.lightGray}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.visibilityButton}
              onPress={() => setShowPassword((prev) => !prev)}
              disabled={loading}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.lightGray}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.policyCard}>
            <View style={styles.policyHeader}>
              <Text style={styles.policyTitle}>비밀번호 보안</Text>
              <Text style={[styles.policyStrength, { color: strengthColor }]}>
                {passwordPolicy.strengthLabel}
              </Text>
            </View>

            <View style={styles.strengthTrack}>
              <View
                style={[
                  styles.strengthFill,
                  {
                    width: passwordPolicy.strengthWidth,
                    backgroundColor: strengthColor,
                  },
                ]}
              />
            </View>

            <View style={styles.requirements}>
              {passwordPolicy.requirements.map((requirement) => (
                <View key={requirement.id} style={styles.requirementRow}>
                  <Ionicons
                    name={
                      requirement.passed
                        ? 'checkmark-circle'
                        : 'ellipse-outline'
                    }
                    size={16}
                    color={requirement.passed ? COLORS.success : COLORS.mediumGray}
                  />
                  <Text
                    style={[
                      styles.requirementText,
                      requirement.passed && styles.requirementTextPassed,
                    ]}
                  >
                    {requirement.label}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.policyHint}>
              영문, 숫자, 특수문자를 섞으면 더 안전합니다.
            </Text>
          </View>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.inputField}
              placeholder="비밀번호 확인"
              placeholderTextColor={COLORS.lightGray}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.visibilityButton}
              onPress={() => setShowConfirmPassword((prev) => !prev)}
              disabled={loading}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.lightGray}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={!canSubmit}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>회원가입</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>이미 계정이 있으신가요?</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            disabled={loading}
          >
            <Text style={styles.footerLink}>로그인</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>
          가입하면 <Text style={styles.termsLink}>서비스 약관</Text> 및{' '}
          <Text style={styles.termsLink}>개인정보 처리방침</Text>에 동의하게 됩니다.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingBottom: 40,
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
    marginBottom: 32,
    lineHeight: 22,
  },
  form: {
    gap: 14,
  },
  input: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.white,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 10,
  },
  inputField: {
    flex: 1,
    minHeight: 56,
    fontSize: 16,
    color: COLORS.white,
  },
  visibilityButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.18)',
    gap: 12,
  },
  policyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  policyTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  policyStrength: {
    fontSize: 13,
    fontWeight: '700',
  },
  strengthTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 999,
  },
  requirements: {
    gap: 8,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requirementText: {
    flex: 1,
    color: COLORS.lightGray,
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 10,
  },
  requirementTextPassed: {
    color: COLORS.white,
  },
  policyHint: {
    color: COLORS.lightGray,
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.45,
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

export default SignUpScreen;
