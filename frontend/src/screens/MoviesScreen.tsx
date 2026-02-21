import { useState, useMemo, useCallback, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Image, RefreshControl } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { RouteProp } from "@react-navigation/native"
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import FilterChip from "../components/FilterChip"
import type { RootStackParamList, TabParamList, MovieStatus } from "../types"
import { getMovies } from "../services/movieService"

type MoviesScreenRootNavigationProp = NativeStackNavigationProp<RootStackParamList>
type MoviesScreenTabNavigationProp = BottomTabNavigationProp<TabParamList, "Movies">
type MoviesScreenRouteProp = RouteProp<TabParamList, "Movies">

export default function MoviesScreen() {
  const rootNavigation = useNavigation<MoviesScreenRootNavigationProp>()
  const tabNavigation = useNavigation<MoviesScreenTabNavigationProp>()
  const route = useRoute<MoviesScreenRouteProp>()
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState<"all" | MovieStatus>("all")
  const [movies, setMovies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  // Debounce search query (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Home의 "더 보기"에서 전달한 초기 필터 적용
  useEffect(() => {
    const initialFilter = route.params?.initialFilter
    if (!initialFilter) return

    setSelectedFilter(initialFilter)

    // 초기 필터는 1회성으로만 적용하고 즉시 제거
    tabNavigation.setParams({ initialFilter: undefined })
  }, [route.params?.initialFilter, tabNavigation])

  // Load movies on screen focus
  useFocusEffect(
    useCallback(() => {
      loadMovies()
    }, [selectedFilter])
  )

  const loadMovies = async () => {
    try {
      setLoading(true)
      setError(false)
      const status = selectedFilter === "all" ? undefined : selectedFilter
      const data = await getMovies(status)
      setMovies(data)
    } catch (error) {
      console.error('❌ 영화 목록 로드 실패:', error)
      setMovies([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadMovies()
    setRefreshing(false)
  }, [selectedFilter])

  const filters: Array<{ id: "all" | MovieStatus; label: string }> = [
    { id: "all", label: "전체" },
    { id: "watchlist", label: "보고 싶은" },
    { id: "watching", label: "보는 중" },
    { id: "completed", label: "완료" },
  ]

  // Filter and search logic
  const filteredMovies = useMemo(() => {
    let result = movies

    // Apply status filter
    if (selectedFilter !== "all") {
      result = result.filter((movie) => movie.status === selectedFilter)
    }

    // Apply search filter (debounced)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim()
      result = result.filter((movie) => movie.title.toLowerCase().includes(query))
    }

    return result
  }, [movies, selectedFilter, debouncedSearchQuery])

  const getStatusLabel = (status?: string) => {
    if (status === "watching") return "보는 중"
    if (status === "completed") return "완료"
    return "보고 싶은"
  }

  const getStatusStyle = (status?: string) => {
    if (status === "watching") {
      return {
        chip: styles.statusChipWatching,
        text: styles.statusChipTextWatching,
      }
    }
    if (status === "completed") {
      return {
        chip: styles.statusChipCompleted,
        text: styles.statusChipTextCompleted,
      }
    }
    return {
      chip: styles.statusChipWatchlist,
      text: styles.statusChipTextWatchlist,
    }
  }

  const renderMovieItem = useCallback(
    ({ item }: { item: typeof movies[0] }) => {
      const statusStyle = getStatusStyle(item.status)

      return (
        <TouchableOpacity
          style={styles.movieItem}
          activeOpacity={0.8}
          onPress={() => rootNavigation.navigate("MovieDetail", { id: item.id })}
        >
          {item.poster_url || item.poster ? (
            <Image
              source={{ uri: item.poster_url || item.poster }}
              style={styles.poster}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Ionicons name="film-outline" size={22} color={COLORS.lightGray} />
            </View>
          )}

          <View style={styles.movieInfo}>
            <Text style={styles.movieTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {!!item.original_title && item.original_title !== item.title && (
              <Text style={styles.originalTitle} numberOfLines={1}>
                {item.original_title}
              </Text>
            )}

            <View style={styles.metaRow}>
              <View style={[styles.statusChip, statusStyle.chip]}>
                <Text style={[styles.statusChipText, statusStyle.text]}>
                  {getStatusLabel(item.status)}
                </Text>
              </View>

              {item.rating && item.rating > 0 && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color={COLORS.gold} />
                  <Text style={styles.ratingText}>{Number(item.rating).toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={18} color={COLORS.lightGray} />
        </TouchableOpacity>
      )
    },
    [rootNavigation]
  )

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>내 영화</Text>
        <TouchableOpacity onPress={() => rootNavigation.navigate("MovieSearch")}>
          <Ionicons name="add-circle" size={28} color={COLORS.gold} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.lightGray} />
        <TextInput
          style={styles.searchInput}
          placeholder="영화 검색..."
          placeholderTextColor={COLORS.lightGray}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {filters.map((filter) => (
          <FilterChip
            key={filter.id}
            label={filter.label}
            isActive={selectedFilter === filter.id}
            onPress={() => setSelectedFilter(filter.id)}
          />
        ))}
      </View>

      {/* Movies List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>영화 목록을 불러오는 중...</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.lightGray} />
          <Text style={{ color: COLORS.lightGray, marginTop: 16, fontSize: 16 }}>데이터를 불러올 수 없습니다</Text>
          <TouchableOpacity
            onPress={loadMovies}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: COLORS.deepGray, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, gap: 6 }}
          >
            <Ionicons name="refresh" size={18} color={COLORS.gold} />
            <Text style={{ color: COLORS.gold, fontWeight: '600' }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredMovies}
          renderItem={renderMovieItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.moviesList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="film-outline" size={64} color={COLORS.lightGray} />
              <Text style={styles.emptyTitle}>영화를 찾을 수 없습니다</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? "다른 검색어를 시도해보세요" : "영화를 추가해보세요"}
              </Text>
            </View>
          }
        />
      )}
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    color: COLORS.white,
    fontSize: 15,
  },
  filtersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  moviesList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  movieItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  poster: {
    width: 56,
    height: 84,
    borderRadius: 8,
    backgroundColor: COLORS.deepGray,
  },
  posterPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#3a3d4f",
  },
  movieInfo: {
    flex: 1,
  },
  movieTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
  },
  originalTitle: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipWatchlist: {
    backgroundColor: "rgba(212, 175, 55, 0.14)",
    borderColor: "rgba(212, 175, 55, 0.45)",
  },
  statusChipWatching: {
    backgroundColor: "rgba(93, 173, 226, 0.16)",
    borderColor: "rgba(93, 173, 226, 0.5)",
  },
  statusChipCompleted: {
    backgroundColor: "rgba(88, 214, 141, 0.16)",
    borderColor: "rgba(88, 214, 141, 0.5)",
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusChipTextWatchlist: {
    color: COLORS.gold,
  },
  statusChipTextWatching: {
    color: "#5DADE2",
  },
  statusChipTextCompleted: {
    color: "#58D68D",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginTop: 12,
  },
})
