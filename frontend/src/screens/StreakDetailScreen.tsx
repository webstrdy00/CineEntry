import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Dimensions,
  LayoutAnimation,
  UIManager,
  Pressable,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getStreakData, getStreakDates, updateStreakSettings } from "../services/statsService"
import type { StreakData, StreakDates } from "../services/statsService"
import { useAlert } from "../components/CustomAlert"

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type StreakDetailNavigationProp = NativeStackNavigationProp<RootStackParamList>

const NOIR_BG = COLORS.darkNavy
const NOIR_SURFACE = COLORS.deepGray
const NOIR_SURFACE_ALT = COLORS.darkGray
const NOIR_BORDER = "rgba(255,255,255,0.08)"
const NOIR_TEXT_PRIMARY = COLORS.white
const NOIR_TEXT_SECONDARY = COLORS.lightGray
const NOIR_TEXT_SUBTLE = COLORS.mediumGray
const NOIR_ACCENT = COLORS.gold
const NOIR_ACCENT_STRONG = "#E2C35A"
const SUNDAY_COLOR = COLORS.sundayRed
const STREAK_HIGHLIGHT = "rgba(212,175,55,0.24)"
const TODAY_BG = "rgba(93,173,226,0.28)"
const TODAY_COLOR = COLORS.watchingBlue
const PROGRESS_BAR_COLOR = COLORS.gold
const PREV_MONTH_COLOR = "rgba(160,160,160,0.35)"

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const CALENDAR_PADDING = 16
const CALENDAR_WIDTH = SCREEN_WIDTH - 40 - CALENDAR_PADDING * 2
const CELL_SIZE = Math.floor(CALENDAR_WIDTH / 7)
const ROW_HEIGHT = CELL_SIZE

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]

