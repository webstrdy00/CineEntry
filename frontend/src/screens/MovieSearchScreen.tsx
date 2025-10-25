import { useState, useEffect } from "react"
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, ActivityIndicator, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { searchMovies, addMovie, createMovieFromMetadata } from "../services/movieService"

type MovieSearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function MovieSearchScreen() {
  const navigation = useNavigation<MovieSearchScreenNavigationProp>()
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [addingMovieId, setAddingMovieId] = useState<number | null>(null)

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(() => {
      performSearch(searchQuery)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const performSearch = async (query: string) => {
    try {
      setLoading(true)
      const results = await searchMovies(query)
      setSearchResults(results)
    } catch (error) {
      console.error('❌ 영화 검색 실패:', error)
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddMovie = async (movie: any) => {
    try {
      // Use tmdb_id or kobis_code as loading indicator
      setAddingMovieId(movie.tmdb_id || movie.kobis_code || movie.kmdb_id)

      // Step 1: Create movie in DB from metadata (or get existing)
      const createdMovie = await createMovieFromMetadata(movie)

      // Step 2: Add movie to user's library
      await addMovie({
        movie_id: createdMovie.id,
        status: 'watchlist',
      })

      Alert.alert('성공', '영화가 추가되었습니다.', [
        {
          text: '확인',
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (error: any) {
      console.error('❌ 영화 추가 실패:', error)
      if (error.response?.status === 400 || error.response?.status === 409) {
        Alert.alert('알림', '이미 추가된 영화입니다.')
      } else {
        Alert.alert('오류', '영화 추가에 실패했습니다.')
      }
    } finally {
      setAddingMovieId(null)
    }
  }

  const renderMovieItem = ({ item }: { item: any }) => {
    const isAdding = addingMovieId === (item.tmdb_id || item.kobis_code || item.kmdb_id)

    return (
      <View style={styles.movieItem}>
        <Image source={{ uri: item.poster_url }} style={styles.poster} />
        <View style={styles.movieInfo}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {item.original_title && (
            <Text style={styles.originalTitle} numberOfLines={1}>
              {item.original_title}
            </Text>
          )}
          <View style={styles.metadata}>
            {item.year && item.genre && (
              <Text style={styles.metadataText}>
                {item.year} · {item.genre}
              </Text>
            )}
            {item.director && (
              <Text style={styles.metadataText}>{item.director}</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleAddMovie(item)}
          disabled={isAdding}
        >
          {isAdding ? (
            <ActivityIndicator size="small" color={COLORS.gold} />
          ) : (
            <Ionicons name="add-circle" size={28} color={COLORS.gold} />
          )}
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>영화 검색</Text>
        <View style={styles.backButton} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.lightGray} />
        <TextInput
          style={styles.searchInput}
          placeholder="영화 제목, 감독 검색..."
          placeholderTextColor={COLORS.lightGray}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={COLORS.lightGray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results */}
      {searchQuery.trim() === "" ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={64} color={COLORS.lightGray} />
          <Text style={styles.emptyTitle}>영화를 검색해보세요</Text>
          <Text style={styles.emptySubtitle}>
            제목, 원제목, 감독으로 검색할 수 있습니다{'\n'}
            KOBIS, TMDb, KMDb에서 검색합니다
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>검색 중...</Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={64} color={COLORS.lightGray} />
          <Text style={styles.emptyTitle}>검색 결과가 없습니다</Text>
          <Text style={styles.emptySubtitle}>다른 검색어를 시도해보세요</Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderMovieItem}
          keyExtractor={(item) => `${item.source}-${item.tmdb_id || item.kobis_code || item.kmdb_id}`}
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
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
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    marginBottom: 20,
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  resultsList: {
    paddingHorizontal: 20,
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
    width: 60,
    height: 90,
    borderRadius: 8,
  },
  movieInfo: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 4,
  },
  originalTitle: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 6,
  },
  metadata: {
    gap: 2,
  },
  metadataText: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  addButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginTop: 12,
  },
})
