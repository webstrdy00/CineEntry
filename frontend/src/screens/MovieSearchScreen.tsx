import { useCallback, useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from "react-native"
import { useAlert } from "../components/CustomAlert"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"

import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import {
  searchMovies,
  addMovie,
  createMovieFromMetadata,
  getMovies,
  mergeMovieMetadata,
  type MovieMetadata,
} from "../services/movieService"
import { addTagToMovie, getTags, type Tag } from "../services/tagService"

type MovieSearchScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

interface MovieSearchItem {
  title: string
  original_title?: string | null
  content_type?: "movie" | "series"
  release_channel?: "theatrical" | "ott_original" | "tv" | "unknown"
  director?: string | null
  year?: number | null
  runtime?: number | null
  total_episodes?: number | null
  genre?: string | null
  poster_url?: string | null
  backdrop_url?: string | null
  synopsis?: string | null
  kobis_code?: string | null
  tmdb_id?: number | null
  kmdb_id?: string | null
  source: string
}

interface LibraryMovieIdentity {
  title?: string | null
  original_title?: string | null
  content_type?: "movie" | "series"
  year?: number | null
  kobis_code?: string | null
  tmdb_id?: number | null
  kmdb_id?: string | null
}

interface MovieDraft {
  title: string
  original_title: string
  content_type: "movie" | "series"
  release_channel: "theatrical" | "ott_original" | "tv" | "unknown"
  director: string
  year: string
  runtime: string
  total_episodes: string
  genre: string
  synopsis: string
  poster_url: string
  backdrop_url: string
  kobis_code: string
  tmdb_id?: number | null
  kmdb_id: string
  source: string
}

const normalizeSearchText = (value?: string | null) =>
  (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\p{P}\p{S}\s_]+/gu, "")

const buildFallbackKey = (movie: Partial<MovieSearchItem>) =>
  `${movie.content_type ?? "movie"}::${normalizeSearchText(movie.title)}::${normalizeSearchText(movie.original_title)}::${movie.year ?? "na"}`

const getMovieIdentityKeys = (movie: Partial<MovieSearchItem>) => {
  const keys: string[] = []

  if (movie.tmdb_id) keys.push(`tmdb:${movie.content_type ?? "movie"}:${movie.tmdb_id}`)
  if (movie.kobis_code) keys.push(`kobis:${movie.kobis_code}`)
  if (movie.kmdb_id) keys.push(`kmdb:${movie.kmdb_id}`)
  keys.push(`fallback:${buildFallbackKey(movie)}`)

  return keys
}

const getPrimaryMovieIdentityKey = (movie: Partial<MovieSearchItem>) =>
  getMovieIdentityKeys(movie)[0] ?? `fallback:${buildFallbackKey(movie)}`

const isMovieAddedWithLookup = (movie: Partial<MovieSearchItem>, lookup: Record<string, boolean>) =>
  getMovieIdentityKeys(movie).some((key) => lookup[key])

const sortResultsByAdded = (results: MovieSearchItem[], lookup: Record<string, boolean>) =>
  [...results].sort((a, b) => {
    const aAdded = isMovieAddedWithLookup(a, lookup)
    const bAdded = isMovieAddedWithLookup(b, lookup)
    if (aAdded === bAdded) return 0
    return aAdded ? -1 : 1
  })

const toOptionalString = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const parseOptionalInt = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

const CONTENT_TYPE_OPTIONS = [
  { value: "movie" as const, label: "영화" },
  { value: "series" as const, label: "시리즈" },
]

const RELEASE_CHANNEL_OPTIONS = [
  { value: "theatrical" as const, label: "극장 개봉" },
  { value: "ott_original" as const, label: "OTT 오리지널" },
  { value: "tv" as const, label: "TV/방송" },
  { value: "unknown" as const, label: "알 수 없음" },
]

const getContentTypeLabel = (value?: string | null) =>
  value === "series" ? "시리즈" : "영화"

const getReleaseChannelLabel = (value?: string | null) =>
  RELEASE_CHANNEL_OPTIONS.find((option) => option.value === value)?.label ?? "알 수 없음"