type StreakType = "daily" | "weekly"
type TabType = "calendar" | "settings"
const MIN_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7]

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function formatDateStr(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0")
  const d = String(day).padStart(2, "0")
  return `${year}-${m}-${d}`
}

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return ""
  const parts = dateStr.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[0]}. ${parseInt(parts[1])}. ${parseInt(parts[2])}.`
}

function formatMonthDisplay(year: number, month: number): string {
  return `${year}. ${month}.`
}


export default function StreakDetailScreen() {
  const navigation = useNavigation<StreakDetailNavigationProp>()
  const insets = useSafeAreaInsets()
  const { showAlert } = useAlert()

  const today = new Date()
  const [calendarYear, setCalendarYear] = useState(today.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1)

  const [streakData, setStreakData] = useState<StreakData | null>(null)
  const [streakDates, setStreakDates] = useState<StreakDates | null>(null)
  const [loading, setLoading] = useState(true)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [error, setError] = useState(false)

  // Tab & settings state
  const [activeTab, setActiveTab] = useState<TabType>("calendar")
  const [editStreakType, setEditStreakType] = useState<StreakType>("daily")
  const [editMinDays, setEditMinDays] = useState(1)
  const [saving, setSaving] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [])
  )

  const loadData = async () => {
    try {
      setLoading(true)
      setError(false)
      const prevMonth = calendarMonth === 1 ? 12 : calendarMonth - 1
      const prevYear = calendarMonth === 1 ? calendarYear - 1 : calendarYear
      const nextMonth = calendarMonth === 12 ? 1 : calendarMonth + 1
      const nextYear = calendarMonth === 12 ? calendarYear + 1 : calendarYear

      const [streak, prev, curr, next] = await Promise.all([
        getStreakData(),
        getStreakDates(prevYear, prevMonth),
        getStreakDates(calendarYear, calendarMonth),
        getStreakDates(nextYear, nextMonth),
      ])
      setStreakData(streak)
      setStreakDates({
        year: calendarYear,
        month: calendarMonth,
        dates: [...prev.dates, ...curr.dates, ...next.dates],
      })
      setEditStreakType(streak.streak_type === "weekly" ? "weekly" : "daily")
      setEditMinDays(streak.streak_min_days || 1)
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const loadCalendarDates = async (year: number, month: number) => {
    try {
      setCalendarLoading(true)
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year

      const [prev, curr, next] = await Promise.all([
        getStreakDates(prevYear, prevMonth),
        getStreakDates(year, month),
        getStreakDates(nextYear, nextMonth),
      ])
      setStreakDates({
        year,
        month,
        dates: [...prev.dates, ...curr.dates, ...next.dates],
      })
    } catch (err) {
      showAlert("오류", "날짜 데이터를 불러오지 못했습니다.")
    } finally {
      setCalendarLoading(false)
    }
  }

  const handlePrevMonth = () => {
    let newYear = calendarYear
    let newMonth = calendarMonth - 1
    if (newMonth < 1) {
      newMonth = 12
      newYear -= 1
    }
    setCalendarYear(newYear)
    setCalendarMonth(newMonth)
    loadCalendarDates(newYear, newMonth)
  }

  const handleNextMonth = () => {
    const currentDate = new Date()
    const isCurrentMonth =
      calendarYear === currentDate.getFullYear() && calendarMonth === currentDate.getMonth() + 1
    if (isCurrentMonth) return

    let newYear = calendarYear
    let newMonth = calendarMonth + 1
    if (newMonth > 12) {
      newMonth = 1
      newYear += 1
    }
    setCalendarYear(newYear)
    setCalendarMonth(newMonth)
    loadCalendarDates(newYear, newMonth)
  }

  const isNextMonthDisabled = () => {
    const currentDate = new Date()
    return (
      calendarYear === currentDate.getFullYear() && calendarMonth === currentDate.getMonth() + 1
    )
  }

  const handleTabChange = (tab: TabType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    if (tab === "settings") {
      setEditStreakType(streakData?.streak_type === "weekly" ? "weekly" : "daily")
      setEditMinDays(streakData?.streak_min_days || 1)
    }
    setActiveTab(tab)
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      const updated = await updateStreakSettings({
        streak_type: editStreakType,
        streak_min_days: editStreakType === "weekly" ? editMinDays : 1,
      })
      setStreakData(updated)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setActiveTab("calendar")
      loadCalendarDates(calendarYear, calendarMonth)
    } catch (err) {
      showAlert("오류", "설정 저장에 실패했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const watchDatesSet = new Set(streakDates?.dates ?? [])
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate())

  const streakType_ = streakData?.streak_type ?? "daily"
  const isWeeklyMode = streakType_ === "weekly" || streakType_ === "custom"
  const minDays = streakData?.streak_min_days ?? 1

  const qualifyingWeeks = new Set<string>()
  if (isWeeklyMode) {
    const weekCounts = new Map<string, number>()
    for (const ds of watchDatesSet) {
      const d = new Date(ds)
      const tempDate = new Date(d.getTime())
      tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7))
      const week1 = new Date(tempDate.getFullYear(), 0, 4)
      const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
      const key = `${tempDate.getFullYear()}-W${weekNum}`
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1)
    }
    for (const [key, count] of weekCounts) {
      if (count >= minDays) qualifyingWeeks.add(key)
    }
  }

  const getISOWeekKey = (year: number, month: number, day: number): string => {
    const d = new Date(year, month - 1, day)
    const tempDate = new Date(d.getTime())
    tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7))
    const week1 = new Date(tempDate.getFullYear(), 0, 4)
    const weekNum = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
    return `${tempDate.getFullYear()}-W${weekNum}`
  }

  const getDailyBandInfo = (dateStr: string, dayIdx: number): { inStreak: boolean; isFirst: boolean; isLast: boolean } => {
    if (!watchDatesSet.has(dateStr)) {
      return { inStreak: false, isFirst: false, isLast: false }
    }
    const d = new Date(dateStr)
    const prevDate = new Date(d.getTime() - 86400000)
    const nextDate = new Date(d.getTime() + 86400000)
    const prevStr = formatDateStr(prevDate.getFullYear(), prevDate.getMonth() + 1, prevDate.getDate())
    const nextStr = formatDateStr(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate())

    const hasPrev = watchDatesSet.has(prevStr)
    const hasNext = watchDatesSet.has(nextStr)
    const isRowStart = dayIdx === 0
    const isRowEnd = dayIdx === 6
    const isFirst = !hasPrev || isRowStart
    const isLast = !hasNext || isRowEnd

    return { inStreak: true, isFirst, isLast }
  }

  const getWeeklyBandInfo = (year: number, month: number, day: number, dayIdx: number): { inStreak: boolean; isFirst: boolean; isLast: boolean } => {
    const weekKey = getISOWeekKey(year, month, day)
    if (!qualifyingWeeks.has(weekKey)) {
      return { inStreak: false, isFirst: false, isLast: false }
    }
    const prevWeekDay = new Date(year, month - 1, day - 7)
    const nextWeekDay = new Date(year, month - 1, day + 7)
    const prevWeekKey = getISOWeekKey(prevWeekDay.getFullYear(), prevWeekDay.getMonth() + 1, prevWeekDay.getDate())
    const nextWeekKey = getISOWeekKey(nextWeekDay.getFullYear(), nextWeekDay.getMonth() + 1, nextWeekDay.getDate())
    const prevWeekQualifies = qualifyingWeeks.has(prevWeekKey)
    const nextWeekQualifies = qualifyingWeeks.has(nextWeekKey)

    const isFirst = dayIdx === 0 && !prevWeekQualifies
    const isLast = dayIdx === 6 && !nextWeekQualifies

    return { inStreak: true, isFirst, isLast }
  }

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth)
    const firstDayOffset = getFirstDayOfWeek(calendarYear, calendarMonth)

    const prevMonth = calendarMonth === 1 ? 12 : calendarMonth - 1
    const prevYear = calendarMonth === 1 ? calendarYear - 1 : calendarYear
    const prevMonthDays = getDaysInMonth(prevYear, prevMonth)

    type CellData = { day: number; year: number; month: number; isCurrentMonth: boolean }
    const cells: CellData[] = []

    for (let i = firstDayOffset - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, year: prevYear, month: prevMonth, isCurrentMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, year: calendarYear, month: calendarMonth, isCurrentMonth: true })
    }
    const nextMonth = calendarMonth === 12 ? 1 : calendarMonth + 1
    const nextYear = calendarMonth === 12 ? calendarYear + 1 : calendarYear
    let nextDay = 1
    while (cells.length % 7 !== 0) {
      cells.push({ day: nextDay++, year: nextYear, month: nextMonth, isCurrentMonth: false })
    }

    const weeks: CellData[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7))
    }

    return (
      <View style={styles.calendarGrid}>
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, idx) => (
            <View key={idx} style={styles.weekdayCell}>
              <Text
                style={[
                  styles.weekdayLabel,
                  idx === 6 && { color: SUNDAY_COLOR },
                ]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        {weeks.map((week, weekIdx) => {
          const bandInfos = week.map((cell, dayIdx) => {
            const dateStr = formatDateStr(cell.year, cell.month, cell.day)
            if (isWeeklyMode) {
              return getWeeklyBandInfo(cell.year, cell.month, cell.day, dayIdx)
            }
            return getDailyBandInfo(dateStr, dayIdx)
          })

          type Segment = { startIdx: number; endIdx: number }
          const segments: Segment[] = []
          let segStart = -1
          for (let i = 0; i < 7; i++) {
            if (bandInfos[i].inStreak) {
              if (segStart === -1) segStart = i
            } else {
              if (segStart !== -1) {
                segments.push({ startIdx: segStart, endIdx: i - 1 })
                segStart = -1
              }
            }
          }
          if (segStart !== -1) segments.push({ startIdx: segStart, endIdx: 6 })

          const segmentMeta = segments.map((seg) => {
            const firstInfo = bandInfos[seg.startIdx]
            const lastInfo = bandInfos[seg.endIdx]
            return {
              ...seg,
              roundLeft: firstInfo.isFirst,
              roundRight: lastInfo.isLast,
            }
          })

          return (
            <View key={weekIdx} style={styles.weekRow}>
              {segmentMeta.map((seg, segIdx) => {
                const left = seg.startIdx * CELL_SIZE
                const width = (seg.endIdx - seg.startIdx + 1) * CELL_SIZE
                const BAND_V_INSET = Math.floor(ROW_HEIGHT * 0.12)
                const BAND_RADIUS = (ROW_HEIGHT - BAND_V_INSET * 2) / 2

                return (
                  <View
                    key={segIdx}
                    style={[
                      styles.streakBand,
                      {
                        left,
                        width,
                        top: BAND_V_INSET,
                        bottom: BAND_V_INSET,
                        borderRadius: 0,
                        borderTopLeftRadius: seg.roundLeft ? BAND_RADIUS : 0,
                        borderBottomLeftRadius: seg.roundLeft ? BAND_RADIUS : 0,
                        borderTopRightRadius: seg.roundRight ? BAND_RADIUS : 0,
                        borderBottomRightRadius: seg.roundRight ? BAND_RADIUS : 0,
                      },
                    ]}
                  />
                )
              })}

              {week.map((cell, dayIdx) => {
                const dateStr = formatDateStr(cell.year, cell.month, cell.day)
                const isToday = dateStr === todayStr
                const isSunday = dayIdx === 6
                const isWatched = watchDatesSet.has(dateStr)
                const bandInfo = bandInfos[dayIdx]

                return (
                  <View key={dayIdx} style={styles.dayCell}>
                    {isToday && <View style={styles.todayCircle} />}
                    {isWatched && bandInfo.inStreak && !isToday && (
                      <View style={styles.watchDot} />
                    )}
                    <Text
                      style={[
                        styles.dayText,
                        !cell.isCurrentMonth && styles.dayTextPrevMonth,
                        cell.isCurrentMonth && isSunday && styles.dayTextSunday,
                        bandInfo.inStreak && cell.isCurrentMonth && styles.dayTextStreak,
                        isToday && styles.dayTextToday,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                )
              })}
            </View>
          )
        })}
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={NOIR_ACCENT_STRONG} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={48} color={NOIR_TEXT_SECONDARY} />
        <Text style={styles.errorText}>데이터를 불러올 수 없습니다</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Ionicons name="refresh" size={18} color={NOIR_ACCENT_STRONG} />
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const currentStreak = streakData?.current_streak ?? 0
  const longestStreak = streakData?.longest_streak ?? 0
  const streakType = streakData?.streak_type ?? "daily"
  const isWeekly = streakType === "weekly" || streakType === "custom"
  const streakUnit = isWeekly ? "주" : "일"
  const weeklyWatchCount = streakData?.weekly_watch_count ?? 0
  const weeklyGoal = streakData?.streak_min_days ?? 1

  const currentType: StreakType = streakData?.streak_type === "weekly" ? "weekly" : "daily"
  const currentMinDays = streakData?.streak_min_days ?? 1
  const hasChanges = editStreakType !== currentType || (editStreakType === "weekly" && editMinDays !== currentMinDays)
  const weeklyProgressPercent = weeklyGoal > 0 ? Math.min(100, Math.round((weeklyWatchCount / weeklyGoal) * 100)) : 0

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={NOIR_TEXT_PRIMARY} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => setShowHelp(true)}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="help-circle-outline" size={24} color={NOIR_TEXT_PRIMARY} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* === Hero Section === */}
        <View style={styles.heroSection}>
          <View style={styles.heroBadge}>
            <Ionicons name="ticket-outline" size={14} color={NOIR_ACCENT_STRONG} />
            <Text style={styles.heroBadgeText}>연속 기록</Text>
          </View>
          <Text style={styles.heroNumber}>{currentStreak}<Text style={styles.heroUnit}>{streakUnit}</Text></Text>
          <Text style={styles.heroLabel}>지금 이어가는 시청 흐름</Text>
          {currentStreak > 0 && streakData?.current_streak_start && (
            <Text style={styles.heroDateRange}>
              {formatDateDisplay(streakData.current_streak_start)} ~ {formatDateDisplay(streakData.current_streak_end)}
            </Text>
          )}
        </View>

        {/* === Mini Stat Cards === */}
        <View style={styles.miniCardRow}>
          <View style={styles.miniCard}>
            <Ionicons name="trophy-outline" size={20} color={NOIR_ACCENT_STRONG} />
            <Text style={styles.miniCardValue}>{longestStreak}{streakUnit}</Text>
            <Text style={styles.miniCardLabel}>최장 기록</Text>
          </View>
          {isWeekly ? (
            <View style={styles.miniCard}>
              <Ionicons name="bar-chart-outline" size={20} color={PROGRESS_BAR_COLOR} />
              <Text style={styles.miniCardValue}>{weeklyWatchCount}/{weeklyGoal}<Text style={styles.miniCardValueUnit}>일</Text></Text>
              <Text style={styles.miniCardLabel}>이번 주</Text>
            </View>
          ) : (
            <View style={styles.miniCard}>
              <Ionicons name="calendar-outline" size={20} color={TODAY_COLOR} />
              <Text style={styles.miniCardValue}>일간</Text>
              <Text style={styles.miniCardLabel}>기록 방식</Text>
            </View>
          )}
        </View>

        {/* Weekly Progress Bar */}
        {isWeekly && (
          <View style={styles.progressSection}>
            <View style={styles.progressMetaRow}>
              <Text style={styles.progressMetaLabel}>이번 주 달성률</Text>
              <Text style={styles.progressMetaValue}>{weeklyProgressPercent}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${weeklyProgressPercent}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* === Tab Bar === */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "calendar" && styles.tabItemActive]}
            onPress={() => handleTabChange("calendar")}
          >
            <Ionicons
              name="calendar"
              size={18}
              color={activeTab === "calendar" ? NOIR_ACCENT_STRONG : NOIR_TEXT_SECONDARY}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === "calendar" && styles.tabTextActive]}>달력</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === "settings" && styles.tabItemActive]}
            onPress={() => handleTabChange("settings")}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={activeTab === "settings" ? NOIR_ACCENT_STRONG : NOIR_TEXT_SECONDARY}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === "settings" && styles.tabTextActive]}>설정</Text>
          </TouchableOpacity>
        </View>

        {/* === Tab Content === */}
        {activeTab === "calendar" ? (
          <View style={styles.calendarSection}>
            <View style={styles.monthNav}>
              <Text style={styles.monthLabel}>{formatMonthDisplay(calendarYear, calendarMonth)}</Text>
              <View style={styles.monthNavButtons}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavButton}>
                  <Ionicons name="chevron-back" size={22} color={NOIR_TEXT_PRIMARY} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNextMonth}
                  style={[styles.monthNavButton, isNextMonthDisabled() && styles.monthNavButtonDisabled]}
                  disabled={isNextMonthDisabled()}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={22}
                    color={isNextMonthDisabled() ? NOIR_TEXT_SUBTLE : NOIR_TEXT_PRIMARY}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {calendarLoading ? (
              <View style={styles.calendarLoading}>
                <ActivityIndicator size="small" color={NOIR_ACCENT_STRONG} />
              </View>
            ) : (
              renderCalendar()
            )}

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={styles.legendBand} />
                <Text style={styles.legendText}>연속 시청</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendToday} />
                <Text style={styles.legendText}>오늘</Text>
              </View>
            </View>
          </View>
        ) : (
          /* Settings Tab */
          <View style={styles.settingsSection}>
            {/* Streak Type */}
            <Text style={styles.settingsLabel}>기록 방식</Text>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segmentButton, editStreakType === "daily" && styles.segmentButtonActive]}
                onPress={() => setEditStreakType("daily")}
              >
                <Ionicons
                  name="today-outline"
                  size={16}
                  color={editStreakType === "daily" ? NOIR_TEXT_PRIMARY : NOIR_TEXT_SECONDARY}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.segmentText, editStreakType === "daily" && styles.segmentTextActive]}>
                  일간
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentButton, editStreakType === "weekly" && styles.segmentButtonActive]}
                onPress={() => setEditStreakType("weekly")}
              >
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={editStreakType === "weekly" ? NOIR_TEXT_PRIMARY : NOIR_TEXT_SECONDARY}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.segmentText, editStreakType === "weekly" && styles.segmentTextActive]}>
                  주간
                </Text>
              </TouchableOpacity>
            </View>

            {/* Description */}
            <View style={styles.descCard}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={NOIR_TEXT_SECONDARY}
                style={{ marginRight: 8, marginTop: 1 }}
              />
              <Text style={styles.descText}>
                {editStreakType === "daily"
                  ? "매일 영화를 시청해야 연속 기록이 유지됩니다."
                  : "일주일에 설정한 일수 이상 시청하면 연속 기록이 유지됩니다."
                }
              </Text>
            </View>

            {/* Min Days */}
            {editStreakType === "weekly" && (
              <>
                <Text style={styles.settingsLabel}>주간 최소 시청 일수</Text>
                <View style={styles.daysGrid}>
                  {MIN_DAYS_OPTIONS.map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[styles.dayChip, editMinDays === num && styles.dayChipActive]}
                      onPress={() => setEditMinDays(num)}
                    >
                      <Text style={[styles.dayChipText, editMinDays === num && styles.dayChipTextActive]}>
                        {num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Save */}
            {hasChanges && (
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveSettings}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={NOIR_TEXT_PRIMARY} />
                ) : (
                  <Text style={styles.saveButtonText}>적용</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Help Bottom Sheet */}
      <Modal
        visible={showHelp}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHelp(false)}
      >
        <Pressable style={styles.helpOverlay} onPress={() => setShowHelp(false)}>
          <Pressable style={styles.helpSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.helpHandle} />
            <View style={styles.helpHeader}>
              <Ionicons name="help-circle" size={28} color={NOIR_ACCENT_STRONG} />
              <Text style={styles.helpTitle}>연속 기록이란?</Text>
            </View>
            <View style={styles.helpDivider} />
            {(streakData?.streak_type ?? "daily") !== "daily" ? (
              <>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    매주 {streakData?.streak_min_days ?? 1}일 이상 영화를 시청하면 연속 기록이 이어집니다.
                  </Text>
                </View>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    한 주라도 목표 일수를 채우지 못하면 기록이 끊기고 다시 1주차부터 시작됩니다.
                  </Text>
                </View>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    주(월~일) 단위로 계산되며, 어떤 요일에 보든 상관없이 일수만 채우면 됩니다.
                  </Text>
                </View>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    설정 탭에서 주간 최소 시청 일수를 변경할 수 있습니다.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    하루에 영화를 1편 이상 시청하면 그 날의 기록이 인정됩니다.
                  </Text>
                </View>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    연속으로 매일 시청하면 기록이 계속 쌓여갑니다.
                  </Text>
                </View>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    하루라도 시청하지 않으면 기록이 끊기고 다시 1일차부터 시작됩니다.
                  </Text>
                </View>
                <View style={styles.helpRow}>
                  <Text style={styles.helpDot}>{'  \u2022  '}</Text>
                  <Text style={styles.helpText}>
                    매일 보기 어렵다면 설정 탭에서 주간 모드로 변경해보세요.
                  </Text>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.helpCloseButton} onPress={() => setShowHelp(false)}>
              <Text style={styles.helpCloseText}>확인</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NOIR_BG,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: NOIR_TEXT_SECONDARY,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: NOIR_TEXT_SECONDARY,
    marginTop: 16,
    fontSize: 16,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    backgroundColor: NOIR_SURFACE,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  retryText: {
    color: NOIR_ACCENT_STRONG,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: NOIR_SURFACE,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    borderRadius: 20,
    marginLeft: 8,
  },

  // === Hero ===
  heroSection: {
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 14,
    backgroundColor: NOIR_SURFACE,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    borderRadius: 20,
    paddingTop: 14,
    paddingBottom: 24,
    paddingHorizontal: 18,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(212,175,55,0.14)",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.36)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: NOIR_ACCENT_STRONG,
  },
  heroNumber: {
    fontSize: 64,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: NOIR_TEXT_PRIMARY,
    marginTop: 2,
  },
  heroUnit: {
    fontSize: 24,
    fontWeight: "700",
    color: NOIR_ACCENT_STRONG,
  },
  heroLabel: {
    fontSize: 15,
    color: NOIR_TEXT_SECONDARY,
    marginTop: 2,
  },
  heroDateRange: {
    fontSize: 13,
    color: NOIR_TEXT_SUBTLE,
    marginTop: 8,
  },

  // === Mini Cards ===
  miniCardRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  miniCard: {
    flex: 1,
    backgroundColor: NOIR_SURFACE_ALT,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 7,
  },
  miniCardValue: {
    fontSize: 22,
    fontWeight: "800",
    color: NOIR_TEXT_PRIMARY,
  },
  miniCardValueUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: NOIR_TEXT_SECONDARY,
  },
  miniCardLabel: {
    fontSize: 12,
    color: NOIR_TEXT_SECONDARY,
  },

  // === Progress ===
  progressSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  progressMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressMetaLabel: {
    fontSize: 12,
    color: NOIR_TEXT_SECONDARY,
    fontWeight: "600",
  },
  progressMetaValue: {
    fontSize: 12,
    color: NOIR_ACCENT_STRONG,
    fontWeight: "800",
  },
  progressBarBg: {
    height: 7,
    backgroundColor: "rgba(167,173,192,0.22)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: PROGRESS_BAR_COLOR,
    borderRadius: 4,
  },

  // === Tabs ===
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: NOIR_SURFACE,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabItemActive: {
    backgroundColor: "rgba(212,175,55,0.14)",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: NOIR_TEXT_SECONDARY,
  },
  tabTextActive: {
    color: NOIR_ACCENT_STRONG,
  },

  // === Calendar ===
  calendarSection: {
    marginHorizontal: 20,
    backgroundColor: NOIR_SURFACE,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    borderRadius: 18,
    padding: CALENDAR_PADDING,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: NOIR_TEXT_PRIMARY,
  },
  monthNavButtons: {
    flexDirection: "row",
    gap: 8,
  },
  monthNavButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
  },
  monthNavButtonDisabled: {
    opacity: 0.4,
  },
  calendarLoading: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  calendarGrid: {},
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekdayCell: {
    width: CELL_SIZE,
    alignItems: "center",
    paddingVertical: 4,
  },
  weekdayLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: NOIR_TEXT_SECONDARY,
  },
  weekRow: {
    flexDirection: "row",
    height: ROW_HEIGHT,
    position: "relative",
    alignItems: "center",
  },
  streakBand: {
    position: "absolute",
    backgroundColor: STREAK_HIGHLIGHT,
    zIndex: 0,
  },
  dayCell: {
    width: CELL_SIZE,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  todayCircle: {
    position: "absolute",
    width: CELL_SIZE * 0.78,
    height: CELL_SIZE * 0.78,
    borderRadius: CELL_SIZE * 0.39,
    backgroundColor: TODAY_BG,
  },
  watchDot: {
    position: "absolute",
    top: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(212,175,55,0.72)",
  },
  dayText: {
    fontSize: 15,
    color: NOIR_TEXT_PRIMARY,
    fontWeight: "700",
    zIndex: 1,
  },
  dayTextPrevMonth: {
    color: PREV_MONTH_COLOR,
  },
  dayTextSunday: {
    color: SUNDAY_COLOR,
  },
  dayTextStreak: {
    fontWeight: "800",
    color: NOIR_TEXT_PRIMARY,
  },
  dayTextToday: {
    color: TODAY_COLOR,
    fontWeight: "800",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: NOIR_BORDER,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendBand: {
    width: 24,
    height: 12,
    borderRadius: 6,
    backgroundColor: STREAK_HIGHLIGHT,
  },
  legendToday: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: TODAY_BG,
  },
  legendText: {
    fontSize: 12,
    color: NOIR_TEXT_SECONDARY,
  },

  // === Settings Tab ===
  settingsSection: {
    marginHorizontal: 20,
    backgroundColor: NOIR_SURFACE,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    borderRadius: 18,
    padding: 20,
  },
  settingsLabel: {
    fontSize: 13,
    color: NOIR_TEXT_SECONDARY,
    fontWeight: "600",
    marginBottom: 10,
  },
  segmentRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
  },
  segmentButtonActive: {
    backgroundColor: "rgba(212,175,55,0.14)",
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "700",
    color: NOIR_TEXT_SECONDARY,
  },
  segmentTextActive: {
    color: NOIR_TEXT_PRIMARY,
  },
  descCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    padding: 14,
    marginBottom: 20,
  },
  descText: {
    flex: 1,
    fontSize: 13,
    color: NOIR_TEXT_SECONDARY,
    lineHeight: 19,
  },
  daysGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: NOIR_BORDER,
    justifyContent: "center",
    alignItems: "center",
  },
  dayChipActive: {
    backgroundColor: "rgba(212,175,55,0.2)",
    borderColor: "rgba(212,175,55,0.42)",
  },
  dayChipText: {
    fontSize: 15,
    fontWeight: "700",
    color: NOIR_TEXT_SECONDARY,
  },
  dayChipTextActive: {
    color: NOIR_TEXT_PRIMARY,
  },
  saveButton: {
    backgroundColor: NOIR_ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: NOIR_TEXT_PRIMARY,
  },

  // === Help Bottom Sheet ===
  helpOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.66)",
    justifyContent: "flex-end",
  },
  helpSheet: {
    backgroundColor: NOIR_SURFACE,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: NOIR_BORDER,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
  },
  helpHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 16,
  },
  helpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: NOIR_TEXT_PRIMARY,
  },
  helpDivider: {
    height: 1,
    backgroundColor: NOIR_BORDER,
    marginBottom: 16,
  },
  helpRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  helpDot: {
    fontSize: 14,
    color: NOIR_ACCENT_STRONG,
    lineHeight: 20,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: NOIR_TEXT_SECONDARY,
    lineHeight: 20,
  },
  helpCloseButton: {
    backgroundColor: NOIR_ACCENT,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  helpCloseText: {
    fontSize: 15,
    fontWeight: "800",
    color: NOIR_TEXT_PRIMARY,
  },
})
