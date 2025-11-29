import React, { useState } from "react"
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { supabase } from "../lib/supabase"
import { COLORS } from "../constants/colors"

const ForgotPasswordScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert("오류", "이메일을 입력해주세요.")
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "filmory://auth/reset-password",
      })

      if (error) throw error

      setSent(true)
    } catch (error: any) {
      Alert.alert("오류", error.message)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Ionicons name="mail-outline" size={64} color={COLORS.gold} />
        <Text style={styles.title}>이메일을 확인하세요</Text>
        <Text style={styles.description}>{email}로 비밀번호 재설정 링크를 보냈습니다.</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.linkText}>로그인 화면으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={COLORS.gold} />
      </TouchableOpacity>

      <Text style={styles.title}>비밀번호 재설정</Text>
      <Text style={styles.description}>
        가입할 때 사용한 이메일을 입력하세요. 비밀번호 재설정 링크를 보내드립니다.
      </Text>

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

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleResetPassword}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color={COLORS.darkNavy} /> : <Text style={styles.buttonText}>재설정 링크 보내기</Text>}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: 30,
    paddingTop: 60,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 30,
    lineHeight: 20,
  },
  input: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.white,
    marginBottom: 20,
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
  linkButton: {
    marginTop: 20,
  },
  linkText: {
    color: COLORS.gold,
    fontSize: 14,
  },
})

export default ForgotPasswordScreen
