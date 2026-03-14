import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator, RefreshControl } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { LinearGradient } from "expo-linear-gradient"
import { useState, useCallback } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import { useAlert } from "../components/CustomAlert"
import MovieCard from "../components/MovieCard"
import StatCard from "../components/StatCard"
import type { RootStackParamList } from "../types"
import { getOverallStats, getStreakData } from "../services/statsService"
import { getMovies } from "../services/movieService"
import { updateUserProfile } from "../services/userService"
import { getCollections } from "../services/collectionService"
import { YEARLY_GOAL_MAX, YEARLY_GOAL_MIN } from "../constants/profile"

const { width } = Dimensions.get("window")

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const { showAlert } = useAlert()
  const currentYear = new Date().getFullYear()

  const defaultStats = {
    yearly_goal: 100,
    yearly_progress: 0,
    total_watched: 0,
    current_streak: 0,
    average_rating: 0,
  }

  // State
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [stats, setStats] = useState<any>(defaultStats)
  const [watchingMovies, setWatchingMovies] = useState<any[]>([])
  const [watchlistMovies, setWatchlistMovies] = useState<any[]>([])
  const [collections, setCollections] = useState<any[]>([])
  const [streakData, setStreakData] = useState<any>(null)
  const [isEditingGoal, setIsEditingGoal] = useState(false)
  const [isSavingGoal, setIsSavingGoal] = useState(false)

  const handleGoalStep = async (delta: number) => {
    const currentGoal = stats.yearly_goal || 100
    const nextGoal = Math.max(YEARLY_GOAL_MIN, Math.min(YEARLY_GOAL_MAX, currentGoal + delta))
    if (nextGoal === currentGoal) return
    setStats((prev: any) => ({ ...prev, yearly_goal: nextGoal }))
    try {
      setIsSavingGoal(true)
      await updateUserProfile({ yearly_goal: nextGoal })
    } catch (error) {
      console.error("연간 목표 저장 실패:", error)
      setStats((prev: any) => ({ ...prev, yearly_goal: currentGoal }))
      showAlert("오류", "목표 저장에 실패했습니다.")
    } finally {
      setIsSavingGoal(false)
    }
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(false)

      console.log('📡 HomeScreen: API 호출 시작')

      // API 호출
      const [statsData, watchingData, watchlistData, collectionsData, streakDataResult] = await Promise.all([
        getOverallStats(currentYear).catch((err) => {
          console.error('❌ getOverallStats 실패:', err.message)
          return null
        }),
        getMovies('watching').catch((err) => {
          console.error('❌ getMovies(watching) 실패:', err.message)
          return []
        }),
        getMovies('watchlist').catch((err) => {
          console.error('❌ getMovies(watchlist) 실패:', err.message)
          return []
        }),
        getCollections().catch((err) => {
          console.error('❌ getCollections 실패:', err.message)
          return []
        }),
        getStreakData().catch((err) => {
          console.error('❌ getStreakData 실패:', err.message)
          return null
        }),
      ])

      console.log('✅ HomeScreen: API 호출 완료', { statsData, watchingData, watchlistData, collectionsData, streakDataResult })

      setStats(statsData || defaultStats)
      setWatchingMovies(watchingData)
      setWatchlistMovies(watchlistData)
      setCollections(collectionsData)
      setStreakData(streakDataResult)
    } catch (error: any) {
      console.error('❌ HomeScreen 데이터 로드 실패:', error.message, error)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [currentYear])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  // 홈 화면 포커스 시마다 최신 데이터 재조회
  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  // 로딩 중
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>데이터를 불러오는 중...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.lightGray} />
        <Text style={{ color: COLORS.lightGray, marginTop: 16, fontSize: 16 }}>데이터를 불러올 수 없습니다</Text>
        <TouchableOpacity
          onPress={loadData}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: COLORS.deepGray, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, gap: 6 }}
        >
          <Ionicons name="refresh" size={18} color={COLORS.gold} />
          <Text style={{ color: COLORS.gold, fontWeight: '600' }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // 이번 주 날짜 (월~일) 배열 반환
  const getThisWeekDates = (): Date[] => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ...
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
  }

  const isDateInWatchDates = (date: Date, watchDates: string[]): boolean => {
    const dateStr = date.toISOString().split('T')[0]
    return watchDates.includes(dateStr)
  }

  const thisWeekDates = getThisWeekDates()
  const weekDayLabels = ['월', '화', '수', '목', '금', '토', '일']
  const streakWatchDates: string[] = streakData?.streak_dates || []

  // 연간 목표 데이터
  const yearlyGoal = {
    target: stats.yearly_goal || 100,
    current: stats.yearly_progress || 0,
  }

  const yearlyProgress = yearlyGoal.target > 0
    ? Math.min(100, (yearlyGoal.current / yearlyGoal.target) * 100)
    : 0

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
        }
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={styles.greeting}>어서오세요 :)</Text>
            <Text style={styles.subtitle}>오늘은 무슨 영화를 보셨나요?</Text>
          </View>
        </View>

      {/* Currently Watching Section */}
      {watchingMovies.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>현재 보고 있는 영화</Text>
            <Text style={styles.watchingCount}>{watchingMovies.length}편</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currentMovieList}>
            {watchingMovies.map((watchingMovie) => (
              <TouchableOpacity
                key={watchingMovie.id}
                style={styles.currentMovieCard}
                onPress={() => navigation.navigate("MovieDetail", { id: watchingMovie.id })}
              >
                <LinearGradient colors={[COLORS.deepGray, COLORS.darkNavy]} style={styles.currentMovieGradient}>
                  <View style={styles.currentMovieContent}>
                    <Image source={{ uri: watchingMovie.poster_url || watchingMovie.poster }} style={styles.currentMoviePoster} />
                    <View style={styles.currentMovieInfo}>
                      <Text style={styles.currentMovieLabel}>보는 중</Text>
                      <Text style={styles.currentMovieTitle} numberOfLines={2}>
                        {watchingMovie.title}
                      </Text>
                      <View style={styles.progressContainer}>
                        <Text style={styles.progressText}>
                          {watchingMovie.progress || 0}분 / {watchingMovie.runtime || 0}분
                        </Text>
                        <View style={styles.progressBar}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.min(
                                  100,
                                  ((watchingMovie.progress || 0) / (watchingMovie.runtime || 1)) * 100
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="film-outline" size={40} color={COLORS.lightGray} />
          <Text style={styles.emptyText}>현재 보고 있는 영화가 없습니다</Text>
          <TouchableOpacity onPress={() => navigation.navigate("MovieSearch")}>
            <Text style={styles.emptyLink}>영화 추가하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Yearly Goal Card */}
      <View style={styles.goalCard}>
        <TouchableOpacity style={styles.goalHeader} activeOpacity={0.7} onPress={() => setIsEditingGoal(!isEditingGoal)}>
          <Ionicons name="trophy-outline" size={24} color={COLORS.gold} />
          <Text style={styles.goalTitle}>{currentYear}년 연간 목표</Text>
          <Ionicons name={isEditingGoal ? "chevron-up" : "create-outline"} size={16} color={COLORS.lightGray} style={{ marginLeft: "auto" }} />
        </TouchableOpacity>
        <View style={styles.goalContent}>
          <Text style={styles.goalNumbers}>
            <Text style={styles.goalCurrent}>{yearlyGoal.current}</Text>
            <Text style={styles.goalSeparator}> / </Text>
            <Text style={styles.goalTarget}>{yearlyGoal.target}편</Text>
          </Text>
          <View style={styles.goalProgressBar}>
            <View style={[styles.goalProgressFill, { width: `${yearlyProgress}%` }]} />
          </View>
          <Text style={styles.goalPercentage}>{yearlyProgress.toFixed(0)}% 달성</Text>
        </View>
        {isEditingGoal && (
          <View style={styles.goalStepperRow}>
            <TouchableOpacity style={styles.goalStepperButton} onPress={() => void handleGoalStep(-10)} disabled={isSavingGoal}>
              <Text style={styles.goalStepperButtonText}>-10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.goalStepperButton} onPress={() => void handleGoalStep(-1)} disabled={isSavingGoal}>
              <Text style={styles.goalStepperButtonText}>-1</Text>
            </TouchableOpacity>
            <View style={styles.goalStepperValue}>
              <Text style={styles.goalStepperValueText}>{yearlyGoal.target}</Text>
            </View>
            <TouchableOpacity style={styles.goalStepperButton} onPress={() => void handleGoalStep(1)} disabled={isSavingGoal}>
              <Text style={styles.goalStepperButtonText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.goalStepperButton} onPress={() => void handleGoalStep(10)} disabled={isSavingGoal}>
              <Text style={styles.goalStepperButtonText}>+10</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Stats Section */}
      <View style={styles.statsSection}>
        <StatCard
          title="연속 기록"
          value={`${stats.current_streak || 0}일째`}
          icon="calendar-outline"
          color={COLORS.gold}
        />
        <StatCard
          title="총 관람"
          value={`${stats.total_watched || 0}편`}
          icon="film-outline"
          color={COLORS.gold}
        />
        <StatCard
          title="평균 별점"
          value={(stats.average_rating || 0).toFixed(1)}
          icon="star-outline"
          color={COLORS.gold}
        />
      </View>

        {/* Streak Card */}
        <TouchableOpacity
          style={styles.streakCard}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("StreakDetail")}
        >
          <View style={styles.streakCardHeader}>
            <Ionicons name="flame" size={22} color="#FF6B35" />
            <Text style={styles.streakCardTitle}>연속 기록</Text>
            <Text style={styles.streakCardValue}>
              {streakData
                ? (streakData.streak_type === 'weekly' || streakData.streak_type === 'custom')
                  ? `${streakData.current_streak}주`
                  : `${streakData.current_streak}일째`
                : '0일째'}
            </Text>
          </View>
          <View style={styles.streakWeekRow}>
            {thisWeekDates.map((date, idx) => {
              const checked = isDateInWatchDates(date, streakWatchDates)
              const isSunday = idx === 6
              return (
                <View key={idx} style={styles.streakDayItem}>
                  <Ionicons
                    name={checked ? "checkmark-circle" : "ellipse-outline"}
                    size={28}
                    color={checked ? "#4ECDC4" : COLORS.lightGray}
                  />
                  <Text style={[styles.streakDayLabel, isSunday && styles.streakSundayLabel]}>
                    {weekDayLabels[idx]}
                  </Text>
                </View>
              )
            })}
          </View>
        </TouchableOpacity>

        {/* Watch Calendar Card */}
        <TouchableOpacity
          style={styles.calendarCard}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("WatchCalendar")}
        >
          <View style={styles.calendarCardContent}>
            <View>
              <Text style={styles.calendarCardTitle}>시청 달력</Text>
              <Text style={styles.calendarCardSubtitle}>이번 달은 얼마나 보셨나요?</Text>
            </View>
            <Ionicons name="calendar-outline" size={36} color={COLORS.gold} />
          </View>
        </TouchableOpacity>

        {/* Watchlist Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="bookmark" size={20} color={COLORS.gold} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>보고 싶은 영화</Text>
            </View>
            {watchlistMovies.length > 0 && (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("Main", {
                    screen: "Movies",
                    params: { initialFilter: "watchlist" },
                  })
                }
              >
                <Text style={styles.seeAllText}>더 보기</Text>
              </TouchableOpacity>
            )}
          </View>

          {watchlistMovies.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.movieList}>
              {watchlistMovies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={{ ...movie, status: "watchlist" as const }}
                  onPress={() => navigation.navigate("MovieDetail", { id: movie.id })}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.watchlistEmptyCard}>
              <Ionicons name="bookmark-outline" size={36} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>보고 싶은 영화가 없습니다</Text>
              <TouchableOpacity onPress={() => navigation.navigate("MovieSearch")}>
                <Text style={styles.emptyLink}>영화 추가하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Collections Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="sparkles" size={20} color={COLORS.gold} style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>컬렉션</Text>
            </View>
            {collections.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate("Collections")}>
                <Text style={styles.seeAllText}>더 보기</Text>
              </TouchableOpacity>
            )}
          </View>
          {collections.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collectionScrollList}>
              {collections.map((collection) => (
                <TouchableOpacity
                  key={collection.id}
                  style={styles.collectionCard}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate("CollectionDetail", { id: collection.id })}
                >
                  <View style={styles.collectionPosterRow}>
                    {(collection.preview_posters?.length > 0) ? (
                      collection.preview_posters.slice(0, 3).map((url: string, idx: number) => (
                        <Image key={idx} source={{ uri: url }} style={styles.collectionPoster} />
                      ))
                    ) : (
                      <View style={styles.collectionEmptyPoster}>
                        <Ionicons name="sparkles" size={28} color={COLORS.lightGray} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.collectionCardName} numberOfLines={1}>{collection.name}</Text>
                  <Text style={styles.collectionCardCount}>{collection.movie_count}편</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.watchlistEmptyCard}>
              <Ionicons name="sparkles" size={36} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>영화를 기록하면 자동으로 컬렉션이 생성됩니다</Text>
            </View>
          )}
        </View>

        <View style={[styles.bottomPadding, { height: tabBarHeight + 60 }]} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.floatingButton, { bottom: tabBarHeight + 20 }]}
        onPress={() => navigation.navigate("MovieSearch")}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={COLORS.white} />
      </TouchableOpacity>

    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  currentMovieCard: {
    width: width - 72,
    borderRadius: 16,
    overflow: "hidden",
  },
  currentMovieList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginTop: 12,
  },
  emptyLink: {
    fontSize: 14,
    color: COLORS.gold,
    marginTop: 8,
    fontWeight: "600",
  },
  currentMovieGradient: {
    padding: 20,
  },
  currentMovieContent: {
    flexDirection: "row",
  },
  currentMoviePoster: {
    width: 80,
    height: 120,
    borderRadius: 8,
  },
  currentMovieInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: "center",
  },
  currentMovieLabel: {
    fontSize: 12,
    color: COLORS.gold,
    marginBottom: 4,
    fontWeight: "600",
  },
  currentMovieTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },
  watchingCount: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: "700",
  },
  progressContainer: {
    marginTop: 8,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginBottom: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.darkNavy,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.gold,
  },
  goalCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 20,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
  },
  goalContent: {
    alignItems: "center",
  },
  goalNumbers: {
    marginBottom: 12,
  },
  goalCurrent: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.gold,
  },
  goalSeparator: {
    fontSize: 20,
    color: COLORS.lightGray,
  },
  goalTarget: {
    fontSize: 20,
    color: COLORS.lightGray,
  },
  goalProgressBar: {
    width: "100%",
    height: 8,
    backgroundColor: COLORS.darkNavy,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  goalProgressFill: {
    height: "100%",
    backgroundColor: COLORS.gold,
  },
  goalPercentage: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.gold,
  },
  statsSection: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.gold,
  },
  movieList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  bottomPadding: {
    height: 120,
  },
  watchlistEmptyCard: {
    marginHorizontal: 20,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
  },
  floatingButton: {
    position: "absolute",
    right: 20,
    bottom: 80, // Tab bar 위에
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5, // Android shadow
    shadowColor: "#000", // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  goalStepperRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", gap: 8,
  },
  goalStepperButton: {
    width: 44, height: 36, borderRadius: 10, backgroundColor: COLORS.darkNavy,
    alignItems: "center", justifyContent: "center",
  },
  goalStepperButtonText: { color: COLORS.gold, fontSize: 14, fontWeight: "700" },
  goalStepperValue: {
    minWidth: 56, height: 36, borderRadius: 10, backgroundColor: "rgba(212,175,55,0.15)",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
  },
  goalStepperValueText: { color: COLORS.gold, fontSize: 18, fontWeight: "800" },
  collectionScrollList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  collectionCard: {
    width: 160,
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 12,
  },
  collectionPosterRow: {
    flexDirection: "row",
    height: 90,
    gap: 4,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionPoster: {
    flex: 1,
    height: 90,
    borderRadius: 6,
    backgroundColor: COLORS.darkNavy,
  },
  collectionEmptyPoster: {
    flex: 1,
    height: 90,
    borderRadius: 6,
    backgroundColor: COLORS.darkNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionCardName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 2,
  },
  collectionCardCount: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  streakCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 16,
  },
  streakCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 8,
  },
  streakCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
    flex: 1,
  },
  streakCardValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF6B35",
  },
  streakWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  streakDayItem: {
    alignItems: "center",
    gap: 4,
  },
  streakDayLabel: {
    fontSize: 11,
    color: COLORS.lightGray,
    fontWeight: "600",
  },
  streakSundayLabel: {
    color: "#e74c3c",
  },
  calendarCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 20,
  },
  calendarCardContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarCardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  calendarCardSubtitle: {
    fontSize: 13,
    color: COLORS.lightGray,
  },
})
