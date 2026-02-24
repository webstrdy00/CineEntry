import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getStreakData, getStreakDates } from "../services/statsService"
import type { StreakData, StreakDates } from "../services/statsService"

type StreakDetailNavigationProp = NativeStackNavigationProp<RootStackParamList>

const FIRE_COLOR = "#FF6B35"
const STREAK_HIGHLIGHT = "rgba(93,173,226,0.25)"
const TODAY_BG = "rgba(93,173,226,0.35)"
const TODAY_COLOR = "#5DADE2"
const PROGRESS_BAR_COLOR = "#3B82F6"
const PREV_MONTH_COLOR = "rgba(160,160,160,0.35)"

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const CALENDAR_PADDING = 16
const CALENDAR_WIDTH = SCREEN_WIDTH - 40 - CALENDAR_PADDING * 2
const CELL_SIZE = Math.floor(CALENDAR_WIDTH / 7)
const ROW_HEIGHT = CELL_SIZE

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]

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

  const today = new Date()
  const [calendarYear, setCalendarYear] = useState(today.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1)

  const [streakData, setStreakData] = useState<StreakData | null>(null)
  const [streakDates, setStreakDates] = useState<StreakDates | null>(null)
  const [loading, setLoading] = useState(true)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [error, setError] = useState(false)

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
      Alert.alert("오류", "날짜 데이터를 불러오지 못했습니다.")
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

  const watchDatesSet = new Set(streakDates?.dates ?? [])
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate())

  // For weekly mode
  const streakType_ = streakData?.streak_type ?? "daily"
  const isWeeklyMode = streakType_ === "weekly" || streakType_ === "custom"
  const minDays = streakData?.streak_min_days ?? 1

  // Build qualifying weeks for weekly mode
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

  // For daily mode: determine if a date is part of a consecutive streak
  // Returns { inStreak, isFirst, isLast } for band rendering
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

    // Row boundaries force start/end
    const isRowStart = dayIdx === 0
    const isRowEnd = dayIdx === 6

    const isFirst = !hasPrev || isRowStart
    const isLast = !hasNext || isRowEnd

    return { inStreak: true, isFirst, isLast }
  }

  // For weekly mode: determine band info based on qualifying weeks
  // Highlights the entire week (Mon-Sun) if the week qualifies
  // Connects across rows if consecutive weeks both qualify
  const getWeeklyBandInfo = (year: number, month: number, day: number, dayIdx: number): { inStreak: boolean; isFirst: boolean; isLast: boolean } => {
    const weekKey = getISOWeekKey(year, month, day)
    if (!qualifyingWeeks.has(weekKey)) {
      return { inStreak: false, isFirst: false, isLast: false }
    }

    // Check if the previous week and next week also qualify
    const prevWeekDay = new Date(year, month - 1, day - 7)
    const nextWeekDay = new Date(year, month - 1, day + 7)
    const prevWeekKey = getISOWeekKey(prevWeekDay.getFullYear(), prevWeekDay.getMonth() + 1, prevWeekDay.getDate())
    const nextWeekKey = getISOWeekKey(nextWeekDay.getFullYear(), nextWeekDay.getMonth() + 1, nextWeekDay.getDate())
    const prevWeekQualifies = qualifyingWeeks.has(prevWeekKey)
    const nextWeekQualifies = qualifyingWeeks.has(nextWeekKey)

    // Monday (dayIdx=0) is the start of the week band
    // Sunday (dayIdx=6) is the end of the week band
    // If prev/next week also qualifies, don't round the edges (connect across rows)
    const isFirst = dayIdx === 0 && !prevWeekQualifies
    const isLast = dayIdx === 6 && !nextWeekQualifies

    return { inStreak: true, isFirst, isLast }
  }

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth)
    const firstDayOffset = getFirstDayOfWeek(calendarYear, calendarMonth)

    // Build cells with prev month fill
    const prevMonth = calendarMonth === 1 ? 12 : calendarMonth - 1
    const prevYear = calendarMonth === 1 ? calendarYear - 1 : calendarYear
    const prevMonthDays = getDaysInMonth(prevYear, prevMonth)

    type CellData = { day: number; year: number; month: number; isCurrentMonth: boolean }
    const cells: CellData[] = []

    // Previous month trailing days
    for (let i = firstDayOffset - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, year: prevYear, month: prevMonth, isCurrentMonth: false })
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, year: calendarYear, month: calendarMonth, isCurrentMonth: true })
    }
    // Next month leading days
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
        {/* Weekday headers */}
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, idx) => (
            <View key={idx} style={styles.weekdayCell}>
              <Text
                style={[
                  styles.weekdayLabel,
                  idx === 6 && { color: "#e74c3c" },
                ]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        {/* Weeks */}
        {weeks.map((week, weekIdx) => {
          // Determine which cells in this row have a streak band
          const bandInfos = week.map((cell, dayIdx) => {
            const dateStr = formatDateStr(cell.year, cell.month, cell.day)
            if (isWeeklyMode) {
              return getWeeklyBandInfo(cell.year, cell.month, cell.day, dayIdx)
            }
            return getDailyBandInfo(dateStr, dayIdx)
          })

          // Find contiguous streak segments in this row for band rendering
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

          // Determine if segment connects to prev/next row
          const segmentMeta = segments.map((seg) => {
            const firstCell = week[seg.startIdx]
            const lastCell = week[seg.endIdx]
            const firstDateStr = formatDateStr(firstCell.year, firstCell.month, firstCell.day)
            const lastDateStr = formatDateStr(lastCell.year, lastCell.month, lastCell.day)

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
              {/* Band backgrounds */}
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

              {/* Day cells */}
              {week.map((cell, dayIdx) => {
                const dateStr = formatDateStr(cell.year, cell.month, cell.day)
                const isToday = dateStr === todayStr
                const isSunday = dayIdx === 6
                const isWatched = watchDatesSet.has(dateStr)
                const bandInfo = bandInfos[dayIdx]

                return (
                  <View key={dayIdx} style={styles.dayCell}>
                    {/* Today circle background */}
                    {isToday && <View style={styles.todayCircle} />}
                    {/* Watch dot indicator */}
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
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.lightGray} />
        <Text style={styles.errorText}>데이터를 불러올 수 없습니다</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Ionicons name="refresh" size={18} color={COLORS.gold} />
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
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => {
            const isWeeklyHelp = (streakData?.streak_type ?? "daily") !== "daily"
            const title = "연속 기록이란?"
            const message = isWeeklyHelp
              ? `매주 설정한 최소 일수 이상 영화를 시청하면 연속 기록이 유지됩니다.\n\n현재 설정: 주 ${streakData?.streak_min_days ?? 1}일 이상 시청\n\n한 주라도 목표를 달성하지 못하면 연속 기록이 끊깁니다.\n\n설정 버튼에서 목표 일수를 변경할 수 있습니다.`
              : "매일 영화를 시청하면 연속 기록이 유지됩니다.\n\n하루라도 시청하지 않으면 연속 기록이 끊깁니다.\n\n설정 버튼에서 주간 모드로 변경하면 좀 더 유연하게 연속 기록을 유지할 수 있습니다."
            if (Platform.OS === "web") {
              alert(`${title}\n\n${message}`)
            } else {
              Alert.alert(title, message, [{ text: "확인" }])
            }
          }}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="help-circle-outline" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("StreakSettings")}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="options-outline" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Page Title */}
        <Text style={styles.pageTitle}>연속 기록</Text>

        {/* Current Streak Card */}
        <View style={styles.streakCard}>
          <Text style={styles.streakCardLabel}>현재 연속 기록</Text>
          <View style={styles.streakIconRow}>
            <Ionicons name="flame" size={30} color={FIRE_COLOR} />
            <Text style={styles.streakValue}>{currentStreak}{streakUnit}</Text>
          </View>
          {currentStreak > 0 && streakData?.current_streak_start && (
            <View style={styles.dateRangeRow}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {formatDateDisplay(streakData.current_streak_start)}
                </Text>
              </View>
              <Text style={styles.dateRangeSeparator}>-</Text>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {formatDateDisplay(streakData.current_streak_end)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Weekly Progress Bar (only for weekly mode) */}
        {isWeekly && (
          <View style={styles.weeklyProgressCard}>
            <Text style={styles.weeklyProgressText}>
              이번 주에 {weeklyWatchCount}일 봤어요. (목표: {weeklyGoal}일)
            </Text>
            <View style={styles.weeklyProgressBarBg}>
              <View
                style={[
                  styles.weeklyProgressBarFill,
                  { width: `${Math.min(100, (weeklyWatchCount / weeklyGoal) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* Longest Streak Card */}
        <View style={styles.streakCard}>
          <Text style={styles.streakCardLabel}>최장 연속 기록</Text>
          <View style={styles.streakIconRow}>
            <Ionicons name="trophy" size={28} color={COLORS.gold} />
            <Text style={[styles.streakValue, { color: COLORS.gold }]}>{longestStreak}{streakUnit}</Text>
          </View>
          {longestStreak > 0 && streakData?.longest_streak_start && (
            <View style={styles.dateRangeRow}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {formatDateDisplay(streakData.longest_streak_start)}
                </Text>
              </View>
              <Text style={styles.dateRangeSeparator}>-</Text>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>
                  {formatDateDisplay(streakData.longest_streak_end)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Calendar Section Title */}
        <View style={styles.calendarTitleRow}>
          <Text style={styles.calendarTitle}>연속 기록 달력</Text>
          <View style={styles.calendarTitleLine} />
        </View>

        {/* Calendar Section */}
        <View style={styles.calendarSection}>
          {/* Month navigation */}
          <View style={styles.monthNav}>
            <Text style={styles.monthLabel}>{formatMonthDisplay(calendarYear, calendarMonth)}</Text>
            <View style={styles.monthNavButtons}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavButton}>
                <Ionicons name="chevron-back" size={22} color={COLORS.white} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={[styles.monthNavButton, isNextMonthDisabled() && styles.monthNavButtonDisabled]}
                disabled={isNextMonthDisabled()}
              >
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={isNextMonthDisabled() ? COLORS.mediumGray : COLORS.white}
                />
              </TouchableOpacity>
            </View>
          </View>

          {calendarLoading ? (
            <View style={styles.calendarLoading}>
              <ActivityIndicator size="small" color={COLORS.gold} />
            </View>
          ) : (
            renderCalendar()
          )}

          {/* Legend */}
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
  loadingText: {
    color: COLORS.lightGray,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: COLORS.lightGray,
    marginTop: 16,
    fontSize: 16,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    backgroundColor: COLORS.deepGray,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  retryText: {
    color: COLORS.gold,
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
    backgroundColor: COLORS.deepGray,
    borderRadius: 20,
    marginLeft: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  streakCard: {
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
  },
  streakCardLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
    fontWeight: "500",
    marginBottom: 8,
  },
  streakIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streakValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: FIRE_COLOR,
  },
  dateRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  dateBadge: {
    backgroundColor: "rgba(160,160,160,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dateBadgeText: {
    fontSize: 13,
    color: COLORS.lightGray,
    fontWeight: "500",
  },
  dateRangeSeparator: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  weeklyProgressCard: {
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
  },
  weeklyProgressText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "500",
    marginBottom: 12,
  },
  weeklyProgressBarBg: {
    height: 8,
    backgroundColor: "rgba(160,160,160,0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  weeklyProgressBarFill: {
    height: "100%",
    backgroundColor: PROGRESS_BAR_COLOR,
    borderRadius: 4,
  },
  calendarTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  calendarTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
  },
  calendarTitleLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(160,160,160,0.3)",
  },
  calendarSection: {
    marginHorizontal: 20,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
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
    fontWeight: "700",
    color: COLORS.white,
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
    fontWeight: "600",
    color: COLORS.lightGray,
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
    backgroundColor: "rgba(93,173,226,0.6)",
  },
  dayText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "600",
    zIndex: 1,
  },
  dayTextPrevMonth: {
    color: PREV_MONTH_COLOR,
  },
  dayTextSunday: {
    color: "#e74c3c",
  },
  dayTextStreak: {
    fontWeight: "700",
    color: COLORS.white,
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
    borderTopColor: "rgba(160,160,160,0.1)",
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
    color: COLORS.lightGray,
  },
})
