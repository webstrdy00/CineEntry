import { useState, useEffect } from "react"
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getMovieDetail, updateMovie, deleteMovie } from "../services/movieService"
import { getTags, addTagToMovie, removeTagFromMovie, createTag } from "../services/tagService"

type MovieDetailScreenProps = NativeStackScreenProps<RootStackParamList, "MovieDetail">

export default function MovieDetailScreen({ route, navigation }: MovieDetailScreenProps) {
  const { id } = route.params

  // State
  const [loading, setLoading] = useState(true)
  const [movie, setMovie] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [status, setStatus] = useState<'watching' | 'completed' | 'watchlist'>('watchlist')
  const [allTags, setAllTags] = useState<any[]>([])
  const [movieTags, setMovieTags] = useState<any[]>([])
  const [showTagPicker, setShowTagPicker] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [movieData, tagsData] = await Promise.all([
        getMovieDetail(id),
        getTags().catch(() => []),
      ])

      setMovie(movieData)
      setRating(movieData.rating || 0)
      setReview(movieData.review || "")
      setStatus(movieData.status || 'watchlist')
      setMovieTags(movieData.tags || [])
      setAllTags(tagsData)
    } catch (error) {
      console.error('❌ MovieDetailScreen 데이터 로드 실패:', error)
      Alert.alert('오류', '영화 정보를 불러올 수 없습니다.')
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }

  // 영화 정보 저장 (별점, 리뷰, 상태)
  const handleSave = async () => {
    try {
      await updateMovie(id, {
        rating,
        one_line_review: review,
        status,
      })
      Alert.alert('성공', '변경 사항이 저장되었습니다.')
      loadData() // 데이터 새로고침
    } catch (error) {
      console.error('❌ 영화 정보 저장 실패:', error)
      Alert.alert('오류', '저장에 실패했습니다.')
    }
  }

  // 시청 완료 처리
  const handleMarkCompleted = async () => {
    try {
      await updateMovie(id, {
        status: 'completed',
        rating: rating || undefined,
        one_line_review: review || undefined,
      })
      setStatus('completed')
      Alert.alert('완료', '시청 완료 처리되었습니다.')
    } catch (error) {
      console.error('❌ 시청 완료 처리 실패:', error)
      Alert.alert('오류', '처리에 실패했습니다.')
    }
  }

  // 영화 삭제
  const handleDelete = () => {
    Alert.alert(
      '영화 삭제',
      '정말 이 영화를 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMovie(id)
              Alert.alert('삭제 완료', '영화가 삭제되었습니다.')
              navigation.goBack()
            } catch (error) {
              console.error('❌ 영화 삭제 실패:', error)
              Alert.alert('오류', '삭제에 실패했습니다.')
            }
          },
        },
      ]
    )
  }

  // 태그 추가
  const handleAddTag = async (tagId: number) => {
    try {
      await addTagToMovie(id, tagId)
      await loadData() // 데이터 새로고침
      setShowTagPicker(false)
    } catch (error) {
      console.error('❌ 태그 추가 실패:', error)
      Alert.alert('오류', '태그 추가에 실패했습니다.')
    }
  }

  // 태그 제거
  const handleRemoveTag = async (tagId: number) => {
    try {
      await removeTagFromMovie(id, tagId)
      await loadData() // 데이터 새로고침
    } catch (error) {
      console.error('❌ 태그 제거 실패:', error)
      Alert.alert('오류', '태그 제거에 실패했습니다.')
    }
  }

  // 별점 변경 시 자동 저장
  const handleRatingChange = async (newRating: number) => {
    setRating(newRating)
    try {
      await updateMovie(id, { rating: newRating })
    } catch (error) {
      console.error('❌ 별점 저장 실패:', error)
    }
  }

  // 로딩 중
  if (loading || !movie) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>영화 정보를 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Backdrop Image */}
      <View style={styles.backdropContainer}>
        <Image source={{ uri: movie.backdrop_url || movie.poster_url }} style={styles.backdrop} />
        <View style={styles.backdropOverlay} />
      </View>

      {/* Movie Info */}
      <View style={styles.content}>
        <View style={styles.movieHeader}>
          <Image source={{ uri: movie.poster_url }} style={styles.poster} />
          <View style={styles.movieInfo}>
            <Text style={styles.title}>{movie.title}</Text>
            {movie.original_title && (
              <Text style={styles.originalTitle}>{movie.original_title}</Text>
            )}
            {movie.year && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.lightGray} />
                <Text style={styles.infoText}>{movie.year}</Text>
              </View>
            )}
            {movie.runtime && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={14} color={COLORS.lightGray} />
                <Text style={styles.infoText}>{movie.runtime}분</Text>
              </View>
            )}
            {movie.genre && (
              <View style={styles.infoRow}>
                <Ionicons name="film-outline" size={14} color={COLORS.lightGray} />
                <Text style={styles.infoText}>{movie.genre}</Text>
              </View>
            )}
            {movie.director && (
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={14} color={COLORS.lightGray} />
                <Text style={styles.infoText}>{movie.director}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleMarkCompleted}
          >
            <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>
              {status === 'completed' ? '시청 완료됨' : '시청 완료'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSave}
          >
            <Ionicons name="save-outline" size={20} color={COLORS.gold} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.red} />
          </TouchableOpacity>
        </View>

        {/* Synopsis */}
        {movie.synopsis && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>줄거리</Text>
            <Text style={styles.synopsis}>{movie.synopsis}</Text>
          </View>
        )}

        {/* Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>별점</Text>
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => handleRatingChange(star)}>
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={32}
                  color={COLORS.gold}
                  style={styles.star}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Review */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>감상평</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder="이 영화에 대한 생각을 남겨보세요..."
            placeholderTextColor={COLORS.lightGray}
            multiline
            numberOfLines={4}
            value={review}
            onChangeText={setReview}
            onBlur={handleSave}
          />
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>태그</Text>
          <View style={styles.tagsContainer}>
            {movieTags.map((tag) => (
              <TouchableOpacity
                key={tag.id}
                style={styles.tag}
                onLongPress={() => handleRemoveTag(tag.id)}
              >
                <Text style={styles.tagText}>{tag.name}</Text>
                <TouchableOpacity onPress={() => handleRemoveTag(tag.id)}>
                  <Ionicons name="close-circle" size={16} color={COLORS.gold} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.addTagButton}
              onPress={() => setShowTagPicker(!showTagPicker)}
            >
              <Ionicons name="add" size={16} color={COLORS.gold} />
              <Text style={styles.addTagText}>태그 추가</Text>
            </TouchableOpacity>
          </View>

          {/* Tag Picker */}
          {showTagPicker && (
            <View style={styles.tagPicker}>
              <Text style={styles.tagPickerTitle}>태그 선택</Text>
              <View style={styles.tagPickerList}>
                {allTags
                  .filter((tag) => !movieTags.find((mt) => mt.id === tag.id))
                  .map((tag) => (
                    <TouchableOpacity
                      key={tag.id}
                      style={styles.tagPickerItem}
                      onPress={() => handleAddTag(tag.id)}
                    >
                      <Text style={styles.tagPickerText}>{tag.name}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          )}
        </View>

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>상태</Text>
          <View style={styles.statusContainer}>
            <TouchableOpacity
              style={[styles.statusButton, status === 'watchlist' && styles.statusButtonActive]}
              onPress={() => setStatus('watchlist')}
            >
              <Text style={[styles.statusText, status === 'watchlist' && styles.statusTextActive]}>
                보고 싶은
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusButton, status === 'watching' && styles.statusButtonActive]}
              onPress={() => setStatus('watching')}
            >
              <Text style={[styles.statusText, status === 'watching' && styles.statusTextActive]}>
                보는 중
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusButton, status === 'completed' && styles.statusButtonActive]}
              onPress={() => setStatus('completed')}
            >
              <Text style={[styles.statusText, status === 'completed' && styles.statusTextActive]}>
                완료
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  backdropContainer: {
    height: 250,
    position: "relative",
  },
  backdrop: {
    width: "100%",
    height: "100%",
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 29, 41, 0.6)",
  },
  content: {
    marginTop: -50,
    paddingHorizontal: 20,
  },
  movieHeader: {
    flexDirection: "row",
    marginBottom: 20,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: COLORS.gold,
  },
  movieInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  originalTitle: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginLeft: 6,
  },
  actionButtons: {
    flexDirection: "row",
    marginBottom: 24,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: COLORS.darkNavy,
    fontSize: 15,
    fontWeight: "bold",
  },
  secondaryButton: {
    width: 50,
    height: 50,
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },
  synopsis: {
    fontSize: 14,
    color: COLORS.lightGray,
    lineHeight: 22,
  },
  ratingContainer: {
    flexDirection: "row",
    gap: 8,
  },
  star: {
    marginRight: 4,
  },
  reviewInput: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    color: COLORS.white,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: "top",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    backgroundColor: COLORS.deepGray,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: "500",
  },
  addTagButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addTagText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: "500",
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  dateButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "500",
  },
  bottomPadding: {
    height: 40,
  },
  tagPicker: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  tagPickerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 12,
  },
  tagPickerList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPickerItem: {
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  tagPickerText: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: "500",
  },
  statusContainer: {
    flexDirection: "row",
    gap: 8,
  },
  statusButton: {
    flex: 1,
    backgroundColor: COLORS.deepGray,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  statusButtonActive: {
    backgroundColor: COLORS.gold,
  },
  statusText: {
    color: COLORS.lightGray,
    fontSize: 14,
    fontWeight: "500",
  },
  statusTextActive: {
    color: COLORS.darkNavy,
    fontWeight: "600",
  },
})
