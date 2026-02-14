import { TouchableOpacity, Text, StyleSheet } from "react-native"
import { COLORS } from "../constants/colors"
import type { FilterChipProps } from "../types"

/**
 * FilterChip 컴포넌트
 *
 * 필터 선택을 위한 칩 컴포넌트
 * MoviesScreen에서 사용
 */
export default function FilterChip({ label, isActive, onPress }: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isActive && styles.containerActive,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[
        styles.label,
        isActive && styles.labelActive,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.deepGray,
    borderWidth: 1,
    borderColor: COLORS.deepGray,
  },
  containerActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.lightGray,
  },
  labelActive: {
    color: COLORS.darkNavy,
    fontWeight: "600",
  },
})
