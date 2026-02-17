import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { COLORS } from "../constants/colors"
import type { MovieCardProps } from "../types"

/**
 * MovieCard 컴포넌트
 *
 * 영화 포스터와 기본 정보를 표시하는 재사용 가능한 카드 컴포넌트
 * HomeScreen, MoviesScreen 등에서 사용
 */
export default function MovieCard({
  movie,
  onPress,
  showRating = false,
}: MovieCardProps & { showRating?: boolean }) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(movie)}
      activeOpacity={0.7}
    >
      {/* 포스터 이미지 */}
      <Image
        source={{ uri: movie.poster }}
        style={styles.poster}
        resizeMode="cover"
      />

      {/* 별점 배지 (옵션) */}
      {showRating && movie.rating && movie.rating > 0 && (
        <View style={styles.ratingBadge}>
          <Ionicons name="star" size={12} color={COLORS.gold} />
          <Text style={styles.ratingText}>{movie.rating.toFixed(1)}</Text>
        </View>
      )}

      {/* 영화 제목 */}
      <Text style={styles.title} numberOfLines={2}>
        {movie.title}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 120,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: COLORS.deepGray, // 로딩 시 배경색
  },
  ratingBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(26, 29, 41, 0.8)", // darkNavy with opacity
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.white,
  },
  title: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: "500",
  },
})
