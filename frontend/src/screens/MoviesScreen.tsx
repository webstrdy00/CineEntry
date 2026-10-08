import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Image, RefreshControl, ScrollView, useWindowDimensions } from "react-native"
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { RouteProp } from "@react-navigation/native"
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import FilterChip from "../components/FilterChip"
import type { ContentType, Movie, RootStackParamList, TabParamList, MovieStatus } from "../types"
import { getMovies } from "../services/movieService"

type MoviesScreenRootNavigationProp = NativeStackNavigationProp<RootStackParamList>
type MoviesScreenTabNavigationProp = BottomTabNavigationProp<TabParamList, "Movies">
type MoviesScreenRouteProp = RouteProp<TabParamList, "Movies">
type ArchiveFilter = "all" | MovieStatus | ContentType

const filters: Array<{ id: ArchiveFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "completed", label: "감상 완료" },
  { id: "watching", label: "보는 중" },
  { id: "watchlist", label: "보고 싶은" },
  { id: "movie", label: "영화" },
  { id: "series", label: "시리즈" },
]

const getStatusLabel = (status: MovieStatus) => {
  if (status === "watching") return "보는 중"
  if (status === "completed") return "감상 완료"
  return "보고 싶은"
}

export default function MoviesScreen() {
  const rootNavigation = useNavigation<MoviesScreenRootNavigationProp>()
  const tabNavigation = useNavigation<MoviesScreenTabNavigationProp>()
  const route = useRoute<MoviesScreenRouteProp>()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const { width } = useWindowDimensions()
  const requestId = useRef(0)
  const pageWidth = Math.min(width - insets.left - insets.right, 1240)
  const horizontalPadding = width >= 768 ? 32 : 20
  const gridGap = width >= 768 ? 20 : 16
  const contentWidth = Math.max(0, pageWidth - horizontalPadding * 2)
  const numColumns = Math.min(6, Math.max(2, Math.floor((contentWidth + gridGap) / (168 + gridGap))))
  const posterWidth = (contentWidth - gridGap * (numColumns - 1)) / numColumns

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState<ArchiveFilter>("all")
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const initialFilter = route.params?.initialFilter
    if (!initialFilter) return
    setSelectedFilter(initialFilter)
    tabNavigation.setParams({ initialFilter: undefined })
  }, [route.params?.initialFilter, tabNavigation])

  const loadMovies = useCallback(async (isRefresh = false) => {
    const id = ++requestId.current
    if (!isRefresh) setLoading(true)
    setError(false)
    try {
      const status = selectedFilter === "watchlist" || selectedFilter === "watching" || selectedFilter === "completed" ? selectedFilter : undefined
      const data = await getMovies(status)
      if (id === requestId.current) setMovies(data)
    } catch (error) {
      console.error("영화 목록 로드 실패:", error)
      if (id === requestId.current) setError(true)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [selectedFilter])

  useFocusEffect(useCallback(() => {
    void loadMovies()
    return () => { requestId.current += 1 }
  }, [loadMovies]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadMovies(true)
    } finally {
      setRefreshing(false)
    }
  }, [loadMovies])

  const filteredMovies = useMemo(() => {
    let result = movies
    if (selectedFilter === "movie" || selectedFilter === "series") {
      result = result.filter((movie) => (movie.content_type ?? "movie") === selectedFilter)
    } else if (selectedFilter !== "all") {
      result = result.filter((movie) => movie.status === selectedFilter)
    }
    const query = debouncedSearchQuery.toLowerCase().trim()
    if (query) {
      result = result.filter((movie) => movie.title.toLowerCase().includes(query))
    }
    return result
  }, [movies, selectedFilter, debouncedSearchQuery])

  const resetFilters = () => {
    setSearchQuery("")
    setDebouncedSearchQuery("")
    setSelectedFilter("all")
  }

  const renderMovieItem = useCallback(({ item }: { item: Movie }) => (
    <TouchableOpacity
      style={[styles.movieItem, { width: posterWidth }]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${getStatusLabel(item.status)}, 상세 보기`}
      onPress={() => rootNavigation.navigate("MovieDetail", { id: item.id })}
    >
      {item.poster_url || item.poster ? (
        <Image
          source={{ uri: item.poster_url || item.poster }}
          style={[styles.poster, { height: posterWidth * 1.5 }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder, { height: posterWidth * 1.5 }]}>
          <Ionicons name="film-outline" size={32} color={COLORS.lightGray} />
          <Text style={styles.posterPlaceholderText}>포스터 없음</Text>
        </View>
      )}
      <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
      {!!item.original_title && item.original_title !== item.title && (
        <Text style={styles.originalTitle} numberOfLines={1}>{item.original_title}</Text>
      )}
      <Text style={styles.metadata} numberOfLines={1}>
        {[item.content_type === "series" ? "시리즈" : "영화", item.year].filter(Boolean).join(" · ")}
      </Text>
      <View style={styles.recordMeta}>
        <View style={styles.status}>
          <View style={[styles.statusDot, item.status === "completed" && styles.completedDot, item.status === "watching" && styles.watchingDot]} />
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
        {item.rating != null && (
          <View style={styles.rating}>
            <Ionicons name="star" size={11} color={COLORS.gold} />
            <Text style={styles.ratingText}>{Number(item.rating).toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  ), [posterWidth, rootNavigation])

  const header = (
    <View style={{ paddingTop: 26 }}>
      <View style={styles.header}>
        <View style={styles.headerHeading}>
          <Text style={styles.eyebrow}>나의 아카이브</Text>
          <Text style={styles.headerTitle}>내 작품</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => rootNavigation.navigate("MovieSearch")} accessibilityRole="button" accessibilityLabel="작품 검색하고 기록하기">
          <Ionicons name="add" size={18} color={COLORS.darkNavy} />
          <Text style={styles.addButtonText}>기록하기</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>감상한 작품과 다음에 볼 이야기를 한곳에.</Text>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={COLORS.lightGray} />
        <TextInput
          style={styles.searchInput}
          placeholder="내 기록에서 작품 찾기"
          placeholderTextColor={COLORS.lightGray}
          selectionColor={COLORS.gold}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="내 작품 검색"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={() => { setSearchQuery(""); setDebouncedSearchQuery("") }} accessibilityRole="button" accessibilityLabel="검색어 지우기">
            <Ionicons name="close" size={18} color={COLORS.lightGray} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
        {filters.map((filter) => (
          <FilterChip key={filter.id} label={filter.label} isActive={selectedFilter === filter.id} onPress={() => setSelectedFilter(filter.id)} />
        ))}
      </ScrollView>
      <View style={styles.archiveSummary}>
        <Text style={styles.resultCount}>{loading ? "기록을 불러오는 중" : `${filteredMovies.length}작품`}</Text>
        <TouchableOpacity style={styles.collectionLink} onPress={() => rootNavigation.navigate("Collections")} accessibilityRole="button">
          <Ionicons name="albums-outline" size={16} color={COLORS.gold} />
          <Text style={styles.linkText}>컬렉션 보기</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.gold} />
        </TouchableOpacity>
      </View>
      {error && filteredMovies.length > 0 && (
        <View style={styles.errorNotice}>
          <Text style={styles.errorNoticeText}>최신 기록을 불러오지 못해 이전 기록을 표시합니다.</Text>
          <TouchableOpacity style={styles.retryLink} onPress={() => void loadMovies()} accessibilityRole="button"><Text style={styles.linkText}>재시도</Text></TouchableOpacity>
        </View>
      )}
    </View>
  )

  const emptyState = loading ? (
    <View style={styles.stateContainer}>
      <ActivityIndicator size="large" color={COLORS.gold} />
      <Text style={styles.stateDescription}>작품 목록을 불러오는 중...</Text>
    </View>
  ) : error ? (
    <View style={styles.stateContainer}>
      <Ionicons name="cloud-offline-outline" size={36} color={COLORS.lightGray} />
      <Text style={styles.stateTitle}>기록을 불러오지 못했습니다</Text>
      <Text style={styles.stateDescription}>연결 상태를 확인하고 다시 시도해주세요.</Text>
      <TouchableOpacity style={styles.stateAction} onPress={() => void loadMovies()} accessibilityRole="button"><Ionicons name="refresh" size={16} color={COLORS.gold} /><Text style={styles.linkText}>다시 시도</Text></TouchableOpacity>
    </View>
  ) : debouncedSearchQuery.trim() || selectedFilter !== "all" ? (
    <View style={styles.stateContainer}>
      <Ionicons name="search-outline" size={36} color={COLORS.lightGray} />
      <Text style={styles.stateTitle}>조건에 맞는 작품이 없습니다</Text>
      <Text style={styles.stateDescription}>다른 검색어 또는 필터로 기록을 찾아보세요.</Text>
      <TouchableOpacity style={styles.stateAction} onPress={resetFilters} accessibilityRole="button"><Text style={styles.linkText}>검색과 필터 초기화</Text><Ionicons name="arrow-forward" size={16} color={COLORS.gold} /></TouchableOpacity>
    </View>
  ) : (
    <View style={styles.stateContainer}>
      <Ionicons name="film-outline" size={36} color={COLORS.gold} />
      <Text style={styles.stateTitle}>나의 첫 작품을 기록해보세요</Text>
      <Text style={styles.stateDescription}>감상한 작품도, 보고 싶은 작품도 함께 모을 수 있어요.</Text>
      <TouchableOpacity style={styles.stateAction} onPress={() => rootNavigation.navigate("MovieSearch")} accessibilityRole="button"><Text style={styles.linkText}>작품 찾아 기록하기</Text><Ionicons name="arrow-forward" size={16} color={COLORS.gold} /></TouchableOpacity>
    </View>
  )

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        key={`archive-${numColumns}`}
        style={{ width: pageWidth, alignSelf: "center" }}
        data={loading ? [] : filteredMovies}
        numColumns={numColumns}
        removeClippedSubviews={false}
        renderItem={renderMovieItem}
        keyExtractor={(item) => item.id.toString()}
        columnWrapperStyle={{ gap: gridGap, alignItems: "flex-start" }}
        contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: tabBarHeight + 32, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={emptyState}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16 },
  headerHeading: { flex: 1 },
  eyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: "600", letterSpacing: 1.2, marginBottom: 8 },
  headerTitle: { color: COLORS.white, fontSize: 32, fontWeight: "600", letterSpacing: -0.8 },
  subtitle: { color: COLORS.lightGray, fontSize: 13, lineHeight: 21, marginTop: 12, marginBottom: 24 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, minHeight: 44, borderRadius: 4, backgroundColor: COLORS.gold },
  addButtonText: { color: COLORS.darkNavy, fontSize: 13, fontWeight: "700" },
  searchContainer: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.mediumGray, minHeight: 48, gap: 10, marginBottom: 18 },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.white, fontSize: 14, paddingVertical: 12 },
  clearButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  filtersContainer: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  archiveSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, marginBottom: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  resultCount: { color: COLORS.lightGray, fontSize: 12 },
  collectionLink: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  linkText: { color: COLORS.gold, fontSize: 13, fontWeight: "600" },
  movieItem: { marginBottom: 28 },
  poster: { width: "100%", borderRadius: 4, backgroundColor: COLORS.deepGray },
  posterPlaceholder: { justifyContent: "center", alignItems: "center", gap: 10 },
  posterPlaceholderText: { color: COLORS.lightGray, fontSize: 11 },
  movieTitle: { color: COLORS.white, fontSize: 14, fontWeight: "600", lineHeight: 20, marginTop: 10 },
  originalTitle: { color: COLORS.lightGray, fontSize: 11, marginTop: 3 },
  metadata: { color: COLORS.lightGray, fontSize: 11, lineHeight: 16, marginTop: 5 },
  recordMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: 8, rowGap: 5, marginTop: 7 },
  status: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.mediumGray },
  completedDot: { backgroundColor: COLORS.gold },
  watchingDot: { backgroundColor: COLORS.white },
  statusText: { color: COLORS.lightGray, fontSize: 11 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: COLORS.gold, fontSize: 11, fontWeight: "600" },
  stateContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 16 },
  stateTitle: { color: COLORS.white, fontSize: 18, fontWeight: "500", textAlign: "center", marginTop: 18 },
  stateDescription: { color: COLORS.lightGray, fontSize: 13, lineHeight: 21, textAlign: "center", marginTop: 10 },
  stateAction: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, marginTop: 18 },
  errorNotice: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 20 },
  errorNoticeText: { color: COLORS.lightGray, fontSize: 12, lineHeight: 19, flex: 1 },
  retryLink: { minHeight: 44, justifyContent: "center" },
})