const getDisplayImageUrl = (item: { poster_url?: string | null; backdrop_url?: string | null }) =>
  item.poster_url || item.backdrop_url || null

const createDraftFromItem = (movie: MovieSearchItem): MovieDraft => ({
  title: movie.title ?? "",
  original_title: movie.original_title ?? "",
  content_type: movie.content_type ?? "movie",
  release_channel: movie.release_channel ?? "unknown",
  director: movie.director ?? "",
  year: movie.year ? String(movie.year) : "",
  runtime: movie.runtime ? String(movie.runtime) : "",
  total_episodes: movie.total_episodes ? String(movie.total_episodes) : "",
  genre: movie.genre ?? "",
  synopsis: movie.synopsis ?? "",
  poster_url: movie.poster_url ?? "",
  backdrop_url: movie.backdrop_url ?? "",
  kobis_code: movie.kobis_code ?? "",
  tmdb_id: movie.tmdb_id ?? null,
  kmdb_id: movie.kmdb_id ?? "",
  source: movie.source ?? "unknown",
})

const mergeMovieItemWithMetadata = (movie: MovieSearchItem, metadata: MovieMetadata): MovieSearchItem => ({
  ...movie,
  title: metadata.title ?? movie.title,
  original_title: metadata.original_title ?? movie.original_title,
  content_type: metadata.content_type ?? movie.content_type ?? "movie",
  release_channel: metadata.release_channel ?? movie.release_channel ?? "unknown",
  director: metadata.director ?? movie.director,
  year: metadata.year ?? movie.year,
  runtime: metadata.runtime ?? movie.runtime,
  total_episodes: metadata.total_episodes ?? movie.total_episodes,
  genre: metadata.genre ?? movie.genre,
  poster_url: metadata.poster_url ?? movie.poster_url,
  backdrop_url: metadata.backdrop_url ?? movie.backdrop_url,
  synopsis: metadata.synopsis ?? movie.synopsis,
  kobis_code: metadata.kobis_code ?? movie.kobis_code,
  tmdb_id: metadata.tmdb_id ?? movie.tmdb_id,
  kmdb_id: metadata.kmdb_id ?? movie.kmdb_id,
})

