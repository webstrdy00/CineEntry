import React from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { COLORS } from "../constants/colors"

const ForgotPasswordScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={COLORS.gold} />
      </TouchableOpacity>

      <Ionicons name="construct-outline" size={64} color={COLORS.gold} style={styles.icon} />

      <Text style={styles.title}>비밀번호 재설정</Text>
      <Text style={styles.description}>
        비밀번호 재설정 기능은 준비 중입니다.{"\n"}
        문의사항이 있으시면 고객센터로 연락해주세요.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>돌아가기</Text>
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
  icon: {
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 30,
    lineHeight: 22,
    textAlign: "center",
  },
  button: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonText: {
    color: COLORS.darkNavy,
    fontSize: 16,
    fontWeight: "bold",
  },
})

export default ForgotPasswordScreen
