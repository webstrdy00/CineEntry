import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getStreakData, updateStreakSettings } from "../services/statsService"
import type { StreakData } from "../services/statsService"
import { useAlert } from "../components/CustomAlert"

type StreakSettingsNavigationProp = NativeStackNavigationProp<RootStackParamList>

type StreakType = "daily" | "weekly"

const STREAK_TYPE_OPTIONS: { value: StreakType; label: string }[] = [
  { value: "daily", label: "일간 연속 시청" },
  { value: "weekly", label: "주간 연속 시청" },
]

const MIN_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7]

export default function StreakSettingsScreen() {
  const navigation = useNavigation<StreakSettingsNavigationProp>()
  const insets = useSafeAreaInsets()
  const { showAlert } = useAlert()

  const [streakType, setStreakType] = useState<StreakType>("daily")
  const [minDays, setMinDays] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      loadSettings()
    }, [])
  )

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await getStreakData()
      if (data) {
        setStreakType(data.streak_type === "weekly" ? "weekly" : "daily")
        setMinDays(data.streak_min_days || 1)
      }
    } catch (err) {
      // Use defaults
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await updateStreakSettings({
        streak_type: streakType,
        streak_min_days: streakType === "weekly" ? minDays : 1,
      })
      navigation.goBack()
    } catch (err) {
      showAlert("오류", "설정 저장에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setSaving(false)
    }
  }

  const cycleStreakType = (direction: "up" | "down") => {
    const currentIdx = STREAK_TYPE_OPTIONS.findIndex((o) => o.value === streakType)
    const nextIdx = direction === "up"
      ? (currentIdx - 1 + STREAK_TYPE_OPTIONS.length) % STREAK_TYPE_OPTIONS.length
      : (currentIdx + 1) % STREAK_TYPE_OPTIONS.length
    setStreakType(STREAK_TYPE_OPTIONS[nextIdx].value)
  }

  const cycleMinDays = (direction: "up" | "down") => {
    const currentIdx = MIN_DAYS_OPTIONS.indexOf(minDays)
    const nextIdx = direction === "up"
      ? (currentIdx - 1 + MIN_DAYS_OPTIONS.length) % MIN_DAYS_OPTIONS.length
      : (currentIdx + 1) % MIN_DAYS_OPTIONS.length
    setMinDays(MIN_DAYS_OPTIONS[nextIdx])
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  const currentTypeLabel = STREAK_TYPE_OPTIONS.find((o) => o.value === streakType)?.label || ""

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>연속 시청 설정</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>연속 시청 설정</Text>
          <Text style={styles.pageSubtitle}>연속 시청 기록 방식을 설정합니다.</Text>
        </View>

        {/* Streak Type Picker */}
        <View style={styles.pickerCard}>
          <Text style={styles.pickerLabel}>연속 시청 타입</Text>
          <View style={styles.pickerRow}>
            <Text style={styles.pickerValue}>{currentTypeLabel}</Text>
            <View style={styles.pickerArrows}>
              <TouchableOpacity onPress={() => cycleStreakType("up")} style={styles.arrowButton}>
                <Ionicons name="chevron-up" size={20} color={COLORS.lightGray} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => cycleStreakType("down")} style={styles.arrowButton}>
                <Ionicons name="chevron-down" size={20} color={COLORS.lightGray} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Min Days Picker (only for weekly) */}
        {streakType === "weekly" && (
          <>
            <Text style={styles.minDaysQuestion}>
              일주일에 최소 몇 일을 보면 연속 기록을 유지할까요?
            </Text>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerLabel}>최소 시청 일수</Text>
              <View style={styles.pickerRow}>
                <Text style={styles.pickerValue}>{minDays}</Text>
                <View style={styles.pickerArrows}>
                  <TouchableOpacity onPress={() => cycleMinDays("up")} style={styles.arrowButton}>
                    <Ionicons name="chevron-up" size={20} color={COLORS.lightGray} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => cycleMinDays("down")} style={styles.arrowButton}>
                    <Ionicons name="chevron-down" size={20} color={COLORS.lightGray} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.darkNavy} />
          ) : (
            <Text style={styles.saveButtonText}>저장</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  pickerCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: COLORS.deepGray,
    borderRadius: 14,
    padding: 16,
  },
  pickerLabel: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerValue: {
    fontSize: 17,
    fontWeight: "600",
    color: COLORS.white,
  },
  pickerArrows: {
    flexDirection: "column",
    alignItems: "center",
  },
  arrowButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  minDaysQuestion: {
    fontSize: 14,
    color: COLORS.lightGray,
    paddingHorizontal: 20,
    marginBottom: 16,
    lineHeight: 22,
  },
  saveButton: {
    backgroundColor: COLORS.gold,
    marginHorizontal: 20,
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.darkNavy,
  },
})