export default function MovieSearchScreen() {
  const navigation = useNavigation<MovieSearchScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const { showAlert } = useAlert()

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<MovieSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const [selectedMovie, setSelectedMovie] = useState<MovieSearchItem | null>(null)
  const [draft, setDraft] = useState<MovieDraft | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [preparingMovieKey, setPreparingMovieKey] = useState<string | null>(null)
  const [showMetadata, setShowMetadata] = useState(false)

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [loadingTags, setLoadingTags] = useState(false)

  const [addedKeys, setAddedKeys] = useState<Record<string, boolean>>({})
  const [toastMessage, setToastMessage] = useState("")
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const hydrateAddedKeysFromLibrary = useCallback(async () => {
    try {
      const libraryMovies = (await getMovies()) as LibraryMovieIdentity[]
      setAddedKeys((prev) => {
        const next = { ...prev }
        let changed = false

        libraryMovies.forEach((movie) => {
          const identityCandidate: Partial<MovieSearchItem> = {
            title: movie.title ?? undefined,
            original_title: movie.original_title ?? undefined,
            content_type: movie.content_type ?? "movie",
            year: movie.year ?? undefined,
            kobis_code: movie.kobis_code ?? undefined,
            tmdb_id: movie.tmdb_id ?? undefined,
            kmdb_id: movie.kmdb_id ?? undefined,
          }

          getMovieIdentityKeys(identityCandidate).forEach((key) => {
            if (!next[key]) {
              next[key] = true
              changed = true
            }
          })
        })

        if (changed) {
          setSearchResults((current) => sortResultsByAdded(current, next))
          return next
        }
        return prev
      })
    } catch (error) {
      console.error("Failed to preload added movies:", error)
    }
  }, [])

  useEffect(() => {
    void hydrateAddedKeysFromLibrary()
  }, [hydrateAddedKeysFromLibrary])

  const performSearch = async (query: string) => {
    try {
      setLoading(true)
      const results = (await searchMovies(query)) as MovieSearchItem[]
      setSearchResults(sortResultsByAdded(results, addedKeys))
    } catch (error) {
      console.error("영화 검색 실패:", error)
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const markMovieAsAdded = useCallback((movie: Partial<MovieSearchItem>) => {
    setAddedKeys((prev) => {
      const next = { ...prev }
      getMovieIdentityKeys(movie).forEach((key) => {
        next[key] = true
      })
      setSearchResults((current) => sortResultsByAdded(current, next))
      return next
    })
  }, [])

  const isMovieAdded = useCallback(
    (movie: Partial<MovieSearchItem>) => isMovieAddedWithLookup(movie, addedKeys),
    [addedKeys]
  )

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage("")
      toastTimerRef.current = null
    }, 1800)
  }, [])

  const showAlreadyAddedNotice = useCallback(() => {
    showToast("보관함에 있는 작품이에요.")
  }, [showToast])

  const loadTags = useCallback(async () => {
    if (allTags.length > 0) return
    try {
      setLoadingTags(true)
      const tags = await getTags()
      setAllTags(tags)
    } catch (error) {
      console.error("태그 목록 조회 실패:", error)
      showAlert("안내", "태그 목록을 불러오지 못했어요. 태그 없이 추가는 가능합니다.")
    } finally {
      setLoadingTags(false)
    }
  }, [allTags.length])

  const handleSearch = async () => {
    const query = searchQuery.trim()
    if (!query) {
      setHasSearched(false)
      setSearchResults([])
      return
    }

    setHasSearched(true)
    await performSearch(query)
  }

  const handleSelectMovie = async (movie: MovieSearchItem) => {
    const movieKey = getPrimaryMovieIdentityKey(movie)
    if (preparingMovieKey) return

    setPreparingMovieKey(movieKey)
    setSelectedTagIds([])
    setShowMetadata(false)
    void loadTags()

    try {
      const mergedMetadata = await mergeMovieMetadata(movie)
      const mergedMovie = mergeMovieItemWithMetadata(movie, mergedMetadata)
      setSelectedMovie(mergedMovie)
      setDraft(createDraftFromItem(mergedMovie))
    } catch (error) {
      console.error("영화 메타데이터 병합 실패:", error)
      setSelectedMovie(movie)
      setDraft(createDraftFromItem(movie))
      showAlert("안내", "상세 정보를 모두 불러오지 못해 현재 검색 결과로 등록 화면을 열었어요.")
    } finally {
      setPreparingMovieKey(null)
    }
  }

  const handleBackFromEditor = (force: boolean = false) => {
    if ((isSaving || preparingMovieKey) && !force) return
    setSelectedMovie(null)
    setDraft(null)
    setSelectedTagIds([])
    setShowMetadata(false)
  }

  const updateDraftField = <K extends keyof MovieDraft>(field: K, value: MovieDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const handleSaveMovie = async () => {
    if (!draft) return

    const title = draft.title.trim()
    if (!title) {
      showAlert("입력 확인", "작품 제목을 입력해 주세요.")
      return
    }

    const duplicateCandidate: Partial<MovieSearchItem> = {
      title,
      original_title: toOptionalString(draft.original_title),
      content_type: draft.content_type,
      year: parseOptionalInt(draft.year),
      kobis_code: toOptionalString(draft.kobis_code),
      tmdb_id: draft.tmdb_id ?? undefined,
      kmdb_id: toOptionalString(draft.kmdb_id),
    }
    if (isMovieAdded(duplicateCandidate)) {
      handleBackFromEditor(true)
      showAlreadyAddedNotice()
      return
    }

    try {
      setIsSaving(true)

      const metadataPayload: Partial<MovieSearchItem> = {
        title,
        original_title: toOptionalString(draft.original_title),
        content_type: draft.content_type,
        release_channel: draft.release_channel,
        director: toOptionalString(draft.director),
        year: parseOptionalInt(draft.year),
        runtime: parseOptionalInt(draft.runtime),
        total_episodes: draft.content_type === "series" ? parseOptionalInt(draft.total_episodes) : undefined,
        genre: toOptionalString(draft.genre),
        synopsis: toOptionalString(draft.synopsis),
        poster_url: toOptionalString(draft.poster_url),
        backdrop_url: toOptionalString(draft.backdrop_url),
        kobis_code: toOptionalString(draft.kobis_code),
        tmdb_id: draft.tmdb_id ?? undefined,
        kmdb_id: toOptionalString(draft.kmdb_id),
        source: draft.source,
      }

      const createdMovie = await createMovieFromMetadata(metadataPayload)
      const addedMovie = await addMovie({
        movie_id: createdMovie.id,
        status: "watchlist",
      })

      let failedTagCount = 0
      if (selectedTagIds.length > 0) {
        const settled = await Promise.allSettled(
          selectedTagIds.map((tagId) => addTagToMovie(addedMovie.id, tagId))
        )
        failedTagCount = settled.filter((result) => result.status === "rejected").length
      }

      markMovieAsAdded(metadataPayload)
      handleBackFromEditor(true)

      if (failedTagCount > 0) {
        showAlert("일부 저장됨", `작품은 추가했지만 태그 ${failedTagCount}개 추가에 실패했어요.`)
      } else {
        showAlert("추가 완료", "보고 싶은 작품에 추가했어요.")
      }
    } catch (error: any) {
      console.error("영화 추가 실패:", error)
      if (error.response?.status === 400 || error.response?.status === 409) {
        if (selectedMovie) {
          markMovieAsAdded(selectedMovie)
        }
        handleBackFromEditor(true)
        showAlreadyAddedNotice()
      } else {
        showAlert("오류", "작품 추가에 실패했습니다.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const renderMovieItem = ({ item }: { item: MovieSearchItem }) => {
    const alreadyAdded = isMovieAdded(item)
    const isPreparing = preparingMovieKey === getPrimaryMovieIdentityKey(item)
    const isSelectionLocked = Boolean(preparingMovieKey)
    const imageUrl = getDisplayImageUrl(item)

    return (
      <TouchableOpacity
        style={[
          styles.movieItem,
          isSelectionLocked && styles.movieItemDisabled,
        ]}
        onPress={() => {
          void handleSelectMovie(item)
        }}
        activeOpacity={0.85}
        disabled={isSelectionLocked}
        accessibilityLabel={`${item.title}${item.year ? `, ${item.year}년` : ""}${alreadyAdded ? ", 보관함에 있음" : ""}`}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.poster} />
        ) : (
          <View style={[styles.poster, styles.posterFallback]}>
            <Ionicons name="image-outline" size={20} color={COLORS.lightGray} />
          </View>
        )}

        <View style={styles.movieInfo}>
          <View style={styles.resultTitleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {item.year ? <Text style={styles.resultYear}>{item.year}</Text> : null}
          </View>
          {item.original_title && item.original_title !== item.title && (
            <Text style={styles.originalTitle} numberOfLines={1}>
              {item.original_title}
            </Text>
          )}
          <View style={styles.metadata}>
            {item.director && item.director !== "Unknown" ? (
              <Text style={styles.metadataText} numberOfLines={1}>{item.director} 감독</Text>
            ) : null}
            <Text style={styles.resultTypeText} numberOfLines={1}>
              {getContentTypeLabel(item.content_type)}
              {item.release_channel && item.release_channel !== "unknown" ? ` · ${getReleaseChannelLabel(item.release_channel)}` : ""}
              {item.genre ? ` · ${item.genre}` : ""}
            </Text>
          </View>
          {alreadyAdded && (
            <View style={styles.ownedLabel} pointerEvents="none">
              <Ionicons name="bookmark-outline" size={12} color={COLORS.gold} />
              <Text style={styles.ownedLabelText}>보관함에 있음</Text>
            </View>
          )}
        </View>

        {isPreparing ? (
          <ActivityIndicator size="small" color={COLORS.gold} />
        ) : (
          <Ionicons name="chevron-forward" size={20} color={COLORS.lightGray} />
        )}
      </TouchableOpacity>
    )
  }

  const renderSearchBody = () => (
    <>
      <View style={styles.searchIntro}>
        <Text style={styles.eyebrow}>보관함에 한 편 더</Text>
        <Text style={styles.searchHeading}>기록할 작품 찾기</Text>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.lightGray} />
        <TextInput
          style={styles.searchInput}
          placeholder="작품 제목 또는 제목 + 연도"
          placeholderTextColor={COLORS.lightGray}
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text)
            if (!text.trim()) {
              setHasSearched(false)
              setSearchResults([])
            }
          }}
          onSubmitEditing={() => {
            void handleSearch()
          }}
          returnKeyType="search"
          autoFocus
        />

        <View style={styles.searchActions}>
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.searchActionButton}
              accessibilityLabel="검색어 지우기"
              onPress={() => {
                setSearchQuery("")
                setHasSearched(false)
                setSearchResults([])
              }}
            >
              <Ionicons name="close-circle" size={20} color={COLORS.lightGray} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.searchActionButton} accessibilityLabel="작품 검색" onPress={handleSearch} disabled={loading}>
            <Text style={styles.searchActionText}>검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!hasSearched ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={30} color={COLORS.lightGray} />
          <Text style={styles.emptyTitle}>어떤 작품을 기억하고 있나요?</Text>
          <Text style={styles.emptySubtitle}>제목에 연도를 더하면 같은 이름의 작품을 구분하기 쉬워요.</Text>
        </View>
      ) : loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={styles.loadingText}>검색 중...</Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={30} color={COLORS.lightGray} />
          <Text style={styles.emptyTitle}>검색 결과가 없습니다</Text>
          <Text style={styles.emptySubtitle}>작품 제목 위주로 다시 검색해보세요</Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderMovieItem}
          keyExtractor={(item, index) =>
            item.tmdb_id
              ? `tmdb-${item.tmdb_id}`
              : item.kobis_code
                ? `kobis-${item.kobis_code}`
                : item.kmdb_id
                  ? `kmdb-${item.kmdb_id}`
                  : `result-${item.source}-${item.title}-${item.year}-${index}`
          }
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={<Text style={styles.resultCount}>검색 결과 {searchResults.length}편</Text>}
        />
      )}
    </>
  )

  const renderEditorBody = () => {
    if (!draft) return null

    return (
      <ScrollView style={styles.editorContainer} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
        <View style={styles.editorTopCard}>
          {getDisplayImageUrl(draft) ? (
            <Image source={{ uri: getDisplayImageUrl(draft)! }} style={styles.editorPoster} />
          ) : (
            <View style={[styles.editorPoster, styles.posterFallback]}>
              <Ionicons name="image-outline" size={20} color={COLORS.lightGray} />
            </View>
          )}
          <View style={styles.editorTopInfo}>
            <Text style={styles.eyebrow}>작품 확인</Text>
            <Text style={styles.editorTopTitle} numberOfLines={2}>
              {draft.title || "제목 없음"}
            </Text>
            <Text style={styles.editorTopMeta}>
              {[draft.year, draft.director, getContentTypeLabel(draft.content_type)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>

        <Text style={styles.editorDescription}>
          {selectedMovie && isMovieAdded(selectedMovie)
            ? "이미 보관함에 있는 작품입니다. 기존 감상 상태와 기록은 변경되지 않아요."
            : "보고 싶은 작품으로 보관합니다. 감상 후 별점과 감상평을 남길 수 있어요."}
        </Text>

        <View style={styles.editorSection}>
          <Text style={styles.editorSectionTitle}>보관할 작품</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>제목</Text>
            <TextInput
              style={styles.input}
              value={draft.title}
              onChangeText={(text) => updateDraftField("title", text)}
              placeholder="작품 제목"
              placeholderTextColor={COLORS.lightGray}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>작품 형식</Text>
            <View style={styles.optionGrid}>
              {CONTENT_TYPE_OPTIONS.map((option) => {
                const selected = draft.content_type === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}
                    onPress={() => updateDraftField("content_type", option.value)}
                  >
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

        </View>

        <View style={styles.editorSection}>
          <TouchableOpacity style={styles.metadataToggle} onPress={() => setShowMetadata(!showMetadata)} accessibilityState={{ expanded: showMetadata }}>
            <View style={styles.metadataToggleInfo}>
              <Text style={styles.editorSectionTitle}>상세 작품 정보</Text>
              <Text style={styles.optionalHint}>선택 사항 · 검색으로 불러온 정보 확인 및 수정</Text>
            </View>
            <Ionicons name={showMetadata ? "chevron-up" : "chevron-down"} size={18} color={COLORS.lightGray} />
          </TouchableOpacity>

          {showMetadata && (
          <View style={styles.optionalFields}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>공개 방식</Text>
            <View style={styles.optionGrid}>
              {RELEASE_CHANNEL_OPTIONS.map((option) => {
                const selected = draft.release_channel === option.value
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}
                    onPress={() => updateDraftField("release_channel", option.value)}
                  >
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>원제</Text>
            <TextInput
              style={styles.input}
              value={draft.original_title}
              onChangeText={(text) => updateDraftField("original_title", text)}
              placeholder="Original title"
              placeholderTextColor={COLORS.lightGray}
            />
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, styles.inputHalf]}>
              <Text style={styles.inputLabel}>감독</Text>
              <TextInput
                style={styles.input}
                value={draft.director}
                onChangeText={(text) => updateDraftField("director", text)}
                placeholder="감독"
                placeholderTextColor={COLORS.lightGray}
              />
            </View>
            <View style={[styles.inputGroup, styles.inputHalf]}>
              <Text style={styles.inputLabel}>연도</Text>
              <TextInput
                style={styles.input}
                value={draft.year}
                onChangeText={(text) => updateDraftField("year", text.replace(/[^0-9]/g, ""))}
                placeholder="예: 2025"
                placeholderTextColor={COLORS.lightGray}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, styles.inputHalf]}>
              <Text style={styles.inputLabel}>{draft.content_type === "series" ? "회당 시간(분)" : "상영시간(분)"}</Text>
              <TextInput
                style={styles.input}
                value={draft.runtime}
                onChangeText={(text) => updateDraftField("runtime", text.replace(/[^0-9]/g, ""))}
                placeholder="예: 120"
                placeholderTextColor={COLORS.lightGray}
                keyboardType="number-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.inputHalf]}>
              <Text style={styles.inputLabel}>장르</Text>
              <TextInput
                style={styles.input}
                value={draft.genre}
                onChangeText={(text) => updateDraftField("genre", text)}
                placeholder="드라마, 액션"
                placeholderTextColor={COLORS.lightGray}
              />
            </View>
          </View>

          {draft.content_type === "series" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>전체 회차</Text>
              <TextInput
                style={styles.input}
                value={draft.total_episodes}
                onChangeText={(text) => updateDraftField("total_episodes", text.replace(/[^0-9]/g, ""))}
                placeholder="예: 8"
                placeholderTextColor={COLORS.lightGray}
                keyboardType="number-pad"
              />
            </View>
          )}
          </View>
          )}
        </View>

        <View style={styles.editorSection}>
          <Text style={styles.editorSectionTitle}>나의 태그 <Text style={styles.optionalHint}>선택 사항</Text></Text>
          {loadingTags ? (
            <View style={styles.tagLoadingRow}>
              <ActivityIndicator size="small" color={COLORS.gold} />
              <Text style={styles.tagLoadingText}>태그 불러오는 중...</Text>
            </View>
          ) : allTags.length === 0 ? (
            <Text style={styles.emptyTagText}>사용 가능한 태그가 없습니다.</Text>
          ) : (
            <View style={styles.tagGrid}>
              {allTags.map((tag) => {
                const selected = selectedTagIds.includes(tag.id)
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={[styles.tagChip, selected && styles.tagChipSelected]}
                    onPress={() => handleToggleTag(tag.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tagChipText, selected && styles.tagChipTextSelected]}>
                      {tag.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.page}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={selectedMovie ? () => handleBackFromEditor() : () => navigation.goBack()}
          disabled={isSaving}
          accessibilityLabel={selectedMovie ? "검색 결과로 돌아가기" : "이전 화면"}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{selectedMovie ? "보관함에 담기" : "작품 검색"}</Text>

        {selectedMovie ? (
          <TouchableOpacity
            style={[styles.saveHeaderButton, isSaving && styles.saveHeaderButtonDisabled]}
            onPress={() => {
              void handleSaveMovie()
            }}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.darkNavy} />
            ) : (
              <Text style={styles.saveHeaderButtonText}>보관</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightPlaceholder} />
        )}
      </View>

      {selectedMovie ? renderEditorBody() : renderSearchBody()}

      {toastMessage ? (
        <View style={styles.toastContainer} pointerEvents="none">
          <View style={styles.toastBubble}>
            <Ionicons name="bookmark" size={14} color={COLORS.darkNavy} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  page: {
    flex: 1,
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 44,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.lightGray,
  },
  headerRightPlaceholder: {
    width: 56,
  },
  saveHeaderButton: {
    minWidth: 56,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  saveHeaderButtonDisabled: {
    opacity: 0.75,
  },
  saveHeaderButtonText: {
    color: COLORS.darkNavy,
    fontSize: 13,
    fontWeight: "700",
  },
  searchIntro: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  eyebrow: {
    color: COLORS.lightGray,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  searchHeading: {
    color: COLORS.white,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.darkGray,
    borderWidth: 1,
    borderColor: COLORS.deepGray,
    marginHorizontal: 24,
    marginBottom: 20,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 3,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: COLORS.white,
    fontSize: 14,
    paddingVertical: 12,
  },
  searchActionButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  searchActionText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "500",
    color: COLORS.white,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 21,
    color: COLORS.lightGray,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginTop: 12,
  },
  resultsList: {
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  resultCount: {
    color: COLORS.lightGray,
    fontSize: 11,
    marginBottom: 8,
  },
  movieItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.deepGray,
  },
  movieItemDisabled: {
    opacity: 0.72,
  },
  poster: {
    width: 52,
    height: 78,
    borderRadius: 2,
    backgroundColor: COLORS.darkGray,
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  movieInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  resultTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: COLORS.white,
  },
  originalTitle: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.lightGray,
  },
  resultYear: {
    color: COLORS.lightGray,
    fontSize: 12,
  },
  metadata: {
    gap: 3,
  },
  metadataText: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  resultTypeText: {
    color: COLORS.lightGray,
    fontSize: 11,
    lineHeight: 16,
  },
  ownedLabel: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 3,
  },
  ownedLabelText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: "500",
  },
  editorContainer: {
    flex: 1,
  },
  editorContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 24,
  },
  editorTopCard: {
    flexDirection: "row",
    gap: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.deepGray,
  },
  editorPoster: {
    width: 88,
    height: 132,
    borderRadius: 2,
    backgroundColor: COLORS.darkGray,
  },
  editorTopInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 5,
  },
  editorTopTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "600",
    color: COLORS.white,
  },
  editorTopMeta: {
    fontSize: 12,
    lineHeight: 20,
    color: COLORS.lightGray,
  },
  editorDescription: {
    color: COLORS.lightGray,
    fontSize: 13,
    lineHeight: 22,
  },
  editorSection: {
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.deepGray,
    gap: 16,
  },
  editorSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
  },
  metadataToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
    minHeight: 44,
  },
  metadataToggleInfo: {
    flex: 1,
    gap: 6,
  },
  optionalHint: {
    color: COLORS.lightGray,
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 18,
  },
  optionalFields: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
  },
  inputHalf: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: COLORS.deepGray,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipSelected: {
    borderColor: COLORS.gold,
  },
  optionChipText: {
    color: COLORS.lightGray,
    fontSize: 12,
    fontWeight: "700",
  },
  optionChipTextSelected: {
    color: COLORS.gold,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.deepGray,
    borderRadius: 3,
    backgroundColor: COLORS.darkGray,
    color: COLORS.white,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tagLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagLoadingText: {
    color: COLORS.lightGray,
    fontSize: 13,
  },
  emptyTagText: {
    color: COLORS.lightGray,
    fontSize: 13,
  },
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: COLORS.deepGray,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: COLORS.darkGray,
  },
  tagChipSelected: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  tagChipText: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: "600",
  },
  tagChipTextSelected: {
    color: COLORS.darkNavy,
  },
  toastContainer: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 108,
    alignItems: "center",
    zIndex: 20,
  },
  toastBubble: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    backgroundColor: COLORS.gold,
    borderRadius: 3,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toastText: {
    color: COLORS.darkNavy,
    fontSize: 13,
    fontWeight: "700",
  },
})
