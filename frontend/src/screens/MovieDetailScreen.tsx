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
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getMovieDetail, updateMovie, deleteMovie } from "../services/movieService"
import { getTags, createTag, addTagToMovie, removeTagFromMovie } from "../services/tagService"
import { useAlert } from "../components/CustomAlert"

type MovieDetailScreenProps = NativeStackScreenProps<RootStackParamList, "MovieDetail">
type MovieStatus = "watching" | "completed" | "watchlist"
type ContentType = "movie" | "series"
type ReleaseChannel = "theatrical" | "ott_original" | "tv" | "unknown"

const CONTENT_TYPE_OPTIONS: Array<{ value: ContentType; label: string }> = [
  { value: "movie", label: "영화" },
  { value: "series", label: "시리즈" },
]

const RELEASE_CHANNEL_OPTIONS: Array<{ value: ReleaseChannel; label: string }> = [
  { value: "theatrical", label: "극장 개봉" },
  { value: "ott_original", label: "OTT 오리지널" },
  { value: "tv", label: "TV/방송" },
  { value: "unknown", label: "알 수 없음" },
]

const getContentTypeLabel = (value?: string | null) => (value === "series" ? "시리즈" : "영화")
const getReleaseChannelLabel = (value?: string | null) =>
  RELEASE_CHANNEL_OPTIONS.find((option) => option.value === value)?.label ?? "알 수 없음"

const STATUS_CARD_THEME = {
  surface: COLORS.darkNavy,
  primaryText: COLORS.white,
  secondaryText: COLORS.lightGray,
  mutedText: COLORS.lightGray,
  progressTrack: COLORS.deepGray,
  inputSurface: COLORS.darkGray,
  inputBorder: COLORS.deepGray,
} as const

