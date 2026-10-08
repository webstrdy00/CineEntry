import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Image, useWindowDimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs"
import { useState, useCallback } from "react"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import {
  getOverallStats,
  getMonthlyStats,
  getGenreStats,
  getTagStats,
  getBestMovies,
  type OverallStats,
  type MonthlyData,
  type GenreStats,
  type TagStats,
  type BestMovie,
} from "../services/statsService"
import { updateUserProfile } from "../services/userService"
import { useAlert } from "../components/CustomAlert"
import { YEARLY_GOAL_MAX, YEARLY_GOAL_MIN } from "../constants/profile"
import type { RootStackParamList } from "../types"

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-")
  return `${year}년 ${Number(monthNumber)}월`
}

export default function StatsScreen() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { width } = useWindowDimensions()
  const { showAlert } = useAlert()
  const currentYear = new Date().getFullYear()
  const currentMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const contentWidth = Math.min(width, 1080)
  const horizontalPadding = width >= 720 ? 32 : 20
  const availableWidth = contentWidth - horizontalPadding * 2
  const isWide = contentWidth >= 900
  const bestMovieWidth = contentWidth >= 800 ? (availableWidth - 28) / 2 : availableWidth

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [monthlyData, setMonthlyData] = useState<MonthlyData[] | null>([])
  const [genreStats, setGenreStats] = useState<GenreStats[] | null>([])
  const [topTags, setTopTags] = useState<TagStats[] | null>([])
  const [bestMovies, setBestMovies] = useState<BestMovie[] | null>([])
  const [failedPosters, setFailedPosters] = useState<number[]>([])
  const [isEditingGoal, setIsEditingGoal] = useState(false)
  const [isSavingGoal, setIsSavingGoal] = useState(false)

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setError(false)
      const [statsData, monthlyDataRes, genreDataRes, tagsDataRes, bestMoviesRes] = await Promise.all([
        getOverallStats(currentYear),
        getMonthlyStats(6).catch(() => null),
        getGenreStats(5).catch(() => null),
        getTagStats(10).catch(() => null),
        getBestMovies(4).catch(() => null),
      ])
      setStats(statsData)
      setMonthlyData(monthlyDataRes)
      setGenreStats(genreDataRes)
      setTopTags(tagsDataRes)
      setBestMovies(bestMoviesRes)
      setFailedPosters([])
    } catch (error) {
      console.error("StatsScreen 데이터 로드 실패:", error)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [currentYear])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData(false)
    setRefreshing(false)
  }, [loadData])

  const handleGoalStep = async (delta: number) => {
    if (!stats || isSavingGoal) return
    const currentGoal = stats.yearly_goal
    const nextGoal = Math.max(YEARLY_GOAL_MIN, Math.min(YEARLY_GOAL_MAX, currentGoal + delta))
    if (nextGoal === currentGoal) return
    const currentProgress = stats.yearly_progress
    setIsSavingGoal(true)
    setStats((previous) => previous ? {
      ...previous,
      yearly_goal: nextGoal,
      yearly_goal_percentage: Math.round(currentProgress / nextGoal * 1000) / 10,
    } : previous)
    try {
      await updateUserProfile({ yearly_goal: nextGoal })
    } catch (error) {
      console.error("연간 목표 저장 실패:", error)
      setStats((previous) => previous ? {
        ...previous,
        yearly_goal: currentGoal,
        yearly_goal_percentage: currentGoal > 0 ? Math.round(currentProgress / currentGoal * 1000) / 10 : 0,
      } : previous)
      showAlert("오류", "목표 저장에 실패했습니다.")
    } finally {
      setIsSavingGoal(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>통계를 불러오는 중...</Text>
      </View>
    )
  }

  if (error || !stats) {
    return (
      <View style={[styles.container, styles.centeredState]} accessibilityLiveRegion="polite">
        <Ionicons name="cloud-offline-outline" size={40} color={COLORS.lightGray} />
        <Text style={styles.errorText}>데이터를 불러올 수 없습니다</Text>
        <TouchableOpacity onPress={() => void loadData()} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="통계 다시 불러오기">
          <Ionicons name="refresh-outline" size={18} color={COLORS.gold} />
          <Text style={styles.actionText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const yearlyGoal = stats.yearly_goal
  const watched = stats.yearly_progress
  const progress = stats.yearly_goal_percentage
  const maxCount = Math.max(1, ...(monthlyData || []).map((item) => item.count))
  const monthlyTotal = (monthlyData || []).reduce((total, item) => total + item.count, 0)

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
      }
    >
      <View style={[styles.content, { width: contentWidth, paddingHorizontal: horizontalPadding }]}>
        <View style={[styles.header, { paddingTop: 32 }]}>
          <Text style={styles.eyebrow}>통계 · 나의 회고</Text>
          <Text style={[styles.headerTitle, width >= 720 && styles.wideTitle]} accessibilityRole="header">감상의 흐름</Text>
          <Text style={styles.headerSubtitle}>쌓인 작품과 기록에서 돌아보는 나의 취향.</Text>
        </View>

        <View style={[styles.headline, !isWide && styles.headlineStacked]}>
          <View style={[styles.totalMetric, isWide && styles.totalMetricWide]}>
            <Text style={styles.metricLabel}>완료한 전체 작품</Text>
            <View style={styles.totalNumberRow}>
              <Text style={styles.totalNumber}>{stats.total_watched}</Text>
              <Text style={styles.totalUnit}>작품</Text>
            </View>
            <Text style={styles.metricNote}>영화 {stats.completed_movie_count} · 시리즈 {stats.completed_series_count}</Text>
          </View>
          <View style={[styles.secondaryMetrics, isWide && styles.secondaryMetricsWide]}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{stats.average_rating.toFixed(1)}</Text>
              <Text style={styles.metricLabel}>평균 별점</Text>
              <Text style={styles.metricNote}>5점 만점</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{Math.floor(stats.total_watch_time / 60)}<Text style={styles.metricUnit}> 시간</Text></Text>
              <Text style={styles.metricLabel}>감상 시간</Text>
              <Text style={styles.metricNote}>전체 누적</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{stats.current_streak}<Text style={styles.metricUnit}> 일</Text></Text>
              <Text style={styles.metricLabel}>연속 기록</Text>
              <Text style={styles.metricNote}>현재 스트릭</Text>
            </View>
          </View>
        </View>

        <View style={[styles.flowLayout, isWide && styles.flowLayoutWide]}>
          <View style={[styles.monthlySection, isWide && styles.monthlySectionWide]}>
            <Text style={styles.sectionTitle} accessibilityRole="header">월별 감상 흐름</Text>
            <Text style={styles.sectionDescription}>기록이 있는 최근 월 기준 · 최대 6개월</Text>
            {monthlyData === null ? (
              <Text style={styles.emptyText}>월별 데이터를 불러오지 못했습니다. 새로고침해 주세요.</Text>
            ) : monthlyData.length > 0 ? (
              <>
                <View style={styles.chart}>
                  {monthlyData.map((item) => {
                    const isCurrentMonth = item.month === currentMonth
                    return (
                      <View key={item.month} style={styles.chartColumn} accessible accessibilityLabel={`${monthLabel(item.month)}, ${item.count}작품${isCurrentMonth ? ", 이번 달" : ""}`}>
                        <View style={styles.chartTrack}>
                          <Text style={styles.barCount}>{item.count}</Text>
                          <View style={[styles.chartBar, { height: item.count > 0 ? item.count / maxCount * 116 : 1, backgroundColor: isCurrentMonth ? COLORS.gold : COLORS.mediumGray }]} />
                        </View>
                        <Text style={[styles.chartMonth, isCurrentMonth && styles.currentMonth]}>{item.month.slice(2).replace("-", ".")}</Text>
                      </View>
                    )
                  })}
                </View>
                <View style={styles.chartFooter}>
                  <Text style={styles.metricNote}>위 월의 감상 합계</Text>
                  <Text style={styles.chartTotal}>{monthlyTotal}작품</Text>
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>아직 감상 기록이 없습니다.</Text>
            )}
          </View>

          <View style={[styles.goalSection, isWide && styles.goalSectionWide]}>
            <TouchableOpacity
              style={styles.goalHeader}
              activeOpacity={0.8}
              onPress={() => setIsEditingGoal((previous) => !previous)}
              accessibilityRole="button"
              accessibilityLabel={`${currentYear}년 연간 목표 ${yearlyGoal}작품, 목표 조정`}
              accessibilityState={{ expanded: isEditingGoal }}
            >
              <Text style={styles.sectionTitle}>{currentYear}년의 목표</Text>
              <Ionicons name={isEditingGoal ? "chevron-up" : "create-outline"} size={18} color={COLORS.lightGray} />
            </TouchableOpacity>
            <Text style={styles.sectionDescription}>올해 완료한 작품</Text>
            <View style={styles.goalNumbers}>
              <Text style={styles.goalWatched}>{watched}</Text>
              <Text style={styles.goalTotal}> / {yearlyGoal}작품</Text>
            </View>
            <View style={styles.progressTrack} accessible accessibilityRole="progressbar" accessibilityLabel="연간 감상 목표 달성률" accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(progress, 100)), text: `${progress.toFixed(1)}퍼센트 달성` }}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(progress, 100))}%` }]} />
            </View>
            <View style={styles.goalFooter}>
              <Text style={styles.metricNote}>{progress.toFixed(1)}% 달성</Text>
              {progress >= 100 ? <Text style={styles.goalAchieved}>목표 달성</Text> : null}
            </View>
            {isEditingGoal ? (
              <View style={styles.goalStepper}>
                {[-10, -1, 1, 10].map((delta) => {
                  const disabled = isSavingGoal || (delta < 0 ? yearlyGoal <= YEARLY_GOAL_MIN : yearlyGoal >= YEARLY_GOAL_MAX)
                  return (
                    <TouchableOpacity
                      key={delta}
                      style={[styles.goalStepButton, disabled && styles.disabled]}
                      onPress={() => void handleGoalStep(delta)}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityLabel={`연간 목표 ${Math.abs(delta)}작품 ${delta < 0 ? "줄이기" : "늘리기"}`}
                      accessibilityState={{ disabled }}
                    >
                      <Text style={styles.goalStepText}>{delta > 0 ? "+" : ""}{delta}</Text>
                    </TouchableOpacity>
                  )
                })}
                {isSavingGoal ? <Text style={styles.savingText} accessibilityLiveRegion="polite">목표 저장 중...</Text> : null}
              </View>
            ) : null}
          </View>
        </View>

        {bestMovies && bestMovies.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">오래 남겨 둔 작품</Text>
            <Text style={styles.sectionDescription}>내가 인생 작품으로 지정한 기록</Text>
            <View style={styles.bestMovies}>
              {bestMovies.map((movie) => (
                <TouchableOpacity
                  key={movie.id}
                  style={[styles.bestMovie, { width: bestMovieWidth }]}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate("MovieDetail", { id: movie.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${movie.title}${movie.rating > 0 ? `, 별점 ${movie.rating.toFixed(1)}` : ""}${movie.review ? `, ${movie.review}` : ""}`}
                  accessibilityHint="작품의 감상 기록을 엽니다"
                >
                  <View style={styles.bestPosterFrame}>
                    {movie.poster_url && !failedPosters.includes(movie.id) ? (
                      <Image
                        source={{ uri: movie.poster_url }}
                        style={styles.bestPoster}
                        resizeMode="cover"
                        accessible={false}
                        onError={() => setFailedPosters((previous) => previous.includes(movie.id) ? previous : [...previous, movie.id])}
                      />
                    ) : (
                      <View style={styles.typographicPoster}>
                        <Text style={styles.posterCaption}>포스터 없음</Text>
                        <Text style={styles.posterTitle} numberOfLines={4}>{movie.title}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.bestMovieInfo}>
                    <Text style={styles.bestMovieTitle} numberOfLines={2}>{movie.title}</Text>
                    <Text style={styles.bestMovieMeta} numberOfLines={2}>{[movie.year, movie.director].filter(Boolean).join(" · ")}</Text>
                    {movie.rating > 0 ? <Text style={styles.bestMovieRating}>★ {movie.rating.toFixed(1)}</Text> : null}
                    {movie.review ? <Text style={styles.bestMovieReview} numberOfLines={3}>{movie.review}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : bestMovies === null ? (
          <Text style={styles.unavailableNote}>인생 작품을 불러오지 못했습니다. 새로고침해 주세요.</Text>
        ) : null}

        <View style={[styles.tasteLayout, isWide && styles.tasteLayoutWide]}>
          <View style={[styles.tasteSection, isWide && styles.tasteSectionWide]}>
            <Text style={styles.sectionTitle} accessibilityRole="header">자주 머문 장르</Text>
            <Text style={styles.sectionDescription}>완료한 작품의 장르 구성 · 복수 장르 포함</Text>
            {genreStats === null ? (
              <Text style={styles.emptyText}>장르 데이터를 불러오지 못했습니다. 새로고침해 주세요.</Text>
            ) : genreStats.length > 0 ? (
              <View>
                {genreStats.map((item, index) => (
                  <View key={item.genre} style={styles.genreItem} accessible accessibilityLabel={`${item.genre}, ${item.count}작품, 장르 구성 ${item.percentage.toFixed(0)}퍼센트`}>
                    <View style={styles.genreRow}>
                      <Text style={styles.genreRank}>{String(index + 1).padStart(2, "0")}</Text>
                      <Text style={styles.genreName}>{item.genre}</Text>
                      <Text style={styles.genreCount}>{item.count}작품 <Text style={styles.genrePercentage}>{item.percentage.toFixed(0)}%</Text></Text>
                    </View>
                    <View style={styles.genreTrack}>
                      <View style={[styles.genreFill, { width: `${Math.max(0, Math.min(item.percentage, 100))}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>장르 데이터가 없습니다.</Text>
            )}
          </View>

          <View style={[styles.tasteSection, isWide && styles.tasteSectionWide]}>
            <Text style={styles.sectionTitle} accessibilityRole="header">기록에 남긴 말들</Text>
            <Text style={styles.sectionDescription}>전체 기록에서 자주 사용한 태그</Text>
            {topTags === null ? (
              <Text style={styles.emptyText}>태그를 불러오지 못했습니다. 새로고침해 주세요.</Text>
            ) : topTags.length > 0 ? (
              <View style={styles.tags}>
                {topTags.map((item, index) => (
                  <View key={item.tag} style={styles.tag} accessible accessibilityLabel={`${index + 1}위, ${item.tag}, ${item.count}개 기록`}>
                    <Text style={styles.tagRank}>{String(index + 1).padStart(2, "0")}</Text>
                    <Text style={styles.tagName}>{item.tag}</Text>
                    <Text style={styles.tagCount}>{item.count}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>등록된 태그가 없습니다.</Text>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  content: { alignSelf: "center" },
  centeredState: { justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { color: COLORS.lightGray, marginTop: 12 },
  errorText: { color: COLORS.lightGray, marginTop: 16, fontSize: 16 },
  retryButton: { flexDirection: "row", alignItems: "center", minHeight: 44, marginTop: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.mediumGray, borderRadius: 3, gap: 8 },
  actionText: { color: COLORS.gold, fontWeight: "600", fontSize: 14 },
  header: { paddingBottom: 28 },
  eyebrow: { fontSize: 12, color: COLORS.gold, fontWeight: "600", letterSpacing: 1.3, marginBottom: 12 },
  headerTitle: { fontSize: 32, lineHeight: 43, fontWeight: "700", letterSpacing: -1, color: COLORS.white },
  wideTitle: { fontSize: 42, lineHeight: 54 },
  headerSubtitle: { fontSize: 14, lineHeight: 23, color: COLORS.lightGray, marginTop: 12 },
  headline: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.deepGray, paddingVertical: 28, gap: 28 },
  headlineStacked: { flexDirection: "column", alignItems: "stretch", gap: 24 },
  totalMetric: { gap: 5 },
  totalMetricWide: { minWidth: 260, borderRightWidth: 1, borderRightColor: COLORS.deepGray, paddingRight: 28 },
  totalNumberRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 10 },
  totalNumber: { fontSize: 54, lineHeight: 66, fontWeight: "700", letterSpacing: -2, color: COLORS.white },
  totalUnit: { fontSize: 14, color: COLORS.lightGray },
  secondaryMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  secondaryMetricsWide: { flex: 1 },
  metric: { flex: 1, minWidth: 72, gap: 8 },
  metricValue: { fontSize: 28, fontWeight: "600", letterSpacing: -0.8, color: COLORS.white },
  metricUnit: { fontSize: 12, color: COLORS.lightGray, fontWeight: "400" },
  metricLabel: { fontSize: 12, color: COLORS.lightGray },
  metricNote: { fontSize: 11, lineHeight: 18, color: COLORS.lightGray },
  flowLayout: { paddingTop: 32, gap: 28, paddingBottom: 32, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  flowLayoutWide: { flexDirection: "row", alignItems: "flex-start", gap: 40 },
  monthlySection: { minWidth: 0 },
  monthlySectionWide: { flex: 1.6 },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: "600", letterSpacing: -0.4, color: COLORS.white },
  sectionDescription: { fontSize: 12, lineHeight: 20, color: COLORS.lightGray, marginTop: 6, marginBottom: 16 },
  chart: { flexDirection: "row", paddingTop: 4, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  chartColumn: { flex: 1, alignItems: "center" },
  chartTrack: { width: "100%", height: 150, justifyContent: "flex-end", alignItems: "center" },
  chartBar: { width: "45%", maxWidth: 36, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barCount: { fontSize: 12, color: COLORS.white, marginBottom: 8 },
  chartMonth: { fontSize: 11, color: COLORS.lightGray, marginTop: 10, marginBottom: 14 },
  currentMonth: { color: COLORS.gold, fontWeight: "600" },
  chartFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14 },
  chartTotal: { fontSize: 13, fontWeight: "600", color: COLORS.white },
  goalSection: { paddingTop: 20, borderTopWidth: 1, borderTopColor: COLORS.deepGray },
  goalSectionWide: { flex: 1, borderTopWidth: 0, paddingTop: 0 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 44, gap: 12 },
  goalNumbers: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", marginTop: 2, marginBottom: 18 },
  goalWatched: { fontSize: 38, fontWeight: "600", color: COLORS.white },
  goalTotal: { fontSize: 14, color: COLORS.lightGray },
  progressTrack: { height: 4, backgroundColor: COLORS.deepGray, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.gold },
  goalFooter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8 },
  goalAchieved: { fontSize: 12, fontWeight: "600", color: COLORS.gold },
  goalStepper: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  goalStepButton: { flex: 1, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.mediumGray, borderRadius: 3 },
  goalStepText: { color: COLORS.gold, fontSize: 14, fontWeight: "600" },
  savingText: { width: "100%", fontSize: 11, color: COLORS.lightGray, marginTop: 6 },
  disabled: { opacity: 0.4 },
  section: { paddingVertical: 32, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  bestMovies: { flexDirection: "row", flexWrap: "wrap", columnGap: 28 },
  bestMovie: { flexDirection: "row", gap: 18, paddingVertical: 16 },
  bestPosterFrame: { width: 76, aspectRatio: 2 / 3, backgroundColor: COLORS.deepGray, borderRadius: 3, overflow: "hidden" },
  bestPoster: { width: "100%", height: "100%" },
  typographicPoster: { flex: 1, padding: 8, justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.mediumGray },
  posterCaption: { fontSize: 9, color: COLORS.lightGray },
  posterTitle: { fontSize: 12, lineHeight: 17, fontWeight: "600", color: COLORS.white },
  bestMovieInfo: { flex: 1, minWidth: 0 },
  bestMovieTitle: { fontSize: 17, lineHeight: 24, fontWeight: "600", color: COLORS.white },
  bestMovieMeta: { fontSize: 11, lineHeight: 17, color: COLORS.lightGray, marginTop: 4 },
  bestMovieRating: { fontSize: 11, color: COLORS.gold, marginTop: 6 },
  bestMovieReview: { fontSize: 13, lineHeight: 21, color: COLORS.white, marginTop: 12, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: COLORS.mediumGray },
  unavailableNote: { fontSize: 12, lineHeight: 20, color: COLORS.lightGray, paddingVertical: 24 },
  tasteLayout: { paddingTop: 32, gap: 32 },
  tasteLayoutWide: { flexDirection: "row", gap: 40 },
  tasteSection: { minWidth: 0 },
  tasteSectionWide: { flex: 1 },
  genreItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  genreRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 },
  genreRank: { fontSize: 11, color: COLORS.lightGray },
  genreName: { flex: 1, fontSize: 14, lineHeight: 21, color: COLORS.white },
  genreCount: { fontSize: 12, color: COLORS.white },
  genrePercentage: { fontSize: 11, color: COLORS.lightGray },
  genreTrack: { height: 3, marginLeft: 25, backgroundColor: COLORS.deepGray },
  genreFill: { height: "100%", backgroundColor: COLORS.gold },
  tags: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 4 },
  tag: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.deepGray, paddingVertical: 12, gap: 8, maxWidth: "100%" },
  tagRank: { fontSize: 10, color: COLORS.lightGray },
  tagName: { flexShrink: 1, fontSize: 14, lineHeight: 21, color: COLORS.white },
  tagCount: { fontSize: 11, color: COLORS.gold },
  emptyText: { fontSize: 13, lineHeight: 22, color: COLORS.lightGray, paddingVertical: 20 },
})
