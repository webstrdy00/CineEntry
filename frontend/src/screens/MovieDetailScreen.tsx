import { useCallback, useEffect, useState } from "react"
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, Modal } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getMovieDetail, updateMovie, deleteMovie } from "../services/movieService"
import { getTags, addTagToMovie, removeTagFromMovie } from "../services/tagService"

type MovieDetailScreenProps = NativeStackScreenProps<RootStackParamList, "MovieDetail">

export default function MovieDetailScreen({ route, navigation }: MovieDetailScreenProps) {
  const { id } = route.params

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [movie, setMovie] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [status, setStatus] = useState<"watching" | "completed" | "watchlist">("watchlist")
  const [allTags, setAllTags] = useState<any[]>([])
  const [movieTags, setMovieTags] = useState<any[]>([])
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [pendingRating, setPendingRating] = useState(0)
  const [pendingReview, setPendingReview] = useState("")
  const isCompleted = status === "completed"

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [movieData, tagsData] = await Promise.all([
        getMovieDetail(id),
        getTags().catch(() => []),
      ])

      const currentTags = (movieData.tags || [])
        .map((tag: any) => ({ ...tag, id: Number(tag.id) }))
        .filter((tag: any) => Number.isFinite(tag.id))
      setMovie(movieData)
      setRating(movieData.rating || 0)
      setReview(movieData.review || "")
      setStatus(movieData.status || "watchlist")
      setMovieTags(currentTags)
      setAllTags(tagsData)
    } catch (error) {
      console.error("MovieDetailScreen 데이터 로드 실패:", error)
      Alert.alert("오류", "영화 정보를 불러오지 못했습니다.")
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }, [id, navigation])

  useEffect(() => {
    loadData()
  }, [loadData])

  const persistStatus = useCallback(
    async (
      nextStatus: "watching" | "completed" | "watchlist",
      options?: {
        rating?: number
        review?: string
        silent?: boolean
      }
    ) => {
      if (isSaving) return false

      const nextRating = options?.rating ?? rating
      const nextReview = options?.review ?? review

      try {
        setIsSaving(true)
        const payload: {
          status: "watching" | "completed" | "watchlist"
          rating?: number
          one_line_review?: string
        } = { status: nextStatus }

        if (nextStatus === "completed") {
          payload.rating = nextRating
          payload.one_line_review = nextReview
        }

        const updatedMovie = await updateMovie(id, payload)
        setMovie(updatedMovie)
        setStatus(updatedMovie.status || nextStatus)
        setRating(updatedMovie.rating ?? nextRating)
        setReview(updatedMovie.review ?? nextReview)
        return true
      } catch (error) {
        console.error("상태 저장 실패:", error)
        if (!options?.silent) {
          Alert.alert("오류", "상태 변경 저장에 실패했습니다.")
        }
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [id, isSaving, rating, review]
  )

  const handleQuickStatusChange = useCallback(
    async (nextStatus: "watching" | "completed" | "watchlist") => {
      const prev = { status, rating, review }
      setStatus(nextStatus)

      const ok = await persistStatus(nextStatus, { silent: true })
      if (!ok) {
        setStatus(prev.status)
        setRating(prev.rating)
        setReview(prev.review)
        Alert.alert("오류", "상태 변경 저장에 실패했습니다.")
      }
    },
    [persistStatus, rating, review, status]
  )

  const formatKoreanDate = (value?: string | Date | null) => {
    if (!value) return null
    const parsed = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return `${parsed.getFullYear()}년 ${parsed.getMonth() + 1}월 ${parsed.getDate()}일`
  }

  const completedDateText = formatKoreanDate(movie?.watch_date ?? movie?.updated_at)

  const statusMeta = {
    watchlist: {
      label: "보고 싶은 상태",
      icon: "bookmark" as const,
      description: "아직 시청 전인 영화예요. 감상을 시작하거나 바로 시청 완료로 기록할 수 있어요.",
      toneText: COLORS.gold,
      toneBorder: "rgba(212, 175, 55, 0.45)",
      toneBackground: "rgba(212, 175, 55, 0.12)",
    },
    watching: {
      label: "시청 중",
      icon: "play-circle" as const,
      description: "지금 시청 중인 영화예요. 다 본 뒤 별점과 한줄평을 남겨보세요.",
      toneText: "#5DADE2",
      toneBorder: "rgba(93, 173, 226, 0.45)",
      toneBackground: "rgba(93, 173, 226, 0.14)",
    },
    completed: {
      label: "시청 완료",
      icon: "checkmark-circle" as const,
      description: "시청을 마친 상태예요. 별점과 한줄평은 언제든 수정할 수 있어요.",
      toneText: "#58D68D",
      toneBorder: "rgba(88, 214, 141, 0.45)",
      toneBackground: "rgba(88, 214, 141, 0.14)",
    },
  } as const

  const statusLabel: Record<typeof status, string> = {
    watchlist: "보고 싶음",
    watching: "시청 중",
    completed: "시청 완료",
  }

  const statusActions = status === "watching"
      ? [
        { next: "watchlist" as const, label: "보고 싶은 상태로 변경", icon: "bookmark-outline" as const },
        { next: "completed" as const, label: "시청 완료로 변경", icon: "checkmark-circle-outline" as const },
      ]
    : status === "completed"
      ? [
          { next: "watching" as const, label: "시청 중으로 변경", icon: "play-circle-outline" as const },
          { next: "watchlist" as const, label: "보고 싶은 상태로 변경", icon: "bookmark-outline" as const },
        ]
      : []
  const currentStatusMeta = statusMeta[status]

  const executeDelete = useCallback(async () => {
    if (isDeleting) return

    try {
      setIsDeleting(true)
      await deleteMovie(id)
      Alert.alert("삭제 완료", "영화가 삭제되었습니다.")
      navigation.goBack()
    } catch (error) {
      console.error("영화 삭제 실패:", error)
      Alert.alert("오류", "삭제에 실패했습니다.")
    } finally {
      setIsDeleting(false)
    }
  }, [id, isDeleting, navigation])

  const handleDelete = useCallback(() => {
    if (isDeleting) return

    // React Native Web에서는 Alert 버튼 콜백 동작이 제한될 수 있어 confirm 사용
    if (Platform.OS === "web") {
      const confirmed =
        typeof globalThis.confirm === "function"
          ? globalThis.confirm("정말 이 영화를 삭제하시겠습니까?")
          : false

      if (!confirmed) return
      void executeDelete()
      return
    }

    Alert.alert("영화 삭제", "정말 이 영화를 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          void executeDelete()
        },
      },
    ])
  }, [executeDelete, isDeleting])

  const handleAddTag = async (tagId: number) => {
    const targetTag = allTags.find((tag) => tag.id === tagId)
    if (!targetTag) return

    if (movieTags.some((tag) => tag.id === tagId)) return

    setMovieTags((prev) => [...prev, targetTag])
    setShowTagPicker(false)
    try {
      await addTagToMovie(id, tagId)
    } catch (error) {
      console.error("태그 추가 실패:", error)
      setMovieTags((prev) => prev.filter((tag) => tag.id !== tagId))
      Alert.alert("오류", "태그 추가에 실패했습니다.")
    }
  }

  const handleRemoveTag = async (tagId: number) => {
    const removedTag = movieTags.find((tag) => tag.id === tagId)
    setMovieTags((prev) => prev.filter((tag) => tag.id !== tagId))
    try {
      await removeTagFromMovie(id, tagId)
    } catch (error) {
      console.error("태그 삭제 실패:", error)
      if (removedTag) {
        setMovieTags((prev) => [...prev, removedTag])
      }
      Alert.alert("오류", "태그 삭제에 실패했습니다.")
    }
  }

  const handleRatingChange = async (newRating: number) => {
    const normalized = Math.max(0, Math.min(5, Math.round(newRating * 2) / 2))
    const prevRating = rating
    setRating(normalized)
    const ok = await persistStatus("completed", {
      rating: normalized,
      review,
      silent: true,
    })
    if (!ok) {
      setRating(prevRating)
      Alert.alert("오류", "별점 저장에 실패했습니다.")
    }
  }

  const getStarIconName = (value: number, star: number) => {
    if (value >= star) return "star"
    if (value >= star - 0.5) return "star-half"
    return "star-outline"
  }

  const openCompleteModal = () => {
    setPendingRating(rating || 0)
    setPendingReview(review || "")
    setShowCompleteModal(true)
  }

  const handlePendingRatingChange = (newRating: number) => {
    const normalized = Math.max(0, Math.min(5, Math.round(newRating * 2) / 2))
    setPendingRating(normalized)
  }

  const applyCompletionDraft = async () => {
    const prev = { status, rating, review }
    setRating(pendingRating)
    setReview(pendingReview)
    setStatus("completed")
    setShowCompleteModal(false)

    const ok = await persistStatus("completed", {
      rating: pendingRating,
      review: pendingReview,
      silent: true,
    })
    if (!ok) {
      setStatus(prev.status)
      setRating(prev.rating)
      setReview(prev.review)
      Alert.alert("오류", "시청 완료 저장에 실패했습니다.")
    }
  }

  const handleCompletedReviewBlur = useCallback(async () => {
    if (status !== "completed") return
    await persistStatus("completed", {
      rating,
      review,
      silent: true,
    })
  }, [persistStatus, rating, review, status])

  if (loading || !movie) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>영화 정보를 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.backdropContainer}>
        <Image source={{ uri: movie.backdrop_url || movie.poster_url }} style={styles.backdrop} />
        <View style={styles.backdropOverlay} />
      </View>

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

        <View style={styles.statusPanel}>
          <View style={styles.statusPanelHeader}>
            <Text style={styles.sectionTitle}>시청 상태</Text>
            <View
              style={[
                styles.currentStatusBadge,
                {
                  backgroundColor: currentStatusMeta.toneBackground,
                  borderColor: currentStatusMeta.toneBorder,
                },
              ]}
            >
              <Text style={[styles.currentStatusBadgeText, { color: currentStatusMeta.toneText }]}>
                {statusLabel[status]}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusGuideCard,
              {
                borderColor: currentStatusMeta.toneBorder,
                backgroundColor: currentStatusMeta.toneBackground,
              },
            ]}
          >
            <Ionicons name={currentStatusMeta.icon} size={18} color={currentStatusMeta.toneText} />
            <View style={styles.statusGuideTextWrap}>
              <Text style={[styles.statusGuideTitle, { color: currentStatusMeta.toneText }]}>
                {currentStatusMeta.label}
              </Text>
              <Text style={styles.statusGuideDescription}>{currentStatusMeta.description}</Text>
            </View>
          </View>

          {status === "watchlist" ? (
            <>
              <TouchableOpacity
                style={[styles.startWatchingButton, isSaving && styles.secondaryButtonDisabled]}
                onPress={() => {
                  void handleQuickStatusChange("watching")
                }}
                disabled={isSaving}
              >
                <Ionicons name="play-circle" size={20} color={COLORS.darkNavy} />
                <Text style={styles.startWatchingButtonText}>시청 시작하기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusActionCard,
                  styles.statusActionCardHighlight,
                  isSaving && styles.secondaryButtonDisabled,
                ]}
                onPress={openCompleteModal}
                disabled={isSaving}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.gold} />
                <Text style={[styles.statusActionCardText, styles.statusActionCardTextHighlight]}>
                  바로 시청 완료 기록
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.statusActionRow}>
              {statusActions.map((action) => {
                const isCompleteAction = action.next === "completed"
                const onPress =
                  action.next === "completed"
                    ? openCompleteModal
                    : () => {
                        void handleQuickStatusChange(action.next)
                      }
                return (
                  <TouchableOpacity
                    key={action.next}
                    style={[
                      styles.statusActionCard,
                      isCompleteAction && styles.statusActionCardHighlight,
                      isSaving && styles.secondaryButtonDisabled,
                    ]}
                    onPress={onPress}
                    disabled={isSaving}
                  >
                    <Ionicons
                      name={action.icon}
                      size={20}
                      color={isCompleteAction ? COLORS.gold : COLORS.white}
                    />
                    <Text
                      style={[
                        styles.statusActionCardText,
                        isCompleteAction && styles.statusActionCardTextHighlight,
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          <TouchableOpacity
            style={[styles.deleteRowButton, isDeleting && styles.secondaryButtonDisabled]}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={COLORS.red} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={COLORS.red} />
            )}
            <Text style={styles.deleteRowButtonText}>이 영화 삭제</Text>
          </TouchableOpacity>
        </View>

        {movie.synopsis && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>줄거리</Text>
            <Text style={styles.synopsis}>{movie.synopsis}</Text>
          </View>
        )}

        {isCompleted && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>별점 · 한줄평</Text>
            <View style={styles.feedbackCard}>
              {completedDateText && (
                <View style={styles.completedMetaRow}>
                  <Ionicons name="calendar-clear-outline" size={14} color={COLORS.lightGray} />
                  <Text style={styles.completedMetaText}>시청일 {completedDateText}</Text>
                </View>
              )}
              <View style={styles.ratingContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <View key={star} style={styles.starButton}>
                    <Ionicons
                      name={getStarIconName(rating, star)}
                      size={32}
                      color={COLORS.gold}
                      style={styles.star}
                    />
                    <View style={styles.starTouchOverlay}>
                      <TouchableOpacity
                        style={styles.starHalfLeft}
                        onPress={() => {
                          void handleRatingChange(star - 0.5)
                        }}
                      />
                      <TouchableOpacity
                        style={styles.starHalfRight}
                        onPress={() => {
                          void handleRatingChange(star)
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.ratingValue}>{rating.toFixed(1)}점</Text>

              <TextInput
                style={[styles.reviewInput, styles.reviewInputInCard]}
                placeholder="이 영화에 대한 감상을 적어보세요..."
                placeholderTextColor={COLORS.lightGray}
                multiline
                numberOfLines={4}
                value={review}
                onChangeText={setReview}
                onBlur={() => {
                  void handleCompletedReviewBlur()
                }}
                editable={!isSaving}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>태그</Text>
          <View style={styles.tagsContainer}>
            {movieTags.map((tag) => (
              <TouchableOpacity
                key={tag.id}
                style={styles.tag}
                onLongPress={() => {
                  void handleRemoveTag(tag.id)
                }}
              >
                <Text style={styles.tagText}>{tag.name}</Text>
                <TouchableOpacity
                  onPress={() => {
                    void handleRemoveTag(tag.id)
                  }}
                >
                  <Ionicons name="close-circle" size={16} color={COLORS.gold} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
              <TouchableOpacity
                style={styles.addTagButton}
                onPress={() => setShowTagPicker(!showTagPicker)}
                disabled={isSaving}
              >
                <Ionicons name="add" size={16} color={COLORS.gold} />
                <Text style={styles.addTagText}>태그 추가</Text>
            </TouchableOpacity>
          </View>

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
                      onPress={() => {
                        void handleAddTag(tag.id)
                      }}
                    >
                      <Text style={styles.tagPickerText}>{tag.name}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </View>

      <Modal
        visible={showCompleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompleteModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>시청 완료 기록</Text>
            <Text style={styles.modalSubtitle}>별점과 감상평을 입력한 뒤 완료 상태로 변경됩니다.</Text>

            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <View key={star} style={styles.starButton}>
                  <Ionicons
                    name={getStarIconName(pendingRating, star)}
                    size={32}
                    color={COLORS.gold}
                    style={styles.star}
                  />
                  <View style={styles.starTouchOverlay}>
                    <TouchableOpacity
                      style={styles.starHalfLeft}
                      onPress={() => handlePendingRatingChange(star - 0.5)}
                    />
                    <TouchableOpacity
                      style={styles.starHalfRight}
                      onPress={() => handlePendingRatingChange(star)}
                    />
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.ratingValue}>{pendingRating.toFixed(1)}점</Text>

            <TextInput
              style={[styles.reviewInput, styles.modalReviewInput]}
              placeholder="감상평을 입력해 주세요"
              placeholderTextColor={COLORS.lightGray}
              multiline
              numberOfLines={4}
              value={pendingReview}
              onChangeText={setPendingReview}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCompleteModal(false)}
              >
                <Text style={styles.modalCancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, isSaving && styles.secondaryButtonDisabled]}
                onPress={() => {
                  void applyCompletionDraft()
                }}
                disabled={isSaving}
              >
                <Text style={styles.modalConfirmButtonText}>완료로 변경</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  statusPanel: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    gap: 12,
  },
  statusPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  currentStatusBadge: {
    backgroundColor: "rgba(212, 175, 55, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.45)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentStatusBadgeText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  statusGuideCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  statusGuideTextWrap: {
    flex: 1,
    gap: 4,
  },
  statusGuideTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  statusGuideDescription: {
    fontSize: 12,
    color: COLORS.lightGray,
    lineHeight: 17,
  },
  statusActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  startWatchingButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  startWatchingButtonText: {
    color: COLORS.darkNavy,
    fontSize: 15,
    fontWeight: "700",
  },
  statusActionCard: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.darkNavy,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statusActionCardHighlight: {
    borderWidth: 1,
    borderColor: COLORS.gold,
    backgroundColor: "rgba(212, 175, 55, 0.12)",
  },
  statusActionCardText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "600",
  },
  statusActionCardTextHighlight: {
    color: COLORS.gold,
  },
  deleteRowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.5)",
    borderRadius: 12,
    backgroundColor: "rgba(231, 76, 60, 0.08)",
  },
  deleteRowButtonText: {
    color: COLORS.red,
    fontSize: 13,
    fontWeight: "600",
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
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
  feedbackCard: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 14,
    padding: 14,
  },
  completedMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  completedMetaText: {
    fontSize: 12,
    color: COLORS.lightGray,
    fontWeight: "500",
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
  starButton: {
    width: 32,
    height: 32,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  star: {
    marginRight: 0,
  },
  starTouchOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  starHalfLeft: {
    flex: 1,
  },
  starHalfRight: {
    flex: 1,
  },
  ratingValue: {
    marginTop: 10,
    color: COLORS.lightGray,
    fontSize: 13,
    fontWeight: "600",
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
  reviewInputInCard: {
    backgroundColor: COLORS.darkNavy,
    marginTop: 10,
    minHeight: 110,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: COLORS.lightGray,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  modalReviewInput: {
    backgroundColor: COLORS.darkNavy,
    minHeight: 100,
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modalCancelButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: COLORS.darkNavy,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  modalCancelButtonText: {
    color: COLORS.lightGray,
    fontSize: 14,
    fontWeight: "600",
  },
  modalConfirmButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  modalConfirmButtonText: {
    color: COLORS.darkNavy,
    fontSize: 14,
    fontWeight: "700",
  },
})
