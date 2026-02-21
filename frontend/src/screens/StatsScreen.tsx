import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import StatCard from "../components/StatCard"
import { getOverallStats, getMonthlyStats, getGenreStats, getTagStats } from "../services/statsService"

const { width } = Dimensions.get("window")

const GENRE_COLORS = [COLORS.gold, COLORS.red, "#3498db", "#2ecc71", "#9b59b6", "#e67e22"]

export default function StatsScreen() {
  const insets = useSafeAreaInsets()
  const currentYear = new Date().getFullYear()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const defaultStats = {
    yearly_goal: 100,
    yearly_progress: 0,
    yearly_goal_percentage: 0,
    total_watched: 0,
    average_rating: 0,
    total_watch_time: 0,
    current_streak: 0,
  }
  const [stats, setStats] = useState<any>(null)
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [genreStats, setGenreStats] = useState<any[]>([])
  const [topTags, setTopTags] = useState<any[]>([])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [])
  )

  const loadData = async () => {
    try {
      setLoading(true)
      setError(false)
      const [statsData, monthlyDataRes, genreDataRes, tagsDataRes] = await Promise.all([
        getOverallStats(currentYear).catch((err) => {
          console.error('❌ getOverallStats 실패:', err.message)
          return null
        }),
        getMonthlyStats(6).catch(() => []),
        getGenreStats(5).catch(() => []),
        getTagStats(10).catch(() => []),
      ])

      setStats(statsData || defaultStats)

      // 월별 데이터 포맷팅 (YYYY-MM → M월)
      const formattedMonthly = monthlyDataRes.map((item: any) => ({
        month: new Date(item.month + '-01').toLocaleDateString('ko-KR', { month: 'long' }),
        count: item.count,
      }))
      setMonthlyData(formattedMonthly)

      // 장르 데이터에 색상 추가
      const formattedGenres = genreDataRes.map((item: any, index: number) => ({
        ...item,
        color: GENRE_COLORS[index % GENRE_COLORS.length],
      }))
      setGenreStats(formattedGenres)

      setTopTags(tagsDataRes)
    } catch (error) {
      console.error('❌ StatsScreen 데이터 로드 실패:', error)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [])

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>통계를 불러오는 중...</Text>
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

  // stats가 null이면 기본값 사용
  const displayStats = stats || defaultStats

  const yearlyGoal = displayStats.yearly_goal
  const watched = displayStats.yearly_progress
  const progress = displayStats.yearly_goal_percentage
  const maxCount = monthlyData.length > 0 ? Math.max(...monthlyData.map((d) => d.count)) : 1

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>통계</Text>
        <Text style={styles.headerSubtitle}>{currentYear}년</Text>
      </View>

      {/* Yearly Goal */}
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>연간 목표</Text>
          <Text style={styles.goalProgress}>
            {watched} / {yearlyGoal}편
          </Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.goalPercentage}>{progress.toFixed(1)}% 달성</Text>
      </View>

      {/* Monthly Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>월별 관람 추이</Text>
        <View style={styles.chartContainer}>
          {monthlyData.map((item, index) => (
            <View key={index} style={styles.chartBar}>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { height: (item.count / maxCount) * 120 }]} />
              </View>
              <Text style={styles.barCount}>{item.count}</Text>
              <Text style={styles.barLabel}>{item.month}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard title="총 관람" value={`${displayStats.total_watched || 0}편`} icon="film" color={COLORS.gold} />
        <StatCard title="평균 별점" value={(displayStats.average_rating || 0).toFixed(1)} icon="star" color={COLORS.gold} />
        <StatCard title="총 시청 시간" value={`${Math.floor((displayStats.total_watch_time || 0) / 60)}시간`} icon="time" color={COLORS.gold} />
        <StatCard title="연속 기록" value={`${displayStats.current_streak || 0}일`} icon="calendar" color={COLORS.gold} />
      </View>

      {/* Genre Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>장르별 통계</Text>
        {genreStats.map((item, index) => (
          <View key={index} style={styles.genreItem}>
            <View style={styles.genreInfo}>
              <View style={[styles.genreColor, { backgroundColor: item.color }]} />
              <Text style={styles.genreText}>{item.genre}</Text>
            </View>
            <Text style={styles.genreCount}>{item.count}편</Text>
          </View>
        ))}
      </View>

      {/* Top Tags */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>인기 태그</Text>
        <View style={styles.tagsContainer}>
          {topTags.map((item, index) => (
            <View key={index} style={styles.tagItem}>
              <Text style={styles.tagText}>{item.tag}</Text>
              <Text style={styles.tagCount}>{item.count}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  goalCard: {
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
  },
  goalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  goalProgress: {
    fontSize: 16,
    color: COLORS.gold,
    fontWeight: "600",
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: COLORS.darkNavy,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: COLORS.gold,
  },
  goalPercentage: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: "right",
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 16,
  },
  chartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 180,
    backgroundColor: COLORS.deepGray,
    padding: 16,
    borderRadius: 12,
  },
  chartBar: {
    flex: 1,
    alignItems: "center",
  },
  barContainer: {
    flex: 1,
    justifyContent: "flex-end",
    width: "100%",
    alignItems: "center",
  },
  bar: {
    width: 24,
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  barCount: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: "600",
    marginTop: 4,
  },
  barLabel: {
    fontSize: 11,
    color: COLORS.lightGray,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  genreItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  genreInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  genreColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  genreText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "500",
  },
  genreCount: {
    fontSize: 15,
    color: COLORS.gold,
    fontWeight: "600",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  tagText: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: "500",
  },
  tagCount: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  bottomPadding: {
    height: 20,
  },
})
