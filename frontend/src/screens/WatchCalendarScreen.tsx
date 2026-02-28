import { useState, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import { getCalendarData } from "../services/statsService"
import type { CalendarData, CalendarDay, RootStackParamList } from "../types"
import CalendarDownloadModal from "../components/CalendarDownloadModal"

// Optional packages - gracefully handle if not installed
let AsyncStorage: any = null
try { AsyncStorage = require("@react-native-async-storage/async-storage").default } catch (_) {}

type PosterMode = "single" | "split"
type WeekStart = "monday" | "sunday"

const STORAGE_KEYS = {
  posterMode: "@filmory/calendar_poster_mode",
  weekStart: "@filmory/calendar_week_start",
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

type WatchCalendarNavigationProp = NativeStackNavigationProp<RootStackParamList>

const { width } = Dimensions.get("window")
const CELL_SIZE = Math.floor((width - 40 - 12) / 7) // 7 columns, 20px padding each side, 12px gap

const DAY_LABELS_MONDAY = ["월", "화", "수", "목", "금", "토", "일"]
const DAY_LABELS_SUNDAY = ["일", "월", "화", "수", "목", "금", "토"]

export default function WatchCalendarScreen() {
  const navigation = useNavigation<WatchCalendarNavigationProp>()
  const insets = useSafeAreaInsets()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-based
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [posterMode, setPosterMode] = useState<PosterMode>("single")
  const [weekStart, setWeekStart] = useState<WeekStart>("monday")

  const dayLabels = weekStart === "sunday" ? DAY_LABELS_SUNDAY : DAY_LABELS_MONDAY

  const loadSettings = useCallback(async () => {
    const savedPosterMode = await loadStorage(STORAGE_KEYS.posterMode)
    if (savedPosterMode === "single" || savedPosterMode === "split") {
      setPosterMode(savedPosterMode)
    }
    const savedWeekStart = await loadStorage(STORAGE_KEYS.weekStart)
    if (savedWeekStart === "monday" || savedWeekStart === "sunday") {
      setWeekStart(savedWeekStart)
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getCalendarData(year, month)
      setCalendarData(data)
    } catch (error) {
      console.error("❌ WatchCalendarScreen 데이터 로드 실패:", error)
      setCalendarData({ year, month, days: [] })
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useFocusEffect(
    useCallback(() => {
      loadSettings()
      loadData()
    }, [loadSettings, loadData])
  )

  const goToPrevMonth = () => {
    if (month === 1) {
      setYear(y => y - 1)
      setMonth(12)
    } else {
      setMonth(m => m - 1)
    }
  }

  const goToNextMonth = () => {
    const nextYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    const isAfterNow = nextYear > now.getFullYear() || (nextYear === now.getFullYear() && nextMonth > now.getMonth() + 1)
    if (isAfterNow) return
    if (month === 12) {
      setYear(y => y + 1)
      setMonth(1)
    } else {
      setMonth(m => m + 1)
    }
  }

  const handleDownload = () => {
    setShowDownloadModal(true)
  }

  // Build calendar grid
  const buildCalendarGrid = (): (CalendarDay | null)[][] => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const jsDay = new Date(year, month - 1, 1).getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const firstDayOffset = weekStart === "sunday"
      ? jsDay // Sun=0, Mon=1, ..., Sat=6
      : (jsDay === 0 ? 6 : jsDay - 1) // Mon=0, Tue=1, ..., Sun=6

    const dayMap = new Map<string, CalendarDay>()
    if (calendarData) {
      for (const day of calendarData.days) {
        dayMap.set(day.date, day)
      }
    }

    const cells: (CalendarDay | null)[] = []
    for (let i = 0; i < firstDayOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      cells.push(dayMap.get(dateStr) ?? { date: dateStr, movie_count: 0, movies: [] })
    }
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null)

    const rows: (CalendarDay | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }

  const isToday = (dateStr: string) => {
    const t = new Date()
    return (
      dateStr ===
      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
    )
  }

  const isFuture = (dateStr: string) => {
    return dateStr > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  }

  const rows = buildCalendarGrid()
  const isNextDisabled =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1)

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => navigation.navigate("WatchCalendarSettings")} style={styles.headerIconButton}>
          <Ionicons name="options-outline" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDownload} style={styles.headerIconButton}>
          <Ionicons name="download-outline" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Page Title */}
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>시청 달력</Text>
          <Text style={styles.pageSubtitle}>이번 달은 얼마나 보셨나요?</Text>
        </View>

        {/* Calendar wrapper */}
        <View style={styles.calendarWrapper}>
            {/* Month Navigation */}
            <View style={styles.monthNav}>
              <Text style={styles.monthTitle}>
                {year}. {month}.
              </Text>
              <View style={styles.monthNavButtons}>
                <TouchableOpacity onPress={goToPrevMonth} style={styles.navButton}>
                  <Ionicons name="chevron-back" size={22} color={COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={goToNextMonth}
                  style={[styles.navButton, isNextDisabled && styles.navButtonDisabled]}
                  disabled={isNextDisabled}
                >
                  <Ionicons name="chevron-forward" size={22} color={isNextDisabled ? COLORS.lightGray : COLORS.white} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Day Labels */}
            <View style={styles.dayLabelRow}>
              {dayLabels.map((label) => (
                <Text
                  key={label}
                  style={[
                    styles.dayLabel,
                    label === "일" && styles.sundayLabel,
                    label === "토" && styles.saturdayLabel,
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.gold} />
              </View>
            ) : (
              <View style={styles.grid}>
                {rows.map((row, rowIdx) => (
                  <View key={rowIdx} style={styles.row}>
                    {row.map((cell, colIdx) => {
                      if (!cell) {
                        return <View key={colIdx} style={styles.emptyCell} />
                      }
                      const dayNum = parseInt(cell.date.split("-")[2], 10)
                      const hasMovie = cell.movie_count > 0
                      const future = isFuture(cell.date)
                      const today = isToday(cell.date)
                      const poster = cell.movies?.[0]?.poster_url
                      const dayLabel = dayLabels[colIdx]
                      const isSunday = dayLabel === "일"
                      const isSaturday = dayLabel === "토"

                      // Split poster rendering
                      const showSplit = posterMode === "split" && hasMovie && cell.movie_count >= 2
                      const movies = cell.movies || []

                      return (
                        <View
                          key={colIdx}
                          style={[
                            styles.cell,
                            today && styles.todayCell,
                            hasMovie && styles.hasMovieCell,
                          ]}
                        >
                          {hasMovie && !showSplit && poster ? (
                            <>
                              <Image source={{ uri: poster }} style={styles.posterImage} />
                              <View style={styles.posterOverlay} />
                            </>
                          ) : null}

                          {showSplit && cell.movie_count === 2 ? (
                            <>
                              <View style={styles.splitRow}>
                                {movies.slice(0, 2).map((m, i) => (
                                  <View key={m.id ?? i} style={styles.splitHalf}>
                                    {m.poster_url ? (
                                      <Image source={{ uri: m.poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: COLORS.deepGray }]} />
                                    )}
                                  </View>
                                ))}
                              </View>
                              <View style={styles.posterOverlay} />
                            </>
                          ) : null}

                          {showSplit && cell.movie_count === 3 ? (
                            <>
                              <View style={styles.splitRow}>
                                <View style={styles.splitHalf}>
                                  {movies[0]?.poster_url ? (
                                    <Image source={{ uri: movies[0].poster_url }} style={styles.splitImage} />
                                  ) : (
                                    <View style={[styles.splitImage, { backgroundColor: COLORS.deepGray }]} />
                                  )}
                                </View>
                                <View style={styles.splitHalf}>
                                  <View style={{ flex: 1, overflow: "hidden" }}>
                                    {movies[1]?.poster_url ? (
                                      <Image source={{ uri: movies[1].poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: COLORS.deepGray }]} />
                                    )}
                                  </View>
                                  <View style={{ flex: 1, overflow: "hidden" }}>
                                    {movies[2]?.poster_url ? (
                                      <Image source={{ uri: movies[2].poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: COLORS.deepGray }]} />
                                    )}
                                  </View>
                                </View>
                              </View>
                              <View style={styles.posterOverlay} />
                            </>
                          ) : null}

                          {showSplit && cell.movie_count >= 4 ? (
                            <>
                              <View style={styles.splitGrid}>
                                {movies.slice(0, 4).map((m, i) => (
                                  <View key={m.id ?? i} style={styles.splitQuarter}>
                                    {m.poster_url ? (
                                      <Image source={{ uri: m.poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: COLORS.deepGray }]} />
                                    )}
                                  </View>
                                ))}
                              </View>
                              <View style={styles.posterOverlay} />
                            </>
                          ) : null}

                          <Text
                            style={[
                              styles.dayNum,
                              isSunday && styles.sundayNum,
                              isSaturday && styles.saturdayNum,
                              future && styles.futureNum,
                              today && styles.todayNum,
                              hasMovie && styles.hasMovieDayNum,
                            ]}
                          >
                            {dayNum}
                          </Text>

                          {cell.movie_count > 1 && posterMode === "single" && (
                            <View style={styles.countBadge}>
                              <Text style={styles.countBadgeText}>{cell.movie_count}</Text>
                            </View>
                          )}

                          {hasMovie && (
                            <View style={styles.watchedDot} />
                          )}
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            )}

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.gold }]} />
                <Text style={styles.legendText}>시청 기록</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: COLORS.gold }]} />
                <Text style={styles.legendText}>오늘</Text>
              </View>
            </View>
          </View>

        {/* Monthly Summary */}
        {!loading && calendarData && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{month}월 요약</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {calendarData.days.filter(d => d.movie_count > 0).length}
                </Text>
                <Text style={styles.summaryLabel}>시청한 날</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {calendarData.days.reduce((sum, d) => sum + d.movie_count, 0)}
                </Text>
                <Text style={styles.summaryLabel}>총 시청 편수</Text>
              </View>
            </View>
          </View>
        )}

        {/* Movie List for the Month */}
        {!loading && calendarData && calendarData.days.some(d => d.movie_count > 0) && (
          <View style={styles.movieListSection}>
            <Text style={styles.movieListTitle}>{month}월 시청 영화</Text>
            {calendarData.days
              .filter(d => d.movie_count > 0)
              .map(day => (
                <View key={day.date} style={styles.movieListDay}>
                  <Text style={styles.movieListDate}>
                    {parseInt(day.date.split("-")[2], 10)}일
                  </Text>
                  <View style={styles.movieListMovies}>
                    {day.movies?.map(movie => (
                      <View key={movie.id} style={styles.movieListItem}>
                        {movie.poster_url ? (
                          <Image source={{ uri: movie.poster_url }} style={styles.movieListPoster} />
                        ) : (
                          <View style={[styles.movieListPoster, styles.movieListPosterEmpty]}>
                            <Ionicons name="film-outline" size={14} color={COLORS.lightGray} />
                          </View>
                        )}
                        <Text style={styles.movieListMovieTitle} numberOfLines={1}>
                          {movie.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      <CalendarDownloadModal
        visible={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        calendarData={calendarData}
        year={year}
        month={month}
        posterMode={posterMode}
        weekStart={weekStart}
      />
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
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
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  calendarWrapper: {
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    marginTop: 8,
  },
  monthNavButtons: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  dayLabelRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  dayLabel: {
    width: CELL_SIZE,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.lightGray,
  },
  sundayLabel: {
    color: COLORS.sundayRed,
  },
  saturdayLabel: {
    color: COLORS.saturdayBlue,
  },
  loadingContainer: {
    height: 300,
    justifyContent: "center",
    alignItems: "center",
  },
  grid: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 2,
  },
  emptyCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 6,
    backgroundColor: COLORS.deepGray,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    backgroundColor: "rgba(212,175,55,0.1)",
  },
  hasMovieCell: {
    backgroundColor: COLORS.deepGray,
  },
  posterImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: 6,
  },
  posterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 6,
  },
  dayNum: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.white,
    zIndex: 1,
  },
  sundayNum: {
    color: COLORS.sundayRed,
  },
  saturdayNum: {
    color: COLORS.saturdayBlue,
  },
  futureNum: {
    color: COLORS.mediumGray,
  },
  todayNum: {
    color: COLORS.gold,
    fontWeight: "800",
  },
  hasMovieDayNum: {
    color: COLORS.white,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  countBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    zIndex: 2,
  },
  countBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: COLORS.darkNavy,
  },
  watchedDot: {
    position: "absolute",
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.gold,
    zIndex: 2,
  },
  splitRow: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    flexDirection: "row",
  },
  splitHalf: {
    flex: 1,
    overflow: "hidden",
  },
  splitGrid: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  splitQuarter: {
    width: "50%",
    height: "50%",
    overflow: "hidden",
  },
  splitImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  legend: {
    flexDirection: "row",
    gap: 20,
    marginTop: 12,
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.gold,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  movieListSection: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  movieListTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },
  movieListDay: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  movieListDate: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.gold,
    minWidth: 28,
    paddingTop: 2,
  },
  movieListMovies: {
    flex: 1,
    gap: 8,
  },
  movieListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  movieListPoster: {
    width: 32,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.darkNavy,
  },
  movieListPosterEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  movieListMovieTitle: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    fontWeight: "500",
  },
  bottomPadding: {
    height: 100,
  },
})
