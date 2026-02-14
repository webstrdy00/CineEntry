import { useState, useMemo, useCallback, useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import MovieCard from "../components/MovieCard"
import FilterChip from "../components/FilterChip"
import type { RootStackParamList, MovieStatus } from "../types"
import { getMovies } from "../services/movieService"

type MoviesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function MoviesScreen() {
  const navigation = useNavigation<MoviesScreenNavigationProp>()
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState<"all" | MovieStatus>("all")
  const [movies, setMovies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Debounce search query (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load movies on screen focus
  useFocusEffect(
    useCallback(() => {
      loadMovies()
    }, [selectedFilter])
  )

  const loadMovies = async () => {
    try {
      setLoading(true)
      const status = selectedFilter === "all" ? undefined : selectedFilter
      const data = await getMovies(status)
      setMovies(data)
    } catch (error) {
      console.error('❌ 영화 목록 로드 실패:', error)
      setMovies([])
    } finally {
      setLoading(false)
    }
  }

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

  const renderMovieCard = useCallback(
    ({ item }: { item: typeof movies[0] }) => (
      <View style={styles.movieCardWrapper}>
        <MovieCard
          movie={item}
          onPress={() => navigation.navigate("MovieDetail", { id: item.id })}
          showRating={true}
        />
      </View>
    ),
    [navigation]
  )

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 영화</Text>
        <TouchableOpacity onPress={() => navigation.navigate("MovieSearch")}>
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

      {/* Movies Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>영화 목록을 불러오는 중...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMovies}
          renderItem={renderMovieCard}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.moviesGrid}
          showsVerticalScrollIndicator={false}
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
    paddingTop: 60,
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
  moviesGrid: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  movieCardWrapper: {
    flex: 1,
    margin: 6,
    maxWidth: "48%",
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
