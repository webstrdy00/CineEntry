import { View, Text, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { COLORS } from "../constants/colors"
import type { StatCardProps } from "../types"

/**
 * StatCard 컴포넌트
 *
 * 통계 정보를 표시하는 재사용 가능한 카드 컴포넌트
 * HomeScreen, StatsScreen 등에서 사용
 */
export default function StatCard({ title, value, icon, color = COLORS.gold }: StatCardProps) {
  return (
    <View style={styles.container}>
      {/* 아이콘 */}
      {icon && (
        <Ionicons name={icon} size={32} color={color} />
      )}

      {/* 값 */}
      <Text style={styles.value}>{value}</Text>

      {/* 라벨 */}
      <Text style={styles.label}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 100,
  },
  value: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
    marginTop: 8,
  },
  label: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 4,
    textAlign: "center",
  },
})
