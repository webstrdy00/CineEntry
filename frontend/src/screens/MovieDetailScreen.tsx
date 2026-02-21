import { useCallback, useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getMovieDetail, updateMovie, deleteMovie } from "../services/movieService"
import { getTags, addTagToMovie, removeTagFromMovie } from "../services/tagService"

type MovieDetailScreenProps = NativeStackScreenProps<RootStackParamList, "MovieDetail">
type MovieStatus = "watching" | "completed" | "watchlist"

const STATUS_CARD_THEME = {
  surface: COLORS.deepGray,
  surfaceAlt: COLORS.darkGray,
  border: "rgba(255, 255, 255, 0.10)",
  primaryText: COLORS.white,
  secondaryText: "rgba(255, 255, 255, 0.86)",
  mutedText: "rgba(255, 255, 255, 0.65)",
  progressTrack: "rgba(255, 255, 255, 0.18)",
  inputSurface: COLORS.darkNavy,
  inputBorder: "rgba(255, 255, 255, 0.16)",
} as const

export default function MovieDetailScreen({ route, navigation }: MovieDetailScreenProps) {
  const { id } = route.params

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [movie, setMovie] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [status, setStatus] = useState<MovieStatus>("watchlist")
  const [allTags, setAllTags] = useState<any[]>([])
  const [movieTags, setMovieTags] = useState<any[]>([])

  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showStartDateModal, setShowStartDateModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [pendingRating, setPendingRating] = useState(0)
  const [pendingReview, setPendingReview] = useState("")

  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1)
  const [pickerDay, setPickerDay] = useState(new Date().getDate())
  const [datePickerMode, setDatePickerMode] = useState<"day" | "month" | "year">("day")

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [movieData, tagsData] = await Promise.all([getMovieDetail(id), getTags().catch(() => [])])

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
    void loadData()
  }, [loadData])

  const persistStatus = useCallback(
    async (
      nextStatus: MovieStatus,
      options?: {
        rating?: number
        review?: string
        watch_date?: string
        silent?: boolean
      }
    ) => {
      if (isSaving) return false

      try {
        setIsSaving(true)
        const payload: any = { status: nextStatus }

        if (nextStatus === "completed") {
          payload.rating = options?.rating ?? rating
          payload.one_line_review = options?.review ?? review
          payload.watch_date = options?.watch_date ?? new Date().toISOString().split("T")[0]
        } else {
          payload.rating = null
          payload.one_line_review = null
          if (nextStatus === "watchlist") payload.watch_date = null
        }

        if (nextStatus === "watching" && options?.watch_date) {
          payload.watch_date = options.watch_date
        }

        const updatedMovie = await updateMovie(id, payload)
        setMovie(updatedMovie)
        setStatus(updatedMovie.status || nextStatus)
        setRating(typeof updatedMovie.rating === "number" ? updatedMovie.rating : 0)
        setReview(typeof updatedMovie.review === "string" ? updatedMovie.review : "")
        return true
      } catch (error) {
        console.error("상태 저장 실패:", error)
        if (!options?.silent) Alert.alert("오류", "상태 변경 저장에 실패했습니다.")
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [id, isSaving, rating, review]
  )

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
    setShowActionMenu(false)

    if (Platform.OS === "web") {
      const confirmed = typeof globalThis.confirm === "function" ? globalThis.confirm("정말 이 영화를 삭제하시겠습니까?") : false
      if (!confirmed) return
      void executeDelete()
      return
    }

    Alert.alert("영화 삭제", "정말 이 영화를 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => void executeDelete() },
    ])
  }, [executeDelete, isDeleting])

  const handleAddTag = async (tagId: number) => {
    const targetTag = allTags.find((tag) => tag.id === tagId)
    if (!targetTag || movieTags.some((tag) => tag.id === tagId)) return

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
      if (removedTag) setMovieTags((prev) => [...prev, removedTag])
      Alert.alert("오류", "태그 삭제에 실패했습니다.")
    }
  }
  const getStarIconName = (value: number, star: number) => {
    if (value >= star) return "star"
    if (value >= star - 0.5) return "star-half"
    return "star-outline"
  }

  const handleRatingChange = async (newRating: number) => {
    const normalized = Math.max(0, Math.min(5, Math.round(newRating * 2) / 2))
    const prevRating = rating
    setRating(normalized)
    const ok = await persistStatus("completed", { rating: normalized, review, silent: true })
    if (!ok) {
      setRating(prevRating)
      Alert.alert("오류", "별점 저장에 실패했습니다.")
    }
  }

  const handleCompletedReviewBlur = useCallback(async () => {
    if (status !== "completed") return
    await persistStatus("completed", { rating, review, silent: true })
  }, [persistStatus, rating, review, status])

  const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const
  const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"] as const

  const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

  const movePickerYear = (delta: number) => {
    const nextYear = pickerYear + delta
    setPickerYear(nextYear)
    setPickerDay((prev) => Math.min(prev, getDaysInMonth(nextYear, pickerMonth)))
  }

  const movePickerMonth = (delta: number) => {
    const nextDate = new Date(pickerYear, pickerMonth - 1 + delta, 1)
    const nextYear = nextDate.getFullYear()
    const nextMonth = nextDate.getMonth() + 1
    setPickerYear(nextYear)
    setPickerMonth(nextMonth)
    setPickerDay((prev) => Math.min(prev, getDaysInMonth(nextYear, nextMonth)))
  }

  const firstWeekdayOfMonth = new Date(pickerYear, pickerMonth - 1, 1).getDay()
  const daysInCurrentMonth = getDaysInMonth(pickerYear, pickerMonth)
  const calendarDays: Array<number | null> = [
    ...Array.from({ length: firstWeekdayOfMonth }, () => null),
    ...Array.from({ length: daysInCurrentMonth }, (_, idx) => idx + 1),
  ]
  while (calendarDays.length % 7 !== 0) calendarDays.push(null)
  while (calendarDays.length < 42) calendarDays.push(null)

  const yearGridStart = Math.floor((pickerYear - 1) / 16) * 16 + 1
  const yearGrid = Array.from({ length: 16 }, (_, idx) => yearGridStart + idx)

  const pickerHeaderTitle =
    datePickerMode === "day" ? `${pickerYear}년 ${pickerMonth}월` : datePickerMode === "month" ? `${pickerYear}년` : `${yearGridStart}년 - ${yearGridStart + 15}년`

  const handlePickerHeaderPress = () => {
    if (datePickerMode === "day") return setDatePickerMode("month")
    if (datePickerMode === "month") return setDatePickerMode("year")
    setDatePickerMode("day")
  }

  const handlePickerPrev = () => {
    if (datePickerMode === "day") return movePickerMonth(-1)
    if (datePickerMode === "month") return movePickerYear(-1)
    movePickerYear(-16)
  }

  const handlePickerNext = () => {
    if (datePickerMode === "day") return movePickerMonth(1)
    if (datePickerMode === "month") return movePickerYear(1)
    movePickerYear(16)
  }

  const handleSelectPickerMonth = (month: number) => {
    setPickerMonth(month)
    setPickerDay((prev) => Math.min(prev, getDaysInMonth(pickerYear, month)))
    setDatePickerMode("day")
  }

  const handleSelectPickerYear = (year: number) => {
    setPickerYear(year)
    setPickerDay((prev) => Math.min(prev, getDaysInMonth(year, pickerMonth)))
    setDatePickerMode("month")
  }

  const openStartDateModal = (initialDate?: string | Date | null) => {
    const now = new Date()
    const candidate = initialDate ? new Date(initialDate) : now
    const baseDate = Number.isNaN(candidate.getTime()) ? now : candidate
    setPickerYear(baseDate.getFullYear())
    setPickerMonth(baseDate.getMonth() + 1)
    setPickerDay(baseDate.getDate())
    setDatePickerMode("day")
    setShowStartDateModal(true)
    setShowActionMenu(false)
  }

  const handleStartWatching = async () => {
    const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, "0")}-${String(pickerDay).padStart(2, "0")}`
    setShowStartDateModal(false)

    const prev = { status, rating, review }
    setStatus("watching")
    const ok = await persistStatus("watching", { watch_date: dateStr, silent: true })
    if (!ok) {
      setStatus(prev.status)
      setRating(prev.rating)
      setReview(prev.review)
      Alert.alert("오류", "시작일 저장에 실패했습니다.")
    }
  }

  const openCompleteModal = () => {
    setPendingRating(rating || 0)
    setPendingReview(review || "")
    setShowCompleteModal(true)
    setShowActionMenu(false)
  }

  const handlePendingRatingChange = (newRating: number) => {
    setPendingRating(Math.max(0, Math.min(5, Math.round(newRating * 2) / 2)))
  }

  const applyCompletionDraft = async () => {
    const prev = { status, rating, review }
    setRating(pendingRating)
    setReview(pendingReview)
    setStatus("completed")
    setShowCompleteModal(false)

    const ok = await persistStatus("completed", { rating: pendingRating, review: pendingReview, silent: true })
    if (!ok) {
      setStatus(prev.status)
      setRating(prev.rating)
      setReview(prev.review)
      Alert.alert("오류", "시청 완료 저장에 실패했습니다.")
    }
  }

  const handleQuickStatusChange = async (nextStatus: MovieStatus) => {
    setShowActionMenu(false)
    if (nextStatus === "watching") return openStartDateModal()
    if (nextStatus === "completed") return openCompleteModal()

    const prev = { status, rating, review }
    setStatus(nextStatus)
    const ok = await persistStatus(nextStatus, { silent: true })
    if (!ok) {
      setStatus(prev.status)
      setRating(prev.rating)
      setReview(prev.review)
      Alert.alert("오류", "상태 변경 저장에 실패했습니다.")
    }
  }
  const formatKoreanDate = (value?: string | Date | null) => {
    if (!value) return null
    const parsed = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return `${parsed.getFullYear()}년 ${parsed.getMonth() + 1}월 ${parsed.getDate()}일`
  }

  const daysElapsed = (() => {
    if (status !== "watching") return null
    const watchDate = movie?.watch_date
    if (!watchDate) return null
    const start = new Date(watchDate)
    if (Number.isNaN(start.getTime())) return null
    const diff = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, diff + 1)
  })()

  const watchingProgressMinutes = Math.max(0, Number(movie?.progress || 0))
  const watchingRuntimeMinutes = Math.max(0, Number(movie?.runtime || 0))
  const watchingProgressPercent = watchingRuntimeMinutes > 0 ? Math.min(100, (watchingProgressMinutes / watchingRuntimeMinutes) * 100) : 0
  const watchingProgressLabel = watchingRuntimeMinutes > 0 ? `${Math.round(watchingProgressPercent)}% 진행` : "상영시간 정보 없음"

  const directorText = typeof movie?.director === "string" && movie.director.trim().length > 0 ? movie.director.trim() : "감독 정보 없음"

  const releaseText = (() => {
    const releaseDate = formatKoreanDate(movie?.release_date)
    if (releaseDate) return `${releaseDate} 개봉`
    if (movie?.year) return `${movie.year}년 개봉`
    return "개봉 정보 없음"
  })()

  const synopsisText = typeof movie?.synopsis === "string" && movie.synopsis.trim().length > 0 ? movie.synopsis.trim() : "줄거리 정보가 아직 등록되지 않았어요."

  const getActionMenuItems = () => {
    const items: { label: string; icon: string; onPress: () => void; destructive?: boolean }[] = []

    if (status === "watchlist") {
      items.push({ label: "완료 기록", icon: "checkmark-circle-outline", onPress: openCompleteModal })
    }

    if (status === "watching") {
      items.push({ label: "시작일 변경", icon: "calendar-outline", onPress: () => openStartDateModal(movie?.watch_date) })
      items.push({ label: "완료 기록", icon: "checkmark-circle-outline", onPress: openCompleteModal })
      items.push({ label: "보고 싶음", icon: "bookmark-outline", onPress: () => void handleQuickStatusChange("watchlist") })
    }

    if (status === "completed") {
      items.push({ label: "다시 시청", icon: "refresh-outline", onPress: () => openStartDateModal() })
      items.push({ label: "보고 싶음", icon: "bookmark-outline", onPress: () => void handleQuickStatusChange("watchlist") })
    }

    items.push({ label: "삭제", icon: "trash-outline", onPress: handleDelete, destructive: true })
    return items
  }

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
        <TouchableOpacity style={styles.menuButton} onPress={() => setShowActionMenu(true)}>
          <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.movieHeader}>
          <Image source={{ uri: movie.poster_url }} style={styles.poster} />
          <View style={styles.movieInfo}>
            <Text style={styles.title}>{movie.title}</Text>
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={14} color={COLORS.lightGray} />
              <Text style={styles.infoText}>{directorText}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.lightGray} />
              <Text style={styles.infoText}>{releaseText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>줄거리</Text>
          <Text style={styles.synopsis}>{synopsisText}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>태그</Text>
          <View style={styles.tagsContainer}>
            {movieTags.map((tag) => (
              <TouchableOpacity key={tag.id} style={styles.tag} onLongPress={() => void handleRemoveTag(tag.id)}>
                <Text style={styles.tagText}>{tag.name}</Text>
                <TouchableOpacity onPress={() => void handleRemoveTag(tag.id)}>
                  <Ionicons name="close-circle" size={16} color={COLORS.gold} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addTagButton} onPress={() => setShowTagPicker(!showTagPicker)} disabled={isSaving}>
              <Ionicons name="add" size={16} color={COLORS.gold} />
              <Text style={styles.addTagText}>태그 추가</Text>
            </TouchableOpacity>
          </View>

          {showTagPicker && (
            <View style={styles.tagPicker}>
              <Text style={styles.tagPickerTitle}>태그 선택</Text>
              <View style={styles.tagPickerList}>
                {allTags.filter((tag) => !movieTags.find((mt) => mt.id === tag.id)).map((tag) => (
                  <TouchableOpacity key={tag.id} style={styles.tagPickerItem} onPress={() => void handleAddTag(tag.id)}>
                    <Text style={styles.tagPickerText}>{tag.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
        {status === "watchlist" && (
          <View style={styles.statusSection}>
            <TouchableOpacity style={[styles.startWatchingCard, isSaving && styles.disabledButton]} onPress={() => openStartDateModal()} disabled={isSaving}>
              <View style={styles.startWatchingCardTextWrap}>
                <Text style={styles.startWatchingCardTitle}>시청 시작</Text>
                <Text style={styles.startWatchingCardDescription}>시작 날짜를 선택해서 시청 기록을 남겨보세요.</Text>
              </View>
              <View style={styles.startWatchingCardIconCircle}>
                <Ionicons name="play" size={18} color={COLORS.darkNavy} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {status === "watching" && (
          <View style={styles.statusSection}>
            <View style={styles.statusSplitRow}>
              <View style={[styles.statusInfoCard, styles.statusInfoCardPrimary]}>
                <Text style={styles.statusInfoLabel}>시청 진행</Text>
                <View style={styles.progressMainRow}>
                  <Text style={styles.progressMainText}>{watchingProgressMinutes}</Text>
                  <Text style={styles.progressMainSubText}>분 / {watchingRuntimeMinutes}분</Text>
                </View>
                <View style={styles.progressBarTrack}><View style={[styles.progressBarFill, { width: `${watchingProgressPercent}%` }]} /></View>
                <Text style={styles.progressHint}>{watchingProgressLabel}</Text>
              </View>

              <View style={[styles.statusInfoCard, styles.statusInfoCardSecondary]}>
                <Text style={styles.statusInfoLabel}>시작일</Text>
                <Text style={styles.statusDateText}>{movie.watch_date ? formatKoreanDate(movie.watch_date) : "-"}</Text>
                <Text style={styles.statusDaysText}>{daysElapsed ?? 1}일째</Text>
              </View>
            </View>

            <View style={styles.statusActionRow}>
              <TouchableOpacity
                style={[styles.statusActionButton, styles.statusActionButtonSecondary, isSaving && styles.disabledButton]}
                onPress={() => openStartDateModal(movie.watch_date)}
                disabled={isSaving}
              >
                <Ionicons name="calendar-outline" size={18} color={STATUS_CARD_THEME.secondaryText} />
                <Text style={styles.statusActionButtonTextSecondary}>시청 시작일 변경</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusActionButton, styles.statusActionButtonPrimary, isSaving && styles.disabledButton]}
                onPress={openCompleteModal}
                disabled={isSaving}
              >
                <Ionicons name="checkmark-done" size={18} color={COLORS.darkNavy} />
                <Text style={styles.statusActionButtonTextPrimary}>시청 완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {status === "completed" && (
          <View style={styles.statusSection}>
            <View style={styles.statusSplitRow}>
              <TouchableOpacity style={[styles.statusInfoCard, styles.rewatchCard, isSaving && styles.disabledButton]} onPress={() => openStartDateModal()} disabled={isSaving}>
                <Text style={styles.statusInfoLabel}>다시 보기</Text>
                <Text style={styles.rewatchCardTitle}>다시 시청하기</Text>
                <View style={styles.rewatchCardPlayCircle}><Ionicons name="play" size={24} color={COLORS.darkNavy} /></View>
              </TouchableOpacity>

              <View style={[styles.statusInfoCard, styles.completedSummaryCard]}>
                {movie.watch_date && <Text style={styles.completedDateText}>{formatKoreanDate(movie.watch_date)}</Text>}

                <View style={styles.ratingContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <View key={star} style={styles.starButton}>
                      <Ionicons name={getStarIconName(rating, star)} size={28} color={COLORS.gold} />
                      <View style={styles.starTouchOverlay}>
                        <TouchableOpacity style={styles.starHalfLeft} onPress={() => void handleRatingChange(star - 0.5)} />
                        <TouchableOpacity style={styles.starHalfRight} onPress={() => void handleRatingChange(star)} />
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={styles.ratingValue}>{rating.toFixed(1)}점</Text>

                <TextInput style={styles.reviewInput} placeholder="감상평을 입력해 주세요" placeholderTextColor={COLORS.lightGray} multiline numberOfLines={4} value={review} onChangeText={setReview} onBlur={() => void handleCompletedReviewBlur()} editable={!isSaving} />
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </View>

      <Modal visible={showActionMenu} transparent animationType="fade" onRequestClose={() => setShowActionMenu(false)}>
        <TouchableOpacity style={styles.bottomSheetBackdrop} activeOpacity={1} onPress={() => setShowActionMenu(false)}>
          <View style={styles.actionMenuCard} onStartShouldSetResponder={() => true}>
            {getActionMenuItems().map((item, index) => (
              <TouchableOpacity key={index} style={[styles.actionMenuItem, index > 0 && styles.actionMenuItemBorder]} onPress={item.onPress}>
                <Ionicons name={item.icon as any} size={20} color={item.destructive ? COLORS.red : COLORS.white} />
                <Text style={[styles.actionMenuItemText, item.destructive && { color: COLORS.red }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.actionMenuItem, styles.actionMenuItemBorder]} onPress={() => setShowActionMenu(false)}>
              <Text style={styles.actionMenuCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showStartDateModal} transparent animationType="fade" onRequestClose={() => setShowStartDateModal(false)}>
        <View style={styles.centeredBackdrop}>
          <TouchableOpacity style={styles.modalDismissLayer} activeOpacity={1} onPress={() => setShowStartDateModal(false)} />
          <View style={styles.dateModalCard}>
            <Text style={styles.modalTitle}>시청 시작일</Text>
            <Text style={styles.modalSubtitle}>시청 시작 날짜를 선택해 주세요.</Text>

            <View style={styles.calendarHeader}>
              <TouchableOpacity style={styles.calendarMonthButton} onPress={handlePickerPrev}><Ionicons name="chevron-back" size={18} color={COLORS.lightGray} /></TouchableOpacity>
              <TouchableOpacity style={styles.calendarHeaderTitleButton} onPress={handlePickerHeaderPress}>
                <View style={styles.calendarHeaderTitleRow}>
                  <Text style={styles.calendarMonthText}>{pickerHeaderTitle}</Text>
                  <Ionicons name={datePickerMode === "year" ? "chevron-up" : "chevron-down"} size={14} color={COLORS.lightGray} style={styles.calendarHeaderTitleIcon} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarMonthButton} onPress={handlePickerNext}><Ionicons name="chevron-forward" size={18} color={COLORS.lightGray} /></TouchableOpacity>
            </View>

            {datePickerMode === "day" && (
              <>
                <View style={styles.calendarWeekRow}>
                  {WEEKDAY_LABELS.map((day, idx) => (
                    <Text key={day} style={[styles.calendarWeekLabel, idx === 0 && styles.calendarWeekLabelSunday, idx === 6 && styles.calendarWeekLabelSaturday]}>{day}</Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((day, idx) => (
                    <View key={`day-${idx}`} style={styles.calendarDayCell}>
                      {day ? (
                        <TouchableOpacity style={[styles.calendarDayButton, day === pickerDay && styles.calendarDaySelected]} onPress={() => setPickerDay(day)}>
                          <Text style={[styles.calendarDayText, day === pickerDay && styles.calendarDayTextSelected]}>{day}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
              </>
            )}

            {datePickerMode === "month" && (
              <View style={styles.monthYearGrid}>
                {MONTH_LABELS.map((monthLabel, idx) => {
                  const month = idx + 1
                  return (
                    <View key={monthLabel} style={styles.monthYearCell}>
                      <TouchableOpacity style={[styles.monthYearButton, pickerMonth === month && styles.monthYearSelected]} onPress={() => handleSelectPickerMonth(month)}>
                        <Text style={[styles.monthYearText, pickerMonth === month && styles.monthYearTextSelected]}>{monthLabel}</Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            )}

            {datePickerMode === "year" && (
              <View style={styles.monthYearGrid}>
                {yearGrid.map((year) => (
                  <View key={year} style={styles.monthYearCell}>
                    <TouchableOpacity style={[styles.monthYearButton, pickerYear === year && styles.monthYearSelected]} onPress={() => handleSelectPickerYear(year)}>
                      <Text style={[styles.monthYearText, pickerYear === year && styles.monthYearTextSelected]}>{year}년</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowStartDateModal(false)}><Text style={styles.modalCancelButtonText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmButton, isSaving && styles.disabledButton]} onPress={() => void handleStartWatching()} disabled={isSaving}><Text style={styles.modalConfirmButtonText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCompleteModal} transparent animationType="fade" onRequestClose={() => setShowCompleteModal(false)}>
        <View style={styles.centeredBackdrop}>
          <TouchableOpacity style={styles.modalDismissLayer} activeOpacity={1} onPress={() => setShowCompleteModal(false)} />
          <View style={styles.completeModalCard}>
            <Text style={styles.modalTitle}>시청 완료 기록</Text>
            <Text style={styles.modalSubtitle}>별점과 감상평을 입력한 뒤 완료 상태로 변경됩니다.</Text>

            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <View key={star} style={styles.starButton}>
                  <Ionicons name={getStarIconName(pendingRating, star)} size={32} color={COLORS.gold} />
                  <View style={styles.starTouchOverlay}>
                    <TouchableOpacity style={styles.starHalfLeft} onPress={() => handlePendingRatingChange(star - 0.5)} />
                    <TouchableOpacity style={styles.starHalfRight} onPress={() => handlePendingRatingChange(star)} />
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.ratingValue}>{pendingRating.toFixed(1)}점</Text>

            <TextInput style={styles.modalReviewInput} placeholder="감상평을 입력해 주세요" placeholderTextColor={COLORS.lightGray} multiline numberOfLines={4} value={pendingReview} onChangeText={setPendingReview} />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowCompleteModal(false)}><Text style={styles.modalCancelButtonText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmButton, isSaving && styles.disabledButton]} onPress={() => void applyCompletionDraft()} disabled={isSaving}><Text style={styles.modalConfirmButtonText}>완료</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  backdropContainer: { height: 250, position: "relative" },
  backdrop: { width: "100%", height: "100%" },
  backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(26, 29, 41, 0.6)" },
  menuButton: {
    position: "absolute", top: 48, right: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", alignItems: "center",
  },
  content: { marginTop: -50, paddingHorizontal: 20 },
  movieHeader: { flexDirection: "row", marginBottom: 24 },
  poster: { width: 120, height: 180, borderRadius: 12, borderWidth: 3, borderColor: COLORS.gold },
  movieInfo: { flex: 1, marginLeft: 16, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", color: COLORS.white, marginBottom: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 },
  infoText: { fontSize: 14, color: COLORS.lightGray },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.white, marginBottom: 12 },
  synopsis: { fontSize: 14, color: COLORS.lightGray, lineHeight: 22 },
  tagsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.deepGray, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  tagText: { color: COLORS.gold, fontSize: 13, fontWeight: "500" },
  addTagButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.deepGray, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 4 },
  addTagText: { color: COLORS.gold, fontSize: 13, fontWeight: "500" },
  tagPicker: { backgroundColor: COLORS.deepGray, borderRadius: 12, padding: 16, marginTop: 12 },
  tagPickerTitle: { fontSize: 14, fontWeight: "600", color: COLORS.white, marginBottom: 12 },
  tagPickerList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagPickerItem: { backgroundColor: COLORS.darkNavy, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  tagPickerText: { color: COLORS.gold, fontSize: 13, fontWeight: "500" },

  statusSection: { marginBottom: 24 },
  startWatchingCard: {
    borderRadius: 18, backgroundColor: STATUS_CARD_THEME.surface, borderWidth: 1, borderColor: STATUS_CARD_THEME.border,
    paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  startWatchingCardTextWrap: { flex: 1, paddingRight: 10 },
  startWatchingCardTitle: { color: STATUS_CARD_THEME.primaryText, fontSize: 19, fontWeight: "700" },
  startWatchingCardDescription: { color: STATUS_CARD_THEME.secondaryText, fontSize: 13, marginTop: 6, lineHeight: 19 },
  startWatchingCardIconCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.gold, alignItems: "center", justifyContent: "center" },
  statusSplitRow: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  statusInfoCard: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: STATUS_CARD_THEME.border, paddingHorizontal: 14, paddingVertical: 14 },
  statusInfoCardPrimary: { backgroundColor: STATUS_CARD_THEME.surface, justifyContent: "center" },
  statusInfoCardSecondary: { backgroundColor: STATUS_CARD_THEME.surfaceAlt, justifyContent: "space-between" },
  statusInfoLabel: { color: STATUS_CARD_THEME.secondaryText, fontSize: 12, fontWeight: "700" },
  progressMainRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
  progressMainText: { color: STATUS_CARD_THEME.primaryText, fontSize: 34, fontWeight: "800", lineHeight: 38 },
  progressMainSubText: { color: STATUS_CARD_THEME.secondaryText, fontSize: 13, fontWeight: "600", marginLeft: 5, marginBottom: 5 },
  progressBarTrack: { marginTop: 10, height: 7, borderRadius: 4, backgroundColor: STATUS_CARD_THEME.progressTrack, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: COLORS.gold },
  progressHint: { marginTop: 7, color: STATUS_CARD_THEME.mutedText, fontSize: 12, fontWeight: "600" },
  statusDateText: { marginTop: 8, color: STATUS_CARD_THEME.secondaryText, fontSize: 14, fontWeight: "600" },
  statusDaysText: { color: STATUS_CARD_THEME.primaryText, fontSize: 34, fontWeight: "800", lineHeight: 38, marginTop: 10 },
  statusActionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  statusActionButton: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
  statusActionButtonSecondary: { backgroundColor: STATUS_CARD_THEME.surfaceAlt, borderColor: STATUS_CARD_THEME.border },
  statusActionButtonPrimary: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  statusActionButtonTextSecondary: { color: STATUS_CARD_THEME.secondaryText, fontSize: 13, fontWeight: "700" },
  statusActionButtonTextPrimary: { color: COLORS.darkNavy, fontSize: 13, fontWeight: "700" },
  rewatchCard: { backgroundColor: STATUS_CARD_THEME.surface, justifyContent: "space-between" },
  rewatchCardTitle: { color: STATUS_CARD_THEME.primaryText, fontSize: 20, fontWeight: "700", marginTop: 8 },
  rewatchCardPlayCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#d4af37", alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 16 },
  completedSummaryCard: { backgroundColor: STATUS_CARD_THEME.surfaceAlt, justifyContent: "flex-start" },
  completedDateText: { color: STATUS_CARD_THEME.mutedText, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  ratingContainer: { flexDirection: "row", gap: 5 },
  starButton: { width: 32, height: 32, position: "relative", justifyContent: "center", alignItems: "center" },
  starTouchOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  starHalfLeft: { flex: 1 },
  starHalfRight: { flex: 1 },
  ratingValue: { marginTop: 8, color: COLORS.gold, fontSize: 13, fontWeight: "700" },
  reviewInput: { backgroundColor: STATUS_CARD_THEME.inputSurface, borderRadius: 12, borderWidth: 1, borderColor: STATUS_CARD_THEME.inputBorder, paddingHorizontal: 12, paddingVertical: 10, color: STATUS_CARD_THEME.primaryText, fontSize: 13, minHeight: 88, textAlignVertical: "top", marginTop: 8 },
  bottomSheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  actionMenuCard: { backgroundColor: COLORS.deepGray, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 34, paddingHorizontal: 16 },
  actionMenuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 12 },
  actionMenuItemBorder: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  actionMenuItemText: { color: COLORS.white, fontSize: 15, fontWeight: "500" },
  actionMenuCancelText: { color: COLORS.lightGray, fontSize: 15, fontWeight: "500", textAlign: "center", flex: 1 },

  centeredBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 20 },
  modalDismissLayer: { ...StyleSheet.absoluteFillObject },
  dateModalCard: { backgroundColor: COLORS.deepGray, borderRadius: 16, padding: 20 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  calendarMonthButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.darkNavy, alignItems: "center", justifyContent: "center" },
  calendarMonthText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  calendarHeaderTitleButton: { paddingHorizontal: 8, paddingVertical: 4 },
  calendarHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  calendarHeaderTitleIcon: { marginTop: 1 },
  calendarWeekRow: { flexDirection: "row", backgroundColor: COLORS.darkNavy, borderRadius: 10, paddingVertical: 8, marginBottom: 8 },
  calendarWeekLabel: { width: "14.285%", color: COLORS.white, fontSize: 13, fontWeight: "700", textAlign: "center" },
  calendarWeekLabelSunday: { color: "#E67A7A" },
  calendarWeekLabelSaturday: { color: "#7AADE6" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", minHeight: 240, marginBottom: 8 },
  calendarDayCell: { width: "14.285%", height: 40, alignItems: "center", justifyContent: "center" },
  calendarDayButton: { borderRadius: 20, minWidth: 34, minHeight: 34, alignItems: "center", justifyContent: "center" },
  calendarDaySelected: { backgroundColor: COLORS.gold },
  calendarDayText: { color: COLORS.white, fontSize: 14, fontWeight: "500" },
  calendarDayTextSelected: { color: COLORS.darkNavy, fontWeight: "700" },
  monthYearGrid: { flexDirection: "row", flexWrap: "wrap", minHeight: 240, marginBottom: 8 },
  monthYearCell: { width: "25%", height: 54, alignItems: "center", justifyContent: "center" },
  monthYearButton: { borderRadius: 12, minWidth: 64, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  monthYearSelected: { backgroundColor: COLORS.gold },
  monthYearText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  monthYearTextSelected: { color: COLORS.darkNavy, fontWeight: "700" },

  completeModalCard: { backgroundColor: COLORS.deepGray, borderRadius: 16, padding: 20 },
  modalTitle: { color: COLORS.white, fontSize: 18, fontWeight: "700" },
  modalSubtitle: { color: COLORS.lightGray, fontSize: 13, marginTop: 6, marginBottom: 12, lineHeight: 18 },
  modalReviewInput: { backgroundColor: COLORS.darkNavy, borderRadius: 12, padding: 16, color: COLORS.white, fontSize: 14, minHeight: 100, textAlignVertical: "top", marginTop: 8 },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalCancelButton: { flex: 1, borderRadius: 10, backgroundColor: COLORS.darkNavy, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  modalCancelButtonText: { color: COLORS.lightGray, fontSize: 14, fontWeight: "600" },
  modalConfirmButton: { flex: 1, borderRadius: 10, backgroundColor: COLORS.gold, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  modalConfirmButtonText: { color: COLORS.darkNavy, fontSize: 14, fontWeight: "700" },
  disabledButton: { opacity: 0.7 },
  bottomPadding: { height: 40 },
})
