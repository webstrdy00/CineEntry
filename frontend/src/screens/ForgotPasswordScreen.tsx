import React, { useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import { requestPasswordReset } from "../services/authService"
import { useAlert } from "../components/CustomAlert"

const ForgotPasswordScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets()
  const { showAlert } = useAlert()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      showAlert("오류", "이메일을 입력해주세요.")
      return
    }

    setLoading(true)
    try {
      await requestPasswordReset(trimmedEmail)
      showAlert(
        "메일을 보냈어요",
        "입력한 이메일로 재설정 안내가 필요하면 메일을 보냈습니다. 메일함과 스팸함을 확인해주세요.",
        [{ text: "확인", onPress: () => navigation.goBack() }],
      )
    } catch (error: any) {
      const message =
        error.response?.data?.detail ||
        error.message ||
        "비밀번호 재설정 메일 요청에 실패했습니다."
      showAlert("요청 실패", message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gold} />
        </TouchableOpacity>

        <Ionicons name="mail-open-outline" size={56} color={COLORS.gold} style={styles.icon} />

        <Text style={styles.title}>비밀번호 재설정</Text>
        <Text style={styles.description}>
          가입한 이메일을 입력하면{"\n"}
          비밀번호 재설정 또는 이메일 로그인 비밀번호 설정 링크를 보내드립니다.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor={COLORS.lightGray}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.darkNavy} />
          ) : (
            <Text style={styles.buttonText}>재설정 메일 보내기</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

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
    justifyContent: "center",
    marginBottom: 20,
  },
  icon: {
    alignSelf: "center",
    marginTop: 24,
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 28,
    lineHeight: 22,
    textAlign: "center",
  },
  input: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.white,
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.darkNavy,
    fontSize: 16,
    fontWeight: "bold",
  },
})

export default ForgotPasswordScreen
