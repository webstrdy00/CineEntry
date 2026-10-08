import { useState, useCallback, useMemo, useRef } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, useWindowDimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import { useAlert } from "../components/CustomAlert"
import type { MovieDetail, MovieStatus, RootStackParamList } from "../types"
import { getOverallStats, type OverallStats } from "../services/statsService"
import { getMovies } from "../services/movieService"
import { updateUserProfile } from "../services/userService"
import { getCollections, type Collection } from "../services/collectionService"
import { YEARLY_GOAL_MAX, YEARLY_GOAL_MIN } from "../constants/profile"

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>
type ArchiveMovie = MovieDetail & { review?: string | null }

const getRecordTime = (movie: ArchiveMovie) => {
  for (const value of [movie.watch_date, movie.updated_at, movie.created_at]) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (Number.isFinite(time)) return time
  }
  return 0
}

const formatWatchDate = (value?: Date | string) => {
  if (!value) return null
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.replace(/-/g, ".")
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("ko-KR") : null
}

const getWatchingProgressText = (movie: ArchiveMovie) => {
  if (movie.content_type === "series") {
    const season = movie.current_season ?? 1
    const episode = movie.current_episode ?? 0
    return movie.total_episodes
      ? `시즌 ${season} · ${episode}/${movie.total_episodes}화`
      : `시즌 ${season} · ${episode}화까지`
  }
  return movie.runtime
    ? `${movie.progress ?? 0}분 / ${movie.runtime}분`
    : `${movie.progress ?? 0}분 감상`
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const { width } = useWindowDimensions()
  const { showAlert } = useAlert()
  const currentYear = new Date().getFullYear()
  const requestId = useRef(0)
  const pageWidth = Math.min(width - insets.left - insets.right, 1120)
  const horizontalPadding = width >= 768 ? 32 : 20
  const contentWidth = Math.max(0, pageWidth - horizontalPadding * 2)
  const recordColumns = contentWidth >= 720 ? 2 : 1
  const recordWidth = (contentWidth - (recordColumns - 1) * 28) / recordColumns
  const posterWidth = Math.min(156, Math.max(104, (contentWidth - 28) / 2.6))

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [movies, setMovies] = useState<ArchiveMovie[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [loadErrors, setLoadErrors] = useState({ movies: false, collections: false, goal: false })
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [isEditingGoal, setIsEditingGoal] = useState(false)
  const [isSavingGoal, setIsSavingGoal] = useState(false)

  const loadData = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    const [movieResult, collectionResult, statsResult] = await Promise.allSettled([
      getMovies(),
      getCollections(),
      getOverallStats(currentYear),
    ])
    if (id !== requestId.current) return

    if (movieResult.status === "fulfilled") setMovies(movieResult.value)
    if (collectionResult.status === "fulfilled") setCollections(collectionResult.value)
    if (statsResult.status === "fulfilled") setStats(statsResult.value)
    setLoadErrors({
      movies: movieResult.status === "rejected",
      collections: collectionResult.status === "rejected",
      goal: statsResult.status === "rejected",
    })
    setLoading(false)
  }, [currentYear])

  useFocusEffect(useCallback(() => {
    void loadData()
    return () => { requestId.current += 1 }
  }, [loadData]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }, [loadData])

  const completedMovies = useMemo(
    () => movies.filter((movie) => movie.status === "completed").sort((a, b) => getRecordTime(b) - getRecordTime(a)).slice(0, 6),
    [movies]
  )
  const watchingMovies = useMemo(() => movies.filter((movie) => movie.status === "watching"), [movies])
  const watchlistMovies = useMemo(() => movies.filter((movie) => movie.status === "watchlist"), [movies])

  const openArchive = (status: "all" | MovieStatus) => {
    navigation.navigate("Main", { screen: "Movies", params: { initialFilter: status } })
  }

  const handleGoalStep = async (delta: number) => {
    if (!stats || isSavingGoal || loadErrors.goal) return
    const currentGoal = stats.yearly_goal
    const nextGoal = Math.max(YEARLY_GOAL_MIN, Math.min(YEARLY_GOAL_MAX, currentGoal + delta))
    if (nextGoal === currentGoal) return
    setIsSavingGoal(true)
    setStats((previous) => previous ? { ...previous, yearly_goal: nextGoal } : previous)
    try {
      await updateUserProfile({ yearly_goal: nextGoal })
    } catch (error) {
      console.error("연간 목표 저장 실패:", error)
      setStats((previous) => previous ? { ...previous, yearly_goal: currentGoal } : previous)
      showAlert("오류", "목표 저장에 실패했습니다.")
    } finally {
      setIsSavingGoal(false)
    }
  }

  const renderPoster = (movie: ArchiveMovie, size: number) => (
    movie.poster_url || movie.poster ? (
      <Image source={{ uri: movie.poster_url || movie.poster }} style={[styles.poster, { width: size, height: size * 1.5 }]} resizeMode="cover" />
    ) : (
      <View style={[styles.poster, styles.posterPlaceholder, { width: size, height: size * 1.5 }]}>
        <Ionicons name="film-outline" size={28} color={COLORS.lightGray} />
      </View>
    )
  )

  const renderShelf = (items: ArchiveMovie[], watching = false) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {items.slice(0, 12).map((movie) => (
        <TouchableOpacity
          key={movie.id}
          style={{ width: posterWidth }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`${movie.title} 상세 보기`}
          onPress={() => navigation.navigate("MovieDetail", { id: movie.id })}
        >
          {renderPoster(movie, posterWidth)}
          <Text style={styles.shelfTitle} numberOfLines={2}>{movie.title}</Text>
          <Text style={styles.caption} numberOfLines={2}>
            {watching ? getWatchingProgressText(movie) : [movie.content_type === "series" ? "시리즈" : "영화", movie.year].filter(Boolean).join(" · ")}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )

  if (loading && movies.length === 0 && collections.length === 0 && !refreshing) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.stateDescription}>영화 기록을 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />}
      >
        <View style={[styles.page, { width: pageWidth, paddingHorizontal: horizontalPadding, paddingTop: 28 }]}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>나의 영화 아카이브</Text>
            <Text style={[styles.headerTitle, { fontSize: width >= 768 ? 42 : 32 }]}>내가 본 영화,{"\n"}내가 남긴 이야기</Text>
            <Text style={styles.subtitle}>좋았던 장면과 오래 남은 감상을 모아두세요.</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryAction} onPress={() => navigation.navigate("MovieSearch")} accessibilityRole="button">
                <Ionicons name="search-outline" size={18} color={COLORS.darkNavy} />
                <Text style={styles.primaryActionText}>작품 찾아 기록하기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.textAction} onPress={() => openArchive("all")} accessibilityRole="button">
                <Text style={styles.linkText}>전체 기록</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </View>
          </View>

          {loadErrors.movies && (
            <View style={styles.errorNotice}>
              <Ionicons name="cloud-offline-outline" size={20} color={COLORS.lightGray} />
              <Text style={styles.noticeText}>영화 기록을 불러오지 못했습니다.{movies.length > 0 ? " 이전 기록을 표시합니다." : ""}</Text>
              <TouchableOpacity onPress={() => void loadData()} accessibilityRole="button"><Text style={styles.linkText}>재시도</Text></TouchableOpacity>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>최근 남긴 기록</Text>
                <Text style={styles.caption}>감상한 작품과 그날의 한 줄</Text>
              </View>
              <TouchableOpacity style={styles.sectionLink} onPress={() => openArchive("completed")} accessibilityRole="button">
                <Text style={styles.linkText}>모두 보기</Text>
              </TouchableOpacity>
            </View>
            {completedMovies.length > 0 ? (
              <View style={styles.records}>
                {completedMovies.map((movie) => {
                  const review = (movie.review || movie.one_line_review || "").trim()
                  const watchDate = formatWatchDate(movie.watch_date)
                  return (
                    <TouchableOpacity
                      key={movie.id}
                      style={[styles.record, { width: recordWidth }]}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`${movie.title} 감상 기록 보기`}
                      onPress={() => navigation.navigate("MovieDetail", { id: movie.id })}
                    >
                      {renderPoster(movie, recordColumns === 2 ? 88 : 76)}
                      <View style={styles.recordInfo}>
                        <Text style={styles.recordTitle} numberOfLines={2}>{movie.title}</Text>
                        <View style={styles.recordMeta}>
                          {watchDate && <Text style={styles.caption}>{watchDate}</Text>}
                          {movie.rating != null && (
                            <View style={styles.rating}>
                              <Ionicons name="star" size={12} color={COLORS.gold} />
                              <Text style={styles.ratingText}>{Number(movie.rating).toFixed(1)}</Text>
                            </View>
                          )}
                        </View>
                        {review ? (
                          <Text style={styles.review} numberOfLines={3}>{review}</Text>
                        ) : (
                          <Text style={styles.reviewPrompt}>아직 남기지 않은 감상, 한 줄로 기록해보세요.</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            ) : !loadErrors.movies && (
              <View style={styles.emptyState}>
                <Ionicons name="create-outline" size={28} color={COLORS.gold} />
                <Text style={styles.emptyTitle}>첫 감상 기록을 남겨보세요</Text>
                <Text style={styles.stateDescription}>감상 완료한 작품의 별점과 한 줄 감상이 여기에 쌓입니다.</Text>
                <TouchableOpacity style={styles.textAction} onPress={() => navigation.navigate("MovieSearch")} accessibilityRole="button">
                  <Text style={styles.linkText}>작품 찾아보기</Text><Ionicons name="arrow-forward" size={16} color={COLORS.gold} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>이어 보는 작품</Text><Text style={styles.caption}>아직 끝나지 않은 이야기</Text></View>
              <TouchableOpacity style={styles.sectionLink} onPress={() => openArchive("watching")} accessibilityRole="button"><Text style={styles.linkText}>모두 보기</Text></TouchableOpacity>
            </View>
            {watchingMovies.length > 0 ? renderShelf(watchingMovies, true) : !loadErrors.movies && (
              <Text style={styles.emptyLine}>현재 보고 있는 작품이 없습니다.</Text>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>보고 싶은 작품</Text><Text style={styles.caption}>다음 감상을 위한 작은 목록</Text></View>
              <TouchableOpacity style={styles.sectionLink} onPress={() => openArchive("watchlist")} accessibilityRole="button"><Text style={styles.linkText}>모두 보기</Text></TouchableOpacity>
            </View>
            {watchlistMovies.length > 0 ? renderShelf(watchlistMovies) : !loadErrors.movies && (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyLine}>마음에 둔 작품을 모아보세요.</Text>
                <TouchableOpacity style={styles.sectionLink} onPress={() => navigation.navigate("MovieSearch")} accessibilityRole="button"><Text style={styles.linkText}>작품 찾기</Text></TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>나의 컬렉션</Text><Text style={styles.caption}>취향과 주제로 묶어 둔 작품들</Text></View>
              <TouchableOpacity style={styles.sectionLink} onPress={() => navigation.navigate("Collections")} accessibilityRole="button"><Text style={styles.linkText}>모두 보기</Text></TouchableOpacity>
            </View>
            {loadErrors.collections && (
              <View style={styles.errorNotice}>
                <Text style={styles.noticeText}>컬렉션을 불러오지 못했습니다.</Text>
                <TouchableOpacity onPress={() => void loadData()} accessibilityRole="button"><Text style={styles.linkText}>재시도</Text></TouchableOpacity>
              </View>
            )}
            {collections.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                {collections.slice(0, 8).map((collection) => (
                  <TouchableOpacity
                    key={collection.id}
                    style={[styles.collection, { width: Math.min(240, contentWidth * 0.8) }]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate("CollectionDetail", { id: collection.id })}
                  >
                    <View style={styles.collectionPosters}>
                      {collection.preview_posters.length > 0 ? collection.preview_posters.slice(0, 3).map((url, index) => (
                        <Image key={`${url}-${index}`} source={{ uri: url }} style={styles.collectionPoster} resizeMode="cover" />
                      )) : <View style={styles.collectionPlaceholder}><Ionicons name="albums-outline" size={28} color={COLORS.lightGray} /></View>}
                    </View>
                    <Text style={styles.shelfTitle} numberOfLines={1}>{collection.name}</Text>
                    <Text style={styles.caption}>{collection.movie_count}작품</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : !loadErrors.collections && (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyLine}>작품을 나만의 주제로 묶어보세요.</Text>
                <TouchableOpacity style={styles.sectionLink} onPress={() => navigation.navigate("Collections")} accessibilityRole="button"><Text style={styles.linkText}>컬렉션 만들기</Text></TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.tools}>
            <TouchableOpacity style={styles.toolsToggle} onPress={() => setToolsExpanded((expanded) => !expanded)} accessibilityRole="button" accessibilityState={{ expanded: toolsExpanded }}>
              <Text style={styles.toolsTitle}>달력 · 회고 · 감상 목표</Text>
              <Ionicons name={toolsExpanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.lightGray} />
            </TouchableOpacity>
            {toolsExpanded && (
              <View style={styles.toolsContent}>
                <View style={styles.toolLinks}>
                  <TouchableOpacity style={styles.toolLink} onPress={() => navigation.navigate("WatchCalendar")} accessibilityRole="button"><Ionicons name="calendar-outline" size={18} color={COLORS.gold} /><Text style={styles.linkText}>시청 달력</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.toolLink} onPress={() => navigation.navigate("Main", { screen: "Stats" })} accessibilityRole="button"><Ionicons name="book-outline" size={18} color={COLORS.gold} /><Text style={styles.linkText}>감상 회고</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.toolLink} onPress={() => navigation.navigate("StreakDetail")} accessibilityRole="button"><Ionicons name="time-outline" size={18} color={COLORS.gold} /><Text style={styles.linkText}>기록 리듬</Text></TouchableOpacity>
                </View>
                {loadErrors.goal ? (
                  <View style={styles.emptyRow}><Text style={styles.emptyLine}>감상 목표를 불러오지 못했습니다.</Text><TouchableOpacity style={styles.sectionLink} onPress={() => void loadData()} accessibilityRole="button"><Text style={styles.linkText}>재시도</Text></TouchableOpacity></View>
                ) : stats && (
                  <View style={styles.goal}>
                    <View style={styles.goalHeader}>
                      <View style={styles.sectionHeading}><Text style={styles.toolsTitle}>{currentYear}년 감상 목표</Text><Text style={styles.caption}>{stats.yearly_progress} / {stats.yearly_goal}작품</Text></View>
                      <TouchableOpacity style={styles.sectionLink} onPress={() => setIsEditingGoal((editing) => !editing)} accessibilityRole="button" accessibilityState={{ expanded: isEditingGoal }}><Text style={styles.linkText}>{isEditingGoal ? "닫기" : "목표 수정"}</Text></TouchableOpacity>
                    </View>
                    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${stats.yearly_goal > 0 ? Math.min(100, (stats.yearly_progress / stats.yearly_goal) * 100) : 0}%` }]} /></View>
                    {isEditingGoal && (
                      <View style={styles.goalStepper}>
                        {[-10, -1, 1, 10].map((delta) => (
                          <TouchableOpacity
                            key={delta}
                            style={[styles.stepButton, (isSavingGoal || (delta < 0 ? stats.yearly_goal <= YEARLY_GOAL_MIN : stats.yearly_goal >= YEARLY_GOAL_MAX)) && styles.disabled]}
                            disabled={isSavingGoal || (delta < 0 ? stats.yearly_goal <= YEARLY_GOAL_MIN : stats.yearly_goal >= YEARLY_GOAL_MAX)}
                            onPress={() => void handleGoalStep(delta)}
                            accessibilityRole="button"
                            accessibilityLabel={`감상 목표 ${Math.abs(delta)}작품 ${delta < 0 ? "줄이기" : "늘리기"}`}
                          ><Text style={styles.linkText}>{delta > 0 ? "+" : ""}{delta}</Text></TouchableOpacity>
                        ))}
                        {isSavingGoal && <ActivityIndicator size="small" color={COLORS.gold} />}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  page: { alignSelf: "center" },
  loadingState: { justifyContent: "center", alignItems: "center", padding: 32 },
  intro: { paddingBottom: 32, marginBottom: 32, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  eyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: "600", letterSpacing: 1.2, marginBottom: 16 },
  headerTitle: { color: COLORS.white, fontWeight: "600", letterSpacing: -1.1, marginBottom: 14 },
  subtitle: { color: COLORS.lightGray, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 18, marginTop: 24 },
  primaryAction: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.gold, borderRadius: 4, paddingHorizontal: 18, minHeight: 46 },
  primaryActionText: { color: COLORS.darkNavy, fontSize: 14, fontWeight: "700" },
  textAction: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  linkText: { color: COLORS.gold, fontSize: 13, fontWeight: "600" },
  section: { marginBottom: 36 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 },
  sectionHeading: { flex: 1, gap: 5 },
  sectionTitle: { color: COLORS.white, fontSize: 20, fontWeight: "600", letterSpacing: -0.4 },
  sectionLink: { minHeight: 44, justifyContent: "center" },
  caption: { color: COLORS.lightGray, fontSize: 12, lineHeight: 18 },
  records: { flexDirection: "row", flexWrap: "wrap", columnGap: 28, rowGap: 20 },
  record: { flexDirection: "row", gap: 16, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  poster: { borderRadius: 4, backgroundColor: COLORS.deepGray },
  posterPlaceholder: { justifyContent: "center", alignItems: "center" },
  recordInfo: { flex: 1, paddingTop: 2 },
  recordTitle: { color: COLORS.white, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  recordMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 7 },
  rating: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { color: COLORS.gold, fontSize: 12, fontWeight: "600" },
  review: { color: COLORS.white, fontSize: 14, lineHeight: 23, marginTop: 12 },
  reviewPrompt: { color: COLORS.lightGray, fontSize: 12, lineHeight: 20, marginTop: 12 },
  shelf: { gap: 16, paddingBottom: 2 },
  shelfTitle: { color: COLORS.white, fontSize: 14, fontWeight: "500", lineHeight: 20, marginTop: 10, marginBottom: 4 },
  emptyState: { alignItems: "flex-start", paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.deepGray, gap: 10 },
  emptyTitle: { color: COLORS.white, fontSize: 18, fontWeight: "500" },
  stateDescription: { color: COLORS.lightGray, fontSize: 14, lineHeight: 22, marginTop: 8 },
  emptyLine: { color: COLORS.lightGray, fontSize: 13, lineHeight: 22, flexShrink: 1 },
  emptyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 },
  errorNotice: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  noticeText: { color: COLORS.lightGray, flex: 1, fontSize: 13, lineHeight: 20 },
  collection: { paddingBottom: 4 },
  collectionPosters: { flexDirection: "row", height: 114, gap: 4, overflow: "hidden", borderRadius: 4, backgroundColor: COLORS.deepGray },
  collectionPoster: { flex: 1, height: "100%" },
  collectionPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  tools: { borderTopWidth: 1, borderTopColor: COLORS.deepGray },
  toolsToggle: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  toolsTitle: { color: COLORS.lightGray, fontSize: 14, fontWeight: "500" },
  toolsContent: { paddingBottom: 16, gap: 24 },
  toolLinks: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 4 },
  toolLink: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  goal: { gap: 14 },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  progressTrack: { height: 3, backgroundColor: COLORS.deepGray, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.gold },
  goalStepper: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  stepButton: { minWidth: 48, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.deepGray, borderRadius: 4 },
  disabled: { opacity: 0.4 },
})
