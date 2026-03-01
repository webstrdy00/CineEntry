import { useState, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"

let AsyncStorage: any = null
try { AsyncStorage = require("@react-native-async-storage/async-storage").default } catch (_) {}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

type PosterMode = "single" | "split"
type WeekStart = "monday" | "sunday"

const STORAGE_KEYS = {
  posterMode: "@cineentry/calendar_poster_mode",
  weekStart: "@cineentry/calendar_week_start",
}

async function loadStorage(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key) } catch { return null }
  }
  if (AsyncStorage) {
    try { return await AsyncStorage.getItem(key) } catch { return null }
  }
  return null
}

async function saveStorage(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value) } catch {}
    return
  }
  if (AsyncStorage) {
    try { await AsyncStorage.setItem(key, value) } catch {}
  }
}

interface OptionItemProps {
  label: string
  selected: boolean
  onPress: () => void
}

function OptionItem({ label, selected, onPress }: OptionItemProps) {
  return (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>
        {label}
      </Text>
      {selected && (
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={20} color={COLORS.white} />
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function WatchCalendarSettingsScreen() {
  const navigation = useNavigation<NavigationProp>()
  const insets = useSafeAreaInsets()

  const [posterMode, setPosterMode] = useState<PosterMode>("single")
  const [weekStart, setWeekStart] = useState<WeekStart>("monday")

  useFocusEffect(
    useCallback(() => {
      loadSettings()
    }, [])
  )

  const loadSettings = async () => {
    const savedPosterMode = await loadStorage(STORAGE_KEYS.posterMode)
    if (savedPosterMode === "single" || savedPosterMode === "split") {
      setPosterMode(savedPosterMode)
    }
    const savedWeekStart = await loadStorage(STORAGE_KEYS.weekStart)
    if (savedWeekStart === "monday" || savedWeekStart === "sunday") {
      setWeekStart(savedWeekStart)
    }
  }

  const handlePosterMode = async (mode: PosterMode) => {
    setPosterMode(mode)
    await saveStorage(STORAGE_KEYS.posterMode, mode)
  }

  const handleWeekStart = async (start: WeekStart) => {
    setWeekStart(start)
    await saveStorage(STORAGE_KEYS.weekStart, start)
  }

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
        <Text style={styles.headerTitle}>달력 설정</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 다중 영화 표시 방법 */}
        <View style={styles.settingSection}>
          <Text style={styles.sectionTitle}>다중 영화 표시 방법</Text>
          <View style={styles.optionList}>
            <OptionItem
              label="첫 번째 포스터만"
              selected={posterMode === "single"}
              onPress={() => handlePosterMode("single")}
            />
            <OptionItem
              label="분할하여 표시"
              selected={posterMode === "split"}
              onPress={() => handlePosterMode("split")}
            />
          </View>
        </View>

        {/* 구분선 */}
        <View style={styles.divider} />

        {/* 주 시작 요일 */}
        <View style={styles.settingSection}>
          <Text style={styles.sectionTitle}>주 시작 요일</Text>
          <View style={styles.optionList}>
            <OptionItem
              label="월요일 시작"
              selected={weekStart === "monday"}
              onPress={() => handleWeekStart("monday")}
            />
            <OptionItem
              label="일요일 시작"
              selected={weekStart === "sunday"}
              onPress={() => handleWeekStart("sunday")}
            />
          </View>
        </View>

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
  settingSection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.lightGray,
    marginBottom: 14,
  },
  optionList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  optionCardActive: {
    borderColor: COLORS.gold,
    backgroundColor: "rgba(212,175,55,0.12)",
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.lightGray,
  },
  optionLabelActive: {
    color: COLORS.white,
    fontWeight: "600",
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 20,
    marginVertical: 24,
  },
})