export default function MovieDetailScreen({ route, navigation }: MovieDetailScreenProps) {
  const { id } = route.params
  const { showAlert } = useAlert()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isWide = Platform.OS === "web" && width >= 960

  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [movie, setMovie] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState("")
  const [status, setStatus] = useState<MovieStatus>("watchlist")
  const [allTags, setAllTags] = useState<any[]>([])
  const [movieTags, setMovieTags] = useState<any[]>([])

  const [genreList, setGenreList] = useState<string[]>([])
  const [showGenrePicker, setShowGenrePicker] = useState(false)
  const [customGenreInput, setCustomGenreInput] = useState("")

  const [showTagPicker, setShowTagPicker] = useState(false)
  const [newTagInput, setNewTagInput] = useState("")
  const [isBestMovie, setIsBestMovie] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)
  const [showDateModal, setShowDateModal] = useState(false)
  const [dateEditMode, setDateEditMode] = useState<"start" | "completed">("start")
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const [pendingProgress, setPendingProgress] = useState("")
  const [pendingRuntime, setPendingRuntime] = useState("")
  const [pendingSeason, setPendingSeason] = useState("")
  const [pendingEpisode, setPendingEpisode] = useState("")
  const [pendingTotalEpisodes, setPendingTotalEpisodes] = useState("")
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
      setIsBestMovie(movieData.is_best_movie || false)
      setGenreList(movieData.genre ? movieData.genre.split(",").map((g: string) => g.trim()).filter(Boolean) : [])
      setMovieTags(currentTags)
      setAllTags(tagsData)
    } catch (error) {
      console.error("MovieDetailScreen 데이터 로드 실패:", error)
      showAlert("오류", "작품 정보를 불러오지 못했습니다.")
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
          const now = new Date()
          payload.rating = options?.rating ?? rating
          payload.one_line_review = options?.review ?? review
          payload.watch_date = options?.watch_date
            ?? (status === "completed" ? movie?.watch_date : undefined)
            ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
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
        if (!options?.silent) showAlert("오류", "상태 변경 저장에 실패했습니다.")
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [id, isSaving, rating, review, status, movie?.watch_date]
  )

  const executeDelete = useCallback(async () => {
    if (isDeleting) return
    try {
      setIsDeleting(true)
      await deleteMovie(id)
      showAlert("삭제 완료", "작품이 삭제되었습니다.")
      navigation.goBack()
    } catch (error) {
      console.error("작품 삭제 실패:", error)
      showAlert("오류", "삭제에 실패했습니다.")
    } finally {
      setIsDeleting(false)
    }
  }, [id, isDeleting, navigation])

  const handleDelete = useCallback(() => {
    if (isDeleting) return
    setShowActionMenu(false)

    showAlert("작품 삭제", "정말 이 작품을 삭제하시겠습니까?", [
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
      showAlert("오류", "태그 추가에 실패했습니다.")
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
      showAlert("오류", "태그 삭제에 실패했습니다.")
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
      showAlert("오류", "별점 저장에 실패했습니다.")
    }
  }

  const handleCompletedReviewBlur = useCallback(async () => {
    if (status !== "completed") return
    await persistStatus("completed", { rating, review, silent: true })
  }, [persistStatus, rating, review, status])

  const handleToggleBestMovie = useCallback(async () => {
    if (isSaving) return
    const nextValue = !isBestMovie
    setIsBestMovie(nextValue)
    try {
      setIsSaving(true)
      const updatedMovie = await updateMovie(id, { is_best_movie: nextValue })
      setMovie(updatedMovie)
      setIsBestMovie(updatedMovie.is_best_movie || false)
    } catch (error) {
      console.error("인생 작품 토글 실패:", error)
      setIsBestMovie(!nextValue)
      showAlert("오류", "인생 작품 설정에 실패했습니다.")
    } finally {
      setIsSaving(false)
    }
  }, [id, isBestMovie, isSaving])

  const isSeries = (movie?.content_type ?? "movie") === "series"
  const isSourceMetadata = Boolean(movie && (movie.tmdb_id != null || movie.kobis_code != null || movie.kmdb_id != null))

  const openProgressModal = () => {
    setPendingProgress(String(watchingProgressMinutes || ""))
    setPendingRuntime(String(watchingRuntimeMinutes || ""))
    setPendingSeason(String(movie?.current_season || 1))
    setPendingEpisode(String(movie?.current_episode || ""))
    setPendingTotalEpisodes(String(movie?.total_episodes || ""))
    setShowProgressModal(true)
  }

  const handleSaveProgress = async () => {
    if (isSeries) {
      const season = parseInt(pendingSeason, 10)
      const episode = parseInt(pendingEpisode, 10)
      const totalEpisodes = parseInt(pendingTotalEpisodes, 10)

      if (pendingSeason.trim() && (isNaN(season) || season < 0)) {
        showAlert("알림", "올바른 시즌 번호를 입력해주세요.")
        return
      }
      if (pendingEpisode.trim() && (isNaN(episode) || episode < 0)) {
        showAlert("알림", "올바른 회차 번호를 입력해주세요.")
        return
      }
      if (!isSourceMetadata && pendingTotalEpisodes.trim() && (isNaN(totalEpisodes) || totalEpisodes < 0)) {
        showAlert("알림", "올바른 전체 회차를 입력해주세요.")
        return
      }

      setShowProgressModal(false)
      try {
        setIsSaving(true)
        const payload: any = {}
        if (pendingSeason.trim()) payload.current_season = season
        if (pendingEpisode.trim()) payload.current_episode = episode
        if (!isSourceMetadata && pendingTotalEpisodes.trim()) payload.total_episodes = totalEpisodes
        const updatedMovie = await updateMovie(id, payload)
        setMovie(updatedMovie)
      } catch (error) {
        console.error("회차 진행률 저장 실패:", error)
        showAlert("오류", "회차 진행률 저장에 실패했습니다.")
      } finally {
        setIsSaving(false)
      }
      return
    }

    const minutes = parseInt(pendingProgress, 10)
    if (pendingProgress.trim() && (isNaN(minutes) || minutes < 0)) {
      showAlert("알림", "올바른 감상 시간(분)을 입력해주세요.")
      return
    }
    const runtimeVal = parseInt(pendingRuntime, 10)
    if (!isSourceMetadata && pendingRuntime.trim() && (isNaN(runtimeVal) || runtimeVal < 0)) {
      showAlert("알림", "올바른 상영 시간(분)을 입력해주세요.")
      return
    }
    setShowProgressModal(false)
    try {
      setIsSaving(true)
      const payload: any = {}
      if (pendingProgress.trim()) payload.progress = minutes
      if (!isSourceMetadata && pendingRuntime.trim()) payload.runtime = runtimeVal
      const updatedMovie = await updateMovie(id, payload)
      setMovie(updatedMovie)
    } catch (error) {
      console.error("진행 시간 저장 실패:", error)
      showAlert("오류", "진행 시간 저장에 실패했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  const GENRE_PRESETS = [
    "드라마", "액션", "코미디", "스릴러", "로맨스", "SF", "호러",
    "애니메이션", "다큐멘터리", "범죄", "판타지", "전쟁", "뮤지컬",
    "가족", "미스터리", "어드벤처", "역사",
  ] as const

  const persistGenre = async (nextList: string[]) => {
    if (isSourceMetadata || isSaving) return
    const genreStr = nextList.join(", ")
    try {
      setIsSaving(true)
      const updatedMovie = await updateMovie(id, { genre: genreStr || "" })
      setMovie(updatedMovie)
      setGenreList(updatedMovie.genre ? updatedMovie.genre.split(",").map((g: string) => g.trim()).filter(Boolean) : [])
    } catch (error) {
      console.error("장르 저장 실패:", error)
      setGenreList(movie?.genre ? movie.genre.split(",").map((g: string) => g.trim()).filter(Boolean) : [])
      showAlert("오류", "장르 저장에 실패했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  const persistMovieMetadata = async (payload: { content_type?: ContentType; release_channel?: ReleaseChannel; total_episodes?: number }) => {
    if (isSourceMetadata || isSaving) return
    try {
      setIsSaving(true)
      const updatedMovie = await updateMovie(id, payload)
      setMovie(updatedMovie)
    } catch (error) {
      console.error("작품 정보 저장 실패:", error)
      showAlert("오류", "작품 정보 저장에 실패했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddGenre = (g: string) => {
    if (genreList.includes(g)) return
    const nextList = [...genreList, g]
    setGenreList(nextList)
    setShowGenrePicker(false)
    void persistGenre(nextList)
  }

  const handleRemoveGenre = (g: string) => {
    const nextList = genreList.filter((item) => item !== g)
    setGenreList(nextList)
    void persistGenre(nextList)
  }

  const handleCustomGenreSubmit = () => {
    const trimmed = customGenreInput.trim()
    if (!trimmed || genreList.includes(trimmed)) {
      setCustomGenreInput("")
      return
    }
    setCustomGenreInput("")
    handleAddGenre(trimmed)
  }

  const handleCreateTagAndAdd = async () => {
    const name = newTagInput.trim()
    if (!name) return
    if (movieTags.some((t) => t.name === name) || allTags.some((t) => t.name === name)) {
      const existing = allTags.find((t) => t.name === name)
      if (existing && !movieTags.some((t) => t.id === existing.id)) {
        void handleAddTag(existing.id)
      }
      setNewTagInput("")
      return
    }
    try {
      setIsSaving(true)
      const newTag = await createTag({ name })
      setAllTags((prev) => [...prev, newTag])
      setNewTagInput("")
      setMovieTags((prev) => [...prev, newTag])
      setShowTagPicker(false)
      await addTagToMovie(id, newTag.id)
    } catch (error) {
      console.error("태그 생성 실패:", error)
      showAlert("오류", "태그 생성에 실패했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

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

  const openDateModal = (initialDate?: string | Date | null, mode: "start" | "completed" = "start") => {
    const now = new Date()
    const candidate = initialDate ? new Date(initialDate) : now
    const baseDate = Number.isNaN(candidate.getTime()) ? now : candidate
    setPickerYear(baseDate.getFullYear())
    setPickerMonth(baseDate.getMonth() + 1)
    setPickerDay(baseDate.getDate())
    setDatePickerMode("day")
    setDateEditMode(mode)
    setShowDateModal(true)
    setShowActionMenu(false)
  }

  const handleSaveWatchDate = async () => {
    const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, "0")}-${String(pickerDay).padStart(2, "0")}`
    setShowDateModal(false)

    if (dateEditMode === "completed") {
      const ok = await persistStatus("completed", { watch_date: dateStr, silent: true })
      if (!ok) showAlert("오류", "감상일 저장에 실패했습니다.")
      return
    }

    const prev = { status, rating, review }
    setStatus("watching")
    const ok = await persistStatus("watching", { watch_date: dateStr, silent: true })
    if (!ok) {
      setStatus(prev.status)
      setRating(prev.rating)
      setReview(prev.review)
      showAlert("오류", "시작일 저장에 실패했습니다.")
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
      showAlert("오류", "감상 완료 저장에 실패했습니다.")
    }
  }

  const handleQuickStatusChange = async (nextStatus: MovieStatus) => {
    setShowActionMenu(false)
    if (nextStatus === "watching") return openDateModal()
    if (nextStatus === "completed") return openCompleteModal()

    const prev = { status, rating, review }
    setStatus(nextStatus)
    const ok = await persistStatus(nextStatus, { silent: true })
    if (!ok) {
      setStatus(prev.status)
      setRating(prev.rating)
      setReview(prev.review)
      showAlert("오류", "상태 변경 저장에 실패했습니다.")
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
  const currentSeason = Math.max(1, Number(movie?.current_season || 1))
  const currentEpisode = Math.max(0, Number(movie?.current_episode || 0))
  const totalEpisodes = Math.max(0, Number(movie?.total_episodes || 0))
  const movieProgressPercent = watchingRuntimeMinutes > 0 ? Math.min(100, (watchingProgressMinutes / watchingRuntimeMinutes) * 100) : 0
  const seriesProgressPercent = totalEpisodes > 0 ? Math.min(100, (currentEpisode / totalEpisodes) * 100) : 0
  const watchingProgressPercent = isSeries ? seriesProgressPercent : movieProgressPercent
  const watchingProgressLabel = isSeries
    ? totalEpisodes > 0
      ? `시즌 ${currentSeason} · ${currentEpisode}/${totalEpisodes}화`
      : `시즌 ${currentSeason} · ${currentEpisode}화까지 감상`
    : watchingRuntimeMinutes > 0
      ? `${Math.round(watchingProgressPercent)}% 진행`
      : "상영시간 정보 없음"

  const directorText = typeof movie?.director === "string" && movie.director.trim().length > 0 ? movie.director.trim() : "감독 정보 없음"

  const releaseText = (() => {
    const releaseDate = formatKoreanDate(movie?.release_date)
    const channel = movie?.release_channel
    if (releaseDate) {
      if (channel === "ott_original") return `${releaseDate} OTT 공개`
      if (channel === "tv") return `${releaseDate} 방송`
      return `${releaseDate} 개봉`
    }
    if (movie?.year) {
      if (channel === "ott_original") return `${movie.year}년 OTT 공개`
      if (channel === "tv") return `${movie.year}년 방송`
      if (channel === "theatrical") return `${movie.year}년 극장 개봉`
      return `${movie.year}년 공개`
    }
    return "공개 정보 없음"
  })()

  const synopsisText = typeof movie?.synopsis === "string" && movie.synopsis.trim().length > 0 ? movie.synopsis.trim() : "줄거리 정보가 아직 등록되지 않았어요."

  const getActionMenuItems = () => {
    const items: { label: string; icon: string; onPress: () => void; destructive?: boolean }[] = []

    if (status === "watchlist") {
      items.push({ label: "완료 기록", icon: "checkmark-circle-outline", onPress: openCompleteModal })
    }

    if (status === "watching") {
      items.push({ label: "시작일 변경", icon: "calendar-outline", onPress: () => openDateModal(movie?.watch_date) })
      items.push({ label: "완료 기록", icon: "checkmark-circle-outline", onPress: openCompleteModal })
      items.push({ label: "보고 싶음", icon: "bookmark-outline", onPress: () => void handleQuickStatusChange("watchlist") })
    }

    if (status === "completed") {
      items.push({ label: "감상일 변경", icon: "calendar-outline", onPress: () => openDateModal(movie?.watch_date, "completed") })
      items.push({ label: "다시 감상", icon: "refresh-outline", onPress: () => openDateModal() })
      items.push({ label: "보고 싶음", icon: "bookmark-outline", onPress: () => void handleQuickStatusChange("watchlist") })
    }

    items.push({ label: "삭제", icon: "trash-outline", onPress: handleDelete, destructive: true })
    return items
  }

  const renderPersonalRecord = () => (
    <View style={styles.statusSection}>
      <View style={styles.recordHeading}>
        <View>
          <Text style={styles.eyebrow}>나의 감상 기록</Text>
          <Text style={styles.recordTitle}>이 작품이 남긴 것</Text>
        </View>
        <Text style={styles.recordStatus}>
          {isSaving ? "저장 중…" : status === "completed" ? "감상 완료" : status === "watching" ? "감상 중" : "보고 싶음"}
        </Text>
      </View>

      {status === "watchlist" && (
        <View style={styles.startWatchingCard}>
          <Text style={styles.startWatchingCardTitle}>아직 쓰지 않은 감상 기록</Text>
          <Text style={styles.startWatchingCardDescription}>감상을 시작하거나, 이미 본 작품의 별점과 감상평을 남겨보세요.</Text>
          <View style={styles.recordActions}>
            <TouchableOpacity style={[styles.recordPrimaryButton, isSaving && styles.disabledButton]} onPress={() => openDateModal()} disabled={isSaving}>
              <Ionicons name="play-outline" size={16} color={COLORS.darkNavy} />
              <Text style={styles.recordPrimaryButtonText}>감상 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.recordSecondaryButton, isSaving && styles.disabledButton]} onPress={openCompleteModal} disabled={isSaving}>
              <Text style={styles.recordSecondaryButtonText}>별점 · 감상평 기록</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {status === "watching" && (
        <View style={styles.timelineCard}>
          <TouchableOpacity style={styles.timelineRow} onPress={() => openDateModal(movie.watch_date)} disabled={isSaving}>
            <View style={styles.timelineNodeColumn}>
              <View style={styles.timelineLineBelowNode} />
              <View style={styles.timelineNodeFilled} />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineNodeLabel}>감상 시작일 · 변경</Text>
              <Text style={styles.timelineNodeDate}>{movie.watch_date ? formatKoreanDate(movie.watch_date) : "날짜 선택"}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.timelineRow} onPress={openProgressModal} disabled={isSaving}>
            <View style={styles.timelineNodeColumn}>
              <View style={styles.timelineLineFull} />
            </View>
            <View style={styles.timelineProgressContent}>
              <View style={styles.timelineProgressBarTrack}>
                <View style={[styles.timelineProgressBarFill, { width: `${watchingProgressPercent}%` }]} />
              </View>
              <Text style={styles.timelineProgressLabel}>{watchingProgressLabel} · 수정</Text>
              <Text style={styles.timelineDaysLabel}>{daysElapsed ?? 1}일째 감상 중</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.timelineCompleteRow} onPress={openCompleteModal} disabled={isSaving}>
            <View style={[styles.timelineNodeColumn, styles.timelineNodeColumnBottom]}>
              <View style={styles.timelineLineAboveNode} />
              <View style={styles.timelineNodeEmpty} />
            </View>
            <View style={styles.timelineCompleteContent}>
              <Text style={styles.timelineNodeLabel}>감상 완료</Text>
            </View>
            <Text style={styles.timelineCompleteAction}>별점 · 감상평 기록</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === "completed" && (
        <View style={styles.completedCard}>
          <TouchableOpacity style={styles.completedHeader} onPress={() => openDateModal(movie.watch_date, "completed")} disabled={isSaving}>
            <Text style={styles.inputLabel}>감상일 · 변경</Text>
            <Text style={styles.completedDateText}>{formatKoreanDate(movie.watch_date) || "기록된 날짜 없음"}</Text>
            <Ionicons name="calendar-outline" size={16} color={COLORS.lightGray} />
          </TouchableOpacity>

          <Text style={styles.inputLabel}>나의 별점</Text>
          <View style={styles.ratingSection}>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <View key={star} style={styles.starButton}>
                  <Ionicons name={getStarIconName(rating, star)} size={30} color={COLORS.gold} />
                  <View style={styles.starTouchOverlay}>
                    <TouchableOpacity style={styles.starHalfLeft} accessibilityLabel={`${star - 0.5}점`} onPress={() => void handleRatingChange(star - 0.5)} disabled={isSaving} />
                    <TouchableOpacity style={styles.starHalfRight} accessibilityLabel={`${star}점`} onPress={() => void handleRatingChange(star)} disabled={isSaving} />
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.ratingValue}>{rating.toFixed(1)}점</Text>
          </View>

          <Text style={styles.inputLabel}>감상평</Text>
          <TextInput style={styles.reviewInput} placeholder="기억하고 싶은 장면과 마음을 적어보세요." placeholderTextColor={COLORS.lightGray} multiline numberOfLines={5} value={review} onChangeText={setReview} onBlur={() => void handleCompletedReviewBlur()} editable={!isSaving} />
          <Text style={styles.saveHint}>감상평은 입력을 마치면 자동으로 저장됩니다.</Text>

          <TouchableOpacity style={[styles.rewatchButton, isSaving && styles.disabledButton]} onPress={() => openDateModal()} disabled={isSaving}>
            <Ionicons name="refresh-outline" size={16} color={COLORS.gold} />
            <Text style={styles.rewatchButtonText}>다시 감상하기</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )

  if (loading || !movie) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>작품 정보를 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backButton} accessibilityLabel="이전 화면" onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerLabel}>작품과 기록</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.bestMovieButton} accessibilityLabel={isBestMovie ? "인생 작품 해제" : "인생 작품으로 표시"} onPress={() => void handleToggleBestMovie()} disabled={isSaving}>
              <Ionicons name={isBestMovie ? "heart" : "heart-outline"} size={22} color={isBestMovie ? COLORS.gold : COLORS.lightGray} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} accessibilityLabel="작품 관리" onPress={() => setShowActionMenu(true)}>
              <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>

      <View style={[styles.archiveLayout, isWide && styles.archiveLayoutWide]}>
        <View style={[styles.movieColumn, isWide && styles.movieColumnWide]}>
        <View style={[styles.heroContent, isWide && styles.heroContentWide]}>
          {movie.poster_url ? (
            <Image source={{ uri: movie.poster_url }} style={[styles.poster, isWide && styles.posterWide]} />
          ) : (
            <View style={[styles.poster, isWide && styles.posterWide, styles.posterFallback]}>
              <Ionicons name="film-outline" size={32} color={COLORS.lightGray} />
            </View>
          )}
          <View style={styles.movieInfo}>
            <Text style={styles.eyebrow}>작품</Text>
            <Text style={[styles.title, isWide && styles.titleWide]}>{movie.title}</Text>
            {movie.original_title && movie.original_title !== movie.title ? <Text style={styles.originalTitle}>{movie.original_title}</Text> : null}
            <View style={styles.heroBadgeRow}>
                <Text style={styles.heroBadgeText}>{getContentTypeLabel(movie.content_type)}</Text>
              {movie.release_channel !== "unknown" && movie.release_channel ? (
                <Text style={styles.heroBadgeText}>{getReleaseChannelLabel(movie.release_channel)}</Text>
              ) : null}
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>{directorText}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>{releaseText}</Text>
            </View>
            {movie.runtime ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoText}>{movie.runtime}분{isSeries && totalEpisodes > 0 ? ` · ${totalEpisodes}화` : ""}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {!isWide && (
          <TouchableOpacity style={styles.metadataDisclosure} onPress={() => setShowMetadata(!showMetadata)} accessibilityState={{ expanded: showMetadata }}>
            <Text style={styles.metadataDisclosureText}>줄거리 · 작품 정보</Text>
            <Ionicons name={showMetadata ? "chevron-up" : "chevron-down"} size={16} color={COLORS.lightGray} />
          </TouchableOpacity>
        )}

        {(isWide || showMetadata) && (
        <View style={styles.metadataContent}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>줄거리</Text>
          <Text style={styles.synopsis}>{synopsisText}</Text>
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{isSourceMetadata ? "작품 정보 · 읽기 전용" : "작품 정보 수정"}</Text>
          {isSourceMetadata && <Text style={styles.saveHint}>외부 출처의 작품 정보는 수정할 수 없습니다. 나의 감상 기록과 태그는 변경할 수 있어요.</Text>}
          <Text style={styles.metaControlLabel}>작품 형식</Text>
          {isSourceMetadata ? <Text style={styles.infoText}>{getContentTypeLabel(movie.content_type)}</Text> : (
          <View style={styles.metaOptionRow}>
            {CONTENT_TYPE_OPTIONS.map((option) => {
              const selected = (movie.content_type ?? "movie") === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.metaOptionChip, selected && styles.metaOptionChipSelected]}
                  onPress={() => void persistMovieMetadata({ content_type: option.value })}
                  disabled={isSaving || selected}
                >
                  <Text style={[styles.metaOptionChipText, selected && styles.metaOptionChipTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          )}

          <Text style={styles.metaControlLabel}>공개 방식</Text>
          {isSourceMetadata ? <Text style={styles.infoText}>{getReleaseChannelLabel(movie.release_channel)}</Text> : (
          <View style={styles.metaOptionRow}>
            {RELEASE_CHANNEL_OPTIONS.map((option) => {
              const selected = (movie.release_channel ?? "unknown") === option.value
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.metaOptionChip, selected && styles.metaOptionChipSelected]}
                  onPress={() => void persistMovieMetadata({ release_channel: option.value })}
                  disabled={isSaving || selected}
                >
                  <Text style={[styles.metaOptionChipText, selected && styles.metaOptionChipTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>장르</Text>
          <View style={styles.tagsContainer}>
            {genreList.map((g) => (
              isSourceMetadata ? (
                <View key={g} style={styles.tag}><Text style={styles.tagText}>{g}</Text></View>
              ) : (
              <TouchableOpacity key={g} style={styles.tag} onLongPress={() => void handleRemoveGenre(g)}>
                <Text style={styles.tagText}>{g}</Text>
                <TouchableOpacity onPress={() => void handleRemoveGenre(g)}>
                  <Ionicons name="close-circle" size={16} color={COLORS.gold} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </TouchableOpacity>
              )
            ))}
            {isSourceMetadata && genreList.length === 0 && <Text style={styles.infoText}>정보 없음</Text>}
            {!isSourceMetadata && (
            <TouchableOpacity style={styles.addTagButton} onPress={() => setShowGenrePicker(!showGenrePicker)} disabled={isSaving}>
              <Ionicons name="add" size={16} color={COLORS.gold} />
              <Text style={styles.addTagText}>장르 추가</Text>
            </TouchableOpacity>
            )}
          </View>

          {!isSourceMetadata && showGenrePicker && (
            <View style={styles.tagPicker}>
              <Text style={styles.tagPickerTitle}>장르 선택</Text>
              <View style={styles.tagPickerList}>
                {GENRE_PRESETS.filter((g) => !genreList.includes(g)).map((g) => (
                  <TouchableOpacity key={g} style={styles.tagPickerItem} onPress={() => handleAddGenre(g)}>
                    <Text style={styles.tagPickerText}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customInput}
                  value={customGenreInput}
                  onChangeText={setCustomGenreInput}
                  placeholder="직접 입력"
                  placeholderTextColor={COLORS.lightGray}
                  onSubmitEditing={handleCustomGenreSubmit}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.customInputButton} onPress={handleCustomGenreSubmit} disabled={!customGenreInput.trim()}>
                  <Ionicons name="add-circle" size={24} color={customGenreInput.trim() ? COLORS.gold : COLORS.lightGray} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        </View>
        )}
        </View>

        <View style={[styles.recordColumn, isWide && styles.recordColumnWide]}>
        {renderPersonalRecord()}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>나의 태그</Text>
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
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customInput}
                  value={newTagInput}
                  onChangeText={setNewTagInput}
                  placeholder="새 태그 만들기"
                  placeholderTextColor={COLORS.lightGray}
                  onSubmitEditing={() => void handleCreateTagAndAdd()}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.customInputButton} onPress={() => void handleCreateTagAndAdd()} disabled={!newTagInput.trim() || isSaving}>
                  <Ionicons name="add-circle" size={24} color={newTagInput.trim() ? COLORS.gold : COLORS.lightGray} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        </View>
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

      <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
        <View style={styles.centeredBackdrop}>
          <TouchableOpacity style={styles.modalDismissLayer} activeOpacity={1} onPress={() => setShowDateModal(false)} />
          <View style={styles.dateModalCard}>
            <Text style={styles.modalTitle}>{dateEditMode === "completed" ? "감상일 변경" : "감상 시작일"}</Text>
            <Text style={styles.modalSubtitle}>{dateEditMode === "completed" ? "작품을 감상한 날짜를 선택해 주세요. 감상 완료 상태는 유지됩니다." : "감상 시작 날짜를 선택해 주세요."}</Text>

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
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowDateModal(false)}><Text style={styles.modalCancelButtonText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmButton, isSaving && styles.disabledButton]} onPress={() => void handleSaveWatchDate()} disabled={isSaving}><Text style={styles.modalConfirmButtonText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCompleteModal} transparent animationType="fade" onRequestClose={() => setShowCompleteModal(false)}>
        <View style={styles.centeredBackdrop}>
          <TouchableOpacity style={styles.modalDismissLayer} activeOpacity={1} onPress={() => setShowCompleteModal(false)} />
          <View style={styles.completeModalCard}>
            <Text style={styles.modalTitle}>감상 완료 기록</Text>
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

      <Modal visible={showProgressModal} transparent animationType="fade" onRequestClose={() => setShowProgressModal(false)}>
        <View style={styles.centeredBackdrop}>
          <TouchableOpacity style={styles.modalDismissLayer} activeOpacity={1} onPress={() => setShowProgressModal(false)} />
          <View style={styles.dateModalCard}>
            <Text style={styles.modalTitle}>{isSeries ? "시리즈 진행률" : "감상 진행 시간"}</Text>
            <Text style={styles.modalSubtitle}>
              {isSeries ? "현재 시즌과 회차를 입력해 주세요." : isSourceMetadata ? "나의 감상 시간을 입력해 주세요." : "감상 시간과 총 상영시간을 입력해 주세요."}
            </Text>
            {isSourceMetadata && <Text style={styles.saveHint}>전체 회차와 상영시간은 외부 출처의 읽기 전용 정보입니다.</Text>}

            {isSeries ? (
              <>
                <Text style={styles.progressFieldLabel}>현재 시즌</Text>
                <View style={styles.progressInputRow}>
                  <TextInput
                    style={styles.progressInput}
                    value={pendingSeason}
                    onChangeText={(text) => setPendingSeason(text.replace(/[^0-9]/g, ""))}
                    placeholder="1"
                    placeholderTextColor={COLORS.lightGray}
                    keyboardType="number-pad"
                    maxLength={3}
                    autoFocus
                  />
                  <Text style={styles.progressInputUnit}>시즌</Text>
                </View>

                <Text style={styles.progressFieldLabel}>현재 회차</Text>
                <View style={styles.progressInputRow}>
                  <TextInput
                    style={styles.progressInput}
                    value={pendingEpisode}
                    onChangeText={(text) => setPendingEpisode(text.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  <Text style={styles.progressInputUnit}>화</Text>
                </View>

                <Text style={styles.progressFieldLabel}>전체 회차</Text>
                <View style={styles.progressInputRow}>
                  {isSourceMetadata ? <Text style={styles.progressInput}>{totalEpisodes > 0 ? totalEpisodes : "정보 없음"}</Text> : (
                  <TextInput
                    style={styles.progressInput}
                    value={pendingTotalEpisodes}
                    onChangeText={(text) => setPendingTotalEpisodes(text.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  )}
                  <Text style={styles.progressInputUnit}>화</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.progressFieldLabel}>현재 감상 시간</Text>
                <View style={styles.progressInputRow}>
                  <TextInput
                    style={styles.progressInput}
                    value={pendingProgress}
                    onChangeText={(text) => setPendingProgress(text.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                  />
                  <Text style={styles.progressInputUnit}>분</Text>
                </View>

                <Text style={styles.progressFieldLabel}>총 상영시간</Text>
                <View style={styles.progressInputRow}>
                  {isSourceMetadata ? <Text style={styles.progressInput}>{watchingRuntimeMinutes > 0 ? watchingRuntimeMinutes : "정보 없음"}</Text> : (
                  <TextInput
                    style={styles.progressInput}
                    value={pendingRuntime}
                    onChangeText={(text) => setPendingRuntime(text.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    placeholderTextColor={COLORS.lightGray}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                  )}
                  <Text style={styles.progressInputUnit}>분</Text>
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowProgressModal(false)}><Text style={styles.modalCancelButtonText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmButton, isSaving && styles.disabledButton]} onPress={() => void handleSaveProgress()} disabled={isSaving}><Text style={styles.modalConfirmButtonText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  pageContent: { width: "100%", maxWidth: 1160, alignSelf: "center", paddingBottom: 48 },
  headerBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 20,
  },
  headerLabel: { flex: 1, marginLeft: 8, color: COLORS.lightGray, fontSize: 12, letterSpacing: 1 },
  backButton: {
    width: 44, height: 44,
    justifyContent: "center", alignItems: "center",
  },
  headerRight: {
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  bestMovieButton: {
    width: 44, height: 44,
    justifyContent: "center", alignItems: "center",
  },
  menuButton: {
    width: 44, height: 44,
    justifyContent: "center", alignItems: "center",
  },
  archiveLayout: { paddingHorizontal: 20, gap: 28 },
  archiveLayoutWide: { flexDirection: "row", alignItems: "flex-start", gap: 56, paddingHorizontal: 32 },
  movieColumn: { minWidth: 0 },
  movieColumnWide: { width: 340 },
  recordColumn: { minWidth: 0 },
  recordColumnWide: { flex: 1, borderLeftWidth: 1, borderLeftColor: COLORS.deepGray, paddingLeft: 40 },
  heroContent: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
  heroContentWide: { flexDirection: "column", alignItems: "stretch", gap: 24 },
  poster: { width: 104, height: 156, borderRadius: 2, backgroundColor: COLORS.darkGray },
  posterWide: { width: 200, height: 300 },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  movieInfo: { flexShrink: 1, minWidth: 0, paddingTop: 2 },
  eyebrow: { color: COLORS.lightGray, fontSize: 11, letterSpacing: 1.4, marginBottom: 8 },
  title: { fontSize: 23, lineHeight: 30, fontWeight: "700", color: COLORS.white, marginBottom: 6 },
  titleWide: { fontSize: 30, lineHeight: 39 },
  originalTitle: { color: COLORS.lightGray, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  heroBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 },
  heroBadgeText: { color: COLORS.gold, fontSize: 11, fontWeight: "600" },
  infoRow: { marginBottom: 5 },
  infoText: { fontSize: 13, lineHeight: 20, color: COLORS.lightGray },
  metadataDisclosure: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, marginTop: 18, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  metadataDisclosureText: { color: COLORS.lightGray, fontSize: 12 },
  metadataContent: { marginTop: 28 },
  sectionCard: {
    marginBottom: 24, paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: COLORS.deepGray,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: COLORS.white, marginBottom: 14 },
  metaControlLabel: { color: COLORS.lightGray, fontSize: 12, marginBottom: 8 },
  metaOptionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  metaOptionChip: {
    borderWidth: 1, borderColor: COLORS.deepGray, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  metaOptionChipSelected: { borderColor: COLORS.gold },
  metaOptionChipText: { color: COLORS.lightGray, fontSize: 12, fontWeight: "500" },
  metaOptionChipTextSelected: { color: COLORS.gold },
  synopsis: { fontSize: 13, color: COLORS.lightGray, lineHeight: 23 },
  tagsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.darkGray, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 3, borderWidth: 1, borderColor: COLORS.deepGray },
  tagText: { color: COLORS.gold, fontSize: 13, fontWeight: "500" },
  addTagButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  addTagText: { color: COLORS.gold, fontSize: 13, fontWeight: "500" },
  tagPicker: { backgroundColor: COLORS.darkGray, borderRadius: 4, padding: 16, marginTop: 12 },
  tagPickerTitle: { fontSize: 14, fontWeight: "600", color: COLORS.white, marginBottom: 12 },
  tagPickerList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagPickerItem: { borderWidth: 1, borderColor: COLORS.deepGray, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 3 },
  tagPickerText: { color: COLORS.gold, fontSize: 13, fontWeight: "500" },
  customInputRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8 },
  customInput: {
    flex: 1, backgroundColor: COLORS.darkNavy, borderRadius: 3, borderWidth: 1, borderColor: COLORS.deepGray,
    paddingHorizontal: 12, paddingVertical: 8, color: COLORS.white, fontSize: 13,
  },
  customInputButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },

  statusSection: { marginBottom: 32 },
  recordHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 22, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  recordTitle: { color: COLORS.white, fontSize: 23, lineHeight: 30, fontWeight: "600" },
  recordStatus: { color: COLORS.gold, fontSize: 12 },
  startWatchingCard: {
    paddingVertical: 8,
  },
  startWatchingCardTitle: { color: STATUS_CARD_THEME.primaryText, fontSize: 17, fontWeight: "600" },
  startWatchingCardDescription: { color: STATUS_CARD_THEME.secondaryText, fontSize: 13, marginTop: 10, lineHeight: 22 },
  recordActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 22 },
  recordPrimaryButton: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: COLORS.gold, borderRadius: 3, paddingHorizontal: 16, paddingVertical: 12 },
  recordPrimaryButtonText: { color: COLORS.darkNavy, fontSize: 13, fontWeight: "600" },
  recordSecondaryButton: { borderWidth: 1, borderColor: COLORS.deepGray, borderRadius: 3, paddingHorizontal: 16, paddingVertical: 12 },
  recordSecondaryButtonText: { color: COLORS.white, fontSize: 13 },
  timelineCard: {
    position: "relative" as const, paddingVertical: 8,
  },
  timelineRow: { flexDirection: "row", alignItems: "stretch" },
  timelineCompleteRow: { flexDirection: "row", alignItems: "stretch" },
  timelineNodeColumn: { width: 20, alignItems: "center", justifyContent: "flex-start", position: "relative" as const },
  timelineNodeColumnBottom: { justifyContent: "flex-end" },
  timelineLineBelowNode: {
    position: "absolute" as const, left: 9, top: 6, bottom: 0,
    width: 2, backgroundColor: STATUS_CARD_THEME.progressTrack,
  },
  timelineLineFull: {
    position: "absolute" as const, left: 9, top: 0, bottom: 0,
    width: 2, backgroundColor: STATUS_CARD_THEME.progressTrack,
  },
  timelineLineAboveNode: {
    position: "absolute" as const, left: 9, top: 0, bottom: 6,
    width: 2, backgroundColor: STATUS_CARD_THEME.progressTrack,
  },
  timelineNodeFilled: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.gold,
  },
  timelineNodeEmpty: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
    borderColor: STATUS_CARD_THEME.mutedText, backgroundColor: STATUS_CARD_THEME.surface,
  },
  timelineContent: { flex: 1, paddingLeft: 10, paddingBottom: 14 },
  timelineCompleteContent: { flex: 1, paddingLeft: 10, paddingTop: 1 },
  timelineNodeLabel: { color: STATUS_CARD_THEME.secondaryText, fontSize: 13, fontWeight: "700" },
  timelineNodeDate: { color: STATUS_CARD_THEME.primaryText, fontSize: 15, fontWeight: "600", marginTop: 2 },
  timelineProgressContent: { flex: 1, paddingLeft: 10, paddingVertical: 10 },
  timelineProgressBarTrack: {
    height: 3, backgroundColor: STATUS_CARD_THEME.progressTrack, overflow: "hidden" as const,
  },
  timelineProgressBarFill: { height: "100%" as const, backgroundColor: COLORS.gold },
  timelineProgressLabel: { color: STATUS_CARD_THEME.primaryText, fontSize: 13, fontWeight: "700", marginTop: 6 },
  timelineDaysLabel: { color: STATUS_CARD_THEME.mutedText, fontSize: 12, fontWeight: "600", marginTop: 2 },
  timelineCompleteAction: { color: COLORS.gold, fontSize: 13, fontWeight: "700", marginLeft: "auto" as const, alignSelf: "center" },
  completedCard: {
    paddingVertical: 4,
  },
  completedHeader: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8,
    minHeight: 44, paddingBottom: 12, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray,
  },
  completedDateText: { color: STATUS_CARD_THEME.primaryText, fontSize: 13 },
  inputLabel: { color: COLORS.lightGray, fontSize: 12, marginBottom: 8 },
  ratingSection: { alignItems: "flex-start", marginBottom: 28 },
  ratingContainer: { flexDirection: "row", gap: 4 },
  starButton: { width: 44, height: 44, position: "relative", justifyContent: "center", alignItems: "center" },
  starTouchOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  starHalfLeft: { flex: 1 },
  starHalfRight: { flex: 1 },
  ratingValue: { marginTop: 6, color: COLORS.gold, fontSize: 14, fontWeight: "700" },
  reviewInput: {
    backgroundColor: STATUS_CARD_THEME.inputSurface, borderRadius: 3, borderWidth: 1,
    borderColor: STATUS_CARD_THEME.inputBorder, paddingHorizontal: 16, paddingVertical: 14,
    color: STATUS_CARD_THEME.primaryText, fontSize: 15, lineHeight: 25, minHeight: 160, textAlignVertical: "top",
  },
  saveHint: { color: COLORS.lightGray, fontSize: 11, marginTop: 10, lineHeight: 17 },
  rewatchButton: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    gap: 6, marginTop: 20, paddingVertical: 12,
  },
  rewatchButtonText: { color: COLORS.gold, fontSize: 13, fontWeight: "700" },
  bottomSheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  actionMenuCard: { width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: COLORS.darkGray, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingTop: 8, paddingBottom: 34, paddingHorizontal: 20 },
  actionMenuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 12 },
  actionMenuItemBorder: { borderTopWidth: 1, borderTopColor: COLORS.deepGray },
  actionMenuItemText: { color: COLORS.white, fontSize: 15, fontWeight: "500" },
  actionMenuCancelText: { color: COLORS.lightGray, fontSize: 15, fontWeight: "500", textAlign: "center", flex: 1 },

  centeredBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 20 },
  modalDismissLayer: { ...StyleSheet.absoluteFillObject },
  dateModalCard: { width: "100%", maxWidth: 440, alignSelf: "center", backgroundColor: COLORS.darkGray, borderRadius: 4, padding: 20 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 },
  calendarMonthButton: { width: 40, height: 40, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  calendarMonthText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  calendarHeaderTitleButton: { paddingHorizontal: 8, paddingVertical: 4 },
  calendarHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  calendarHeaderTitleIcon: { marginTop: 1 },
  calendarWeekRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.deepGray, paddingVertical: 8, marginBottom: 8 },
  calendarWeekLabel: { width: "14.285%", color: COLORS.white, fontSize: 13, fontWeight: "700", textAlign: "center" },
  calendarWeekLabelSunday: { color: COLORS.sundayRed },
  calendarWeekLabelSaturday: { color: COLORS.saturdayBlue },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", minHeight: 240, marginBottom: 8 },
  calendarDayCell: { width: "14.285%", height: 40, alignItems: "center", justifyContent: "center" },
  calendarDayButton: { borderRadius: 3, minWidth: 30, minHeight: 34, alignItems: "center", justifyContent: "center" },
  calendarDaySelected: { backgroundColor: COLORS.gold },
  calendarDayText: { color: COLORS.white, fontSize: 14, fontWeight: "500" },
  calendarDayTextSelected: { color: COLORS.darkNavy, fontWeight: "700" },
  monthYearGrid: { flexDirection: "row", flexWrap: "wrap", minHeight: 240, marginBottom: 8 },
  monthYearCell: { width: "25%", height: 54, alignItems: "center", justifyContent: "center" },
  monthYearButton: { borderRadius: 3, minWidth: 52, minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  monthYearSelected: { backgroundColor: COLORS.gold },
  monthYearText: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  monthYearTextSelected: { color: COLORS.darkNavy, fontWeight: "700" },

  completeModalCard: { width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: COLORS.darkGray, borderRadius: 4, padding: 20 },
  modalTitle: { color: COLORS.white, fontSize: 18, fontWeight: "700" },
  modalSubtitle: { color: COLORS.lightGray, fontSize: 13, marginTop: 6, marginBottom: 12, lineHeight: 18 },
  modalReviewInput: { backgroundColor: COLORS.darkNavy, borderRadius: 3, borderWidth: 1, borderColor: COLORS.deepGray, padding: 14, color: COLORS.white, fontSize: 14, lineHeight: 23, minHeight: 120, textAlignVertical: "top", marginTop: 16 },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalCancelButton: { flex: 1, borderRadius: 3, borderWidth: 1, borderColor: COLORS.deepGray, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  modalCancelButtonText: { color: COLORS.lightGray, fontSize: 14, fontWeight: "600" },
  modalConfirmButton: { flex: 1, borderRadius: 3, backgroundColor: COLORS.gold, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  modalConfirmButtonText: { color: COLORS.darkNavy, fontSize: 14, fontWeight: "700" },
  progressFieldLabel: { color: COLORS.lightGray, fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  progressInputRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  progressInput: {
    flex: 1, backgroundColor: COLORS.darkNavy, borderRadius: 3, borderWidth: 1, borderColor: COLORS.deepGray,
    paddingHorizontal: 14, paddingVertical: 12, color: COLORS.white, fontSize: 20, fontWeight: "600", textAlign: "center",
  },
  progressInputUnit: { color: COLORS.white, fontSize: 18, fontWeight: "600" },
  disabledButton: { opacity: 0.7 },
})
