import { useState, useCallback } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, TextInput, ActivityIndicator, RefreshControl } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { RouteProp } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import MovieCard from "../components/MovieCard"
import type { RootStackParamList, Movie } from "../types"
import { useAlert } from "../components/CustomAlert"
import {
  getCollectionDetail,
  updateCollection,
  deleteCollection,
  addMovieToCollection,
  removeMovieFromCollection,
  syncAutoCollection
} from "../services/collectionService"

type CollectionDetailRouteProp = RouteProp<RootStackParamList, "CollectionDetail">
type CollectionDetailNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function CollectionDetailScreen() {
  const route = useRoute<CollectionDetailRouteProp>()
  const navigation = useNavigation<CollectionDetailNavigationProp>()
  const insets = useSafeAreaInsets()
  const { id } = route.params
  const { showAlert } = useAlert()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [collection, setCollection] = useState<any>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [collectionName, setCollectionName] = useState("")
  const [collectionDescription, setCollectionDescription] = useState("")

  // Load data on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [])
  )

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await getCollectionDetail(id)
      setCollection(data)
      setCollectionName(data.name)
      setCollectionDescription(data.description || "")
    } catch (error) {
      console.error('❌ CollectionDetailScreen 데이터 로드 실패:', error)
      showAlert('오류', '컬렉션 정보를 불러올 수 없습니다.')
      navigation.goBack()
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [id])

  const handleSave = async () => {
    try {
      await updateCollection(id, {
        name: collectionName,
        description: collectionDescription,
      })
      showAlert("저장 완료", `컬렉션 "${collectionName}"이(가) 업데이트되었습니다.`)
      setIsEditMode(false)
      loadData()
    } catch (error) {
      console.error('❌ 컬렉션 저장 실패:', error)
      showAlert("오류", "저장에 실패했습니다.")
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
            console.error('❌ 컬렉션 삭제 실패:', error)
            showAlert("오류", "삭제에 실패했습니다.")
          }
        },
      },
    ])
  }

  const handleRemoveMovie = (movieId: number) => {
    showAlert("영화 제거", "이 영화를 컬렉션에서 제거하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "제거",
        style: "destructive",
        onPress: async () => {
          try {
            await removeMovieFromCollection(id, movieId)
            showAlert("제거 완료", "영화가 컬렉션에서 제거되었습니다.")
            loadData()
          } catch (error) {
            console.error('❌ 영화 제거 실패:', error)
            showAlert("오류", "제거에 실패했습니다.")
          }
        },
      },
    ])
  }

  const handleSyncAutoCollection = async () => {
    try {
      await syncAutoCollection(id)
      showAlert("동기화 완료", "자동 컬렉션이 업데이트되었습니다.")
      loadData()
    } catch (error) {
      console.error('❌ 자동 컬렉션 동기화 실패:', error)
      showAlert("오류", "동기화에 실패했습니다.")
    }
  }

  const handleAddMovie = () => {
    navigation.navigate("MovieSearch")
  }

  // 로딩 중
  if (loading || !collection) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>컬렉션을 불러오는 중...</Text>
      </View>
    )
  }

  const renderMovieCard = ({ item }: { item: Movie }) => (
    <View style={styles.movieCardWrapper}>
      <MovieCard movie={item} onPress={() => navigation.navigate("MovieDetail", { id: item.id })} showRating={true} />

      {/* 편집 모드: 제거 버튼 */}
      {isEditMode && !collection.is_auto && (
        <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveMovie(item.id)}>
          <Ionicons name="close-circle" size={24} color={COLORS.red} />
        </TouchableOpacity>
      )}
    </View>
  )

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
        }
      >
        {/* 헤더 */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={COLORS.white} />
          </TouchableOpacity>

          {!isEditMode ? (
            <>
              <Text style={styles.headerTitle}>{collection.name}</Text>
              {!collection.is_auto && (
                <TouchableOpacity onPress={() => setIsEditMode(true)}>
                  <Ionicons name="create-outline" size={24} color={COLORS.gold} />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setIsEditMode(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
                <Text style={styles.saveText}>저장</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* 컬렉션 정보 */}
        <View style={styles.infoSection}>
          {!isEditMode ? (
            <>
              {collection.description && <Text style={styles.description}>{collection.description}</Text>}
              <View style={styles.metaRow}>
                <Ionicons name="film-outline" size={16} color={COLORS.lightGray} />
                <Text style={styles.metaText}>{collection.movie_count || collection.movies?.length || 0}편의 영화</Text>
                {collection.is_auto && (
                  <>
                    <Ionicons name="sparkles" size={16} color={COLORS.gold} style={styles.metaIcon} />
                    <Text style={[styles.metaText, { color: COLORS.gold }]}>자동 컬렉션</Text>
                  </>
                )}
              </View>
              {collection.is_auto && (
                <TouchableOpacity style={styles.syncButton} onPress={handleSyncAutoCollection}>
                  <Ionicons name="sync-outline" size={20} color={COLORS.gold} />
                  <Text style={styles.syncButtonText}>동기화</Text>
                </TouchableOpacity>
              )}
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
              />

              <Text style={styles.label}>설명 (선택)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={collectionDescription}
                onChangeText={setCollectionDescription}
                placeholder="컬렉션 설명 입력"
                placeholderTextColor={COLORS.lightGray}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={COLORS.red} />
                <Text style={styles.deleteButtonText}>컬렉션 삭제</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 영화 목록 */}
        <View style={styles.moviesSection}>
          <FlatList
            data={collection.movies}
            renderItem={renderMovieCard}
            keyExtractor={(item) => item.id.toString()}
            numColumns={2}
            contentContainerStyle={styles.moviesGrid}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="film-outline" size={64} color={COLORS.lightGray} />
                <Text style={styles.emptyTitle}>영화가 없습니다</Text>
                <Text style={styles.emptySubtitle}>아래 버튼을 눌러 영화를 추가해보세요</Text>
              </View>
            }
          />

          {/* 영화 추가 버튼 */}
          {!collection.is_auto && (
            <TouchableOpacity style={styles.addMovieButton} onPress={handleAddMovie}>
              <Ionicons name="add-circle-outline" size={24} color={COLORS.gold} />
              <Text style={styles.addMovieText}>영화 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.white,
  },
  cancelButton: {
    marginLeft: "auto",
    marginRight: 12,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.lightGray,
  },
  saveButton: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.darkNavy,
  },
  infoSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  description: {
    fontSize: 15,
    color: COLORS.lightGray,
    marginBottom: 12,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginLeft: 6,
  },
  metaIcon: {
    marginLeft: 16,
  },
  editForm: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.white,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(231, 76, 60, 0.1)",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.red,
  },
  moviesSection: {
    paddingHorizontal: 20,
  },
  moviesGrid: {
    paddingBottom: 16,
  },
  movieCardWrapper: {
    flex: 1,
    margin: 6,
    maxWidth: "48%",
    position: "relative",
  },
  removeButton: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(26, 29, 41, 0.9)",
    borderRadius: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  addMovieButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 16,
    gap: 8,
  },
  addMovieText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.gold,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
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
  bottomPadding: {
    height: 40,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212, 175, 55, 0.1)",
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 12,
    gap: 8,
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.gold,
  },
})
