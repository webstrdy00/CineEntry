import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { LinearGradient } from "expo-linear-gradient"
import { useState, useCallback } from "react"
import { COLORS } from "../constants/colors"
import MovieCard from "../components/MovieCard"
import StatCard from "../components/StatCard"
import type { RootStackParamList } from "../types"
import { getOverallStats, getBestMovies } from "../services/statsService"
import { getMovies } from "../services/movieService"

const { width } = Dimensions.get("window")

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>()

  const defaultStats = {
    yearly_goal: 100,
    yearly_progress: 0,
    total_watched: 0,
    current_streak: 0,
    average_rating: 0,
  }

  // State
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(defaultStats)
  const [watchingMovies, setWatchingMovies] = useState<any[]>([])
  const [watchlistMovies, setWatchlistMovies] = useState<any[]>([])
  const [bestMoviesList, setBestMoviesList] = useState<any[]>([])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      console.log('📡 HomeScreen: API 호출 시작')

      // API 호출
      const [statsData, watchingData, watchlistData, bestMoviesData] = await Promise.all([
        getOverallStats().catch((err) => {
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
        getBestMovies(10).catch((err) => {
          console.error('❌ getBestMovies 실패:', err.message)
          return []
        }),
      ])

      console.log('✅ HomeScreen: API 호출 완료', { statsData, watchingData, watchlistData, bestMoviesData })

      setStats(statsData || defaultStats)
      setWatchingMovies(watchingData)
      setWatchlistMovies(watchlistData)
      setBestMoviesList(
        (bestMoviesData || []).map((movie: any) => ({
          ...movie,
          poster: movie.poster ?? movie.poster_url ?? "",
        }))
      )
    } catch (error: any) {
      console.error('❌ HomeScreen 데이터 로드 실패:', error.message, error)
    } finally {
      setLoading(false)
    }
  }, [])

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

  // 연간 목표 데이터
  const yearlyGoal = {
    target: stats.yearly_goal || 100,
    current: stats.yearly_progress || 0,
  }

  const yearlyProgress = (yearlyGoal.current / yearlyGoal.target) * 100

  return (
    <View style={styles.container}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
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
                    <Image source={{ uri: watchingMovie.poster }} style={styles.currentMoviePoster} />
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
        <View style={styles.goalHeader}>
          <Ionicons name="trophy-outline" size={24} color={COLORS.gold} />
          <Text style={styles.goalTitle}>2025년 연간 목표</Text>
        </View>
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

      {/* Best Movies Section */}
      {bestMoviesList.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>인생 영화</Text>
              <Ionicons name="star" size={20} color={COLORS.gold} style={{ marginLeft: 6 }} />
            </View>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>더 보기</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.movieList}>
            {bestMoviesList.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={{ ...movie, status: "completed" as const }}
                onPress={() => navigation.navigate("MovieDetail", { id: movie.id })}
                showRating={true}
              />
            ))}
          </ScrollView>
        </View>
      )}

        {/* Watchlist Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>보고 싶은 영화</Text>
            {watchlistMovies.length > 0 && (
              <TouchableOpacity>
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

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.floatingButton}
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
    paddingTop: 60,
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
})
