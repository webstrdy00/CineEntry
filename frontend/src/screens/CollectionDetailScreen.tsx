import { useState, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, ActivityIndicator, RefreshControl, useWindowDimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { useAlert } from "../components/CustomAlert"
import {
  getCollectionDetail,
  updateCollection,
  deleteCollection,
  removeMovieFromCollection,
  syncAutoCollection,
  type CollectionDetail,
} from "../services/collectionService"

type CollectionDetailRouteProp = RouteProp<RootStackParamList, "CollectionDetail">
type CollectionDetailNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function CollectionDetailScreen() {
  const route = useRoute<CollectionDetailRouteProp>()
  const navigation = useNavigation<CollectionDetailNavigationProp>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { id } = route.params
  const { showAlert } = useAlert()
  const contentWidth = Math.min(width, 1080)
  const horizontalPadding = width >= 720 ? 32 : 20
  const columns = contentWidth >= 900 ? 5 : contentWidth >= 600 ? 3 : 2
  const gridGap = contentWidth >= 600 ? 20 : 16
  const posterWidth = (contentWidth - horizontalPadding * 2 - gridGap * (columns - 1)) / columns

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [collectionName, setCollectionName] = useState("")
  const [collectionDescription, setCollectionDescription] = useState("")
  const [failedPosters, setFailedPosters] = useState<number[]>([])

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      const data = await getCollectionDetail(id)
      setCollection(data)
      setCollectionName(data.name)
      setCollectionDescription(data.description || "")
      setFailedPosters([])
    } catch (error) {
      console.error("CollectionDetailScreen 데이터 로드 실패:", error)
      showAlert("오류", "컬렉션 정보를 불러올 수 없습니다.")
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }, [id, navigation, showAlert])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData(false)
    setRefreshing(false)
  }, [loadData])

  const handleSave = async () => {
    const name = collectionName.trim()
    if (!name || isSaving) return
    setIsSaving(true)
    try {
      await updateCollection(id, { name, description: collectionDescription.trim() })
      showAlert("저장 완료", `컬렉션 "${name}"이(가) 업데이트되었습니다.`)
      setIsEditMode(false)
      await loadData(false)
    } catch (error) {
      console.error("컬렉션 저장 실패:", error)
      showAlert("오류", "저장에 실패했습니다.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = () => {
    showAlert("컬렉션 삭제", `"${collection?.name}" 컬렉션을 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCollection(id)
            showAlert("삭제 완료", "컬렉션이 삭제되었습니다.")
            navigation.goBack()
          } catch (error) {
            console.error("컬렉션 삭제 실패:", error)
            showAlert("오류", "삭제에 실패했습니다.")
          }
        },
      },
    ])
  }

  const handleRemoveMovie = (movieId: number) => {
    showAlert("작품 제거", "이 작품을 컬렉션에서 제거하시겠습니까? 감상 기록은 유지됩니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "제거",
        style: "destructive",
        onPress: async () => {
          try {
            await removeMovieFromCollection(id, movieId)
            showAlert("제거 완료", "작품이 컬렉션에서 제거되었습니다.")
            await loadData(false)
          } catch (error) {
            console.error("작품 제거 실패:", error)
            showAlert("오류", "제거에 실패했습니다.")
          }
        },
      },
    ])
  }

  const handleSyncAutoCollection = async () => {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      await syncAutoCollection(id)
      showAlert("동기화 완료", "자동 컬렉션이 업데이트되었습니다.")
      await loadData(false)
    } catch (error) {
      console.error("자동 컬렉션 동기화 실패:", error)
      showAlert("오류", "동기화에 실패했습니다.")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleCancelEdit = () => {
    setCollectionName(collection?.name || "")
    setCollectionDescription(collection?.description || "")
    setIsEditMode(false)
  }

  if (loading || !collection) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>컬렉션을 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
        }
      >
        <View style={[styles.content, { width: contentWidth, paddingHorizontal: horizontalPadding }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로 가기">
              <Ionicons name="chevron-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerLabel}>컬렉션</Text>
            {isEditMode ? (
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={handleCancelEdit} style={styles.textButton} disabled={isSaving} accessibilityRole="button" accessibilityLabel="편집 취소">
                  <Text style={styles.cancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleSave()}
                  style={[styles.saveButton, (!collectionName.trim() || isSaving) && styles.disabled]}
                  disabled={!collectionName.trim() || isSaving}
                  accessibilityRole="button"
                  accessibilityLabel="컬렉션 저장"
                  accessibilityState={{ disabled: !collectionName.trim() || isSaving, busy: isSaving }}
                >
                  {isSaving ? <ActivityIndicator size="small" color={COLORS.darkNavy} /> : <Text style={styles.saveText}>저장</Text>}
                </TouchableOpacity>
              </View>
            ) : !collection.is_auto ? (
              <TouchableOpacity onPress={() => setIsEditMode(true)} style={styles.editButton} accessibilityRole="button" accessibilityLabel="컬렉션 편집">
                <Ionicons name="create-outline" size={18} color={COLORS.gold} />
                <Text style={styles.actionText}>편집</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.eyebrow}>{collection.is_auto ? "자동으로 모은 작품" : "나만의 작품 선반"}</Text>
            {!isEditMode ? (
              <>
                <Text style={[styles.collectionTitle, width >= 720 && styles.wideTitle]} accessibilityRole="header">{collection.name}</Text>
                {collection.description ? <Text style={styles.description}>{collection.description}</Text> : null}
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{collection.movie_count}작품</Text>
                  {collection.is_auto ? <Text style={styles.autoLabel}>자동 컬렉션</Text> : null}
                </View>
                {collection.is_auto ? (
                  <TouchableOpacity style={styles.syncButton} onPress={() => void handleSyncAutoCollection()} disabled={isSyncing} accessibilityRole="button" accessibilityLabel="자동 컬렉션 동기화" accessibilityState={{ disabled: isSyncing, busy: isSyncing }}>
                    {isSyncing ? <ActivityIndicator size="small" color={COLORS.gold} /> : <Ionicons name="sync-outline" size={18} color={COLORS.gold} />}
                    <Text style={styles.actionText}>{isSyncing ? "동기화 중..." : "컬렉션 동기화"}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <View style={styles.editForm}>
                <Text style={styles.label}>컬렉션 이름</Text>
                <TextInput
                  style={styles.input}
                  value={collectionName}
                  onChangeText={setCollectionName}
                  placeholder="컬렉션 이름 입력"
                  placeholderTextColor={COLORS.lightGray}
                  accessibilityLabel="컬렉션 이름"
                  editable={!isSaving}
                />
                <Text style={styles.label}>설명 (선택)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={collectionDescription}
                  onChangeText={setCollectionDescription}
                  placeholder="이 작품들을 함께 모은 이유"
                  placeholderTextColor={COLORS.lightGray}
                  accessibilityLabel="컬렉션 설명"
                  editable={!isSaving}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={isSaving} accessibilityRole="button" accessibilityLabel="컬렉션 삭제">
                  <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  <Text style={styles.deleteButtonText}>컬렉션 삭제</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">담아 둔 작품</Text>
            <Text style={styles.sectionCount}>{collection.movies.length}작품</Text>
          </View>
          {collection.movies.length > 0 ? (
            <View style={[styles.moviesGrid, { gap: gridGap }]}>
              {collection.movies.map((movie) => (
                <View key={movie.id} style={[styles.movieWrapper, { width: posterWidth }]}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate("MovieDetail", { id: movie.id })}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${movie.title}${movie.year ? `, ${movie.year}년` : ""}${movie.rating && movie.rating > 0 ? `, 별점 ${movie.rating.toFixed(1)}` : ""}`}
                    accessibilityHint="작품의 감상 기록을 엽니다"
                  >
                    <View style={styles.posterFrame}>
                      {movie.poster_url && !failedPosters.includes(movie.id) ? (
                        <Image
                          source={{ uri: movie.poster_url }}
                          style={styles.poster}
                          resizeMode="cover"
                          accessible={false}
                          onError={() => setFailedPosters((previous) => previous.includes(movie.id) ? previous : [...previous, movie.id])}
                        />
                      ) : (
                        <View style={styles.typographicPoster}>
                          <Text style={styles.posterCaption}>포스터 없음</Text>
                          <Text style={styles.posterTitle} numberOfLines={5}>{movie.title}</Text>
                          {movie.year ? <Text style={styles.posterCaption}>{movie.year}</Text> : <View />}
                        </View>
                      )}
                    </View>
                    <Text style={styles.movieTitle} numberOfLines={2}>{movie.title}</Text>
                    <View style={styles.movieMeta}>
                      <Text style={styles.movieYear}>{[movie.year, movie.content_type === "series" ? "시리즈" : null].filter(Boolean).join(" · ")}</Text>
                      {movie.rating != null && movie.rating > 0 ? (
                        <View style={styles.movieRating}>
                          <Ionicons name="star" size={11} color={COLORS.gold} />
                          <Text style={styles.ratingText}>{movie.rating.toFixed(1)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  {isEditMode && !collection.is_auto ? (
                    <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveMovie(movie.id)} accessibilityRole="button" accessibilityLabel={`${movie.title} 컬렉션에서 제거`}>
                      <Ionicons name="close" size={22} color={COLORS.white} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>아직 담아 둔 작품이 없습니다</Text>
              <Text style={styles.emptySubtitle}>{collection.is_auto ? "조건에 맞는 감상 기록이 생기면 동기화해 보세요." : "함께 두고 싶은 작품을 찾아보세요."}</Text>
            </View>
          )}

          {!collection.is_auto ? (
            <TouchableOpacity style={styles.addMovieButton} onPress={() => navigation.navigate("MovieSearch")} accessibilityRole="button" accessibilityLabel="작품 추가를 위한 검색 열기">
              <Ionicons name="add-outline" size={20} color={COLORS.gold} />
              <Text style={styles.actionText}>작품 추가</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  loadingState: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: COLORS.lightGray, marginTop: 12 },
  content: { alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 20, gap: 8 },
  backButton: { width: 44, height: 44, marginLeft: -12, alignItems: "center", justifyContent: "center" },
  headerLabel: { flex: 1, fontSize: 14, color: COLORS.lightGray },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  textButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 14, color: COLORS.lightGray },
  saveButton: { minWidth: 60, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.gold, borderRadius: 3, paddingHorizontal: 16 },
  saveText: { fontSize: 14, fontWeight: "600", color: COLORS.darkNavy },
  disabled: { opacity: 0.5 },
  editButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  actionText: { fontSize: 14, fontWeight: "600", color: COLORS.gold },
  infoSection: { paddingTop: 12, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  eyebrow: { fontSize: 12, color: COLORS.gold, fontWeight: "600", letterSpacing: 1.2, marginBottom: 14 },
  collectionTitle: { fontSize: 32, lineHeight: 43, letterSpacing: -0.8, fontWeight: "700", color: COLORS.white },
  wideTitle: { fontSize: 42, lineHeight: 54 },
  description: { maxWidth: 680, fontSize: 15, color: COLORS.lightGray, marginTop: 14, lineHeight: 25 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18, marginTop: 20 },
  metaText: { fontSize: 13, color: COLORS.white },
  autoLabel: { fontSize: 12, color: COLORS.lightGray },
  syncButton: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.mediumGray, borderRadius: 3, paddingHorizontal: 14, marginTop: 18, gap: 8 },
  editForm: { maxWidth: 680 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.lightGray, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: COLORS.deepGray, borderWidth: 1, borderColor: COLORS.mediumGray, borderRadius: 3, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 24, color: COLORS.white },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  deleteButton: { alignSelf: "flex-start", minHeight: 44, flexDirection: "row", alignItems: "center", marginTop: 20, gap: 8 },
  deleteButtonText: { fontSize: 14, fontWeight: "600", color: COLORS.red },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 28, paddingBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: COLORS.white },
  sectionCount: { fontSize: 12, color: COLORS.lightGray },
  moviesGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" },
  movieWrapper: { position: "relative" },
  posterFrame: { width: "100%", aspectRatio: 2 / 3, backgroundColor: COLORS.deepGray, borderRadius: 3, overflow: "hidden" },
  poster: { width: "100%", height: "100%" },
  typographicPoster: { flex: 1, justifyContent: "space-between", padding: 14, borderWidth: 1, borderColor: COLORS.mediumGray },
  posterCaption: { fontSize: 10, color: COLORS.lightGray },
  posterTitle: { fontSize: 17, lineHeight: 25, fontWeight: "600", color: COLORS.white },
  movieTitle: { minHeight: 42, fontSize: 14, lineHeight: 21, color: COLORS.white, fontWeight: "500", marginTop: 10 },
  movieMeta: { minHeight: 22, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 4 },
  movieYear: { fontSize: 11, color: COLORS.lightGray },
  movieRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 11, color: COLORS.gold },
  removeButton: { position: "absolute", top: 6, right: 6, backgroundColor: COLORS.darkNavy, borderWidth: 1, borderColor: COLORS.mediumGray, borderRadius: 3, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  addMovieButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", minHeight: 48, paddingHorizontal: 18, borderWidth: 1, borderColor: COLORS.mediumGray, borderRadius: 3, marginTop: 28, gap: 8 },
  emptyContainer: { paddingVertical: 36 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: COLORS.white, marginBottom: 10 },
  emptySubtitle: { fontSize: 14, lineHeight: 22, color: COLORS.lightGray },
})
