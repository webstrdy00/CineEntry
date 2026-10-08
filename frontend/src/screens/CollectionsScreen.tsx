import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, useWindowDimensions } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getCollections, type Collection } from "../services/collectionService"
import CreateCollectionModal from "../components/CreateCollectionModal"

type CollectionsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function CollectionsScreen() {
  const navigation = useNavigation<CollectionsScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const contentWidth = Math.min(width, 1080)
  const horizontalPadding = width >= 720 ? 32 : 20
  const twoColumns = contentWidth >= 880
  const shelfWidth = twoColumns ? (contentWidth - horizontalPadding * 2 - 32) / 2 : contentWidth - horizontalPadding * 2

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [failedPosters, setFailedPosters] = useState<string[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setError(false)
      const data = await getCollections()
      setCollections(data)
      setFailedPosters([])
    } catch (error) {
      console.error("CollectionsScreen 로드 실패:", error)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData(false)
    setRefreshing(false)
  }, [loadData])

  useFocusEffect(
    useCallback(() => {
      void loadData()
    }, [loadData])
  )

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>컬렉션을 불러오는 중...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, maxWidth: 1080 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>컬렉션</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
        }
      >
        <View style={[styles.content, { width: contentWidth, paddingHorizontal: horizontalPadding }]}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>나의 큐레이션</Text>
            <Text style={[styles.title, width >= 720 && styles.wideTitle]} accessibilityRole="header">취향을 담은 선반</Text>
            <Text style={styles.subtitle}>같은 마음으로 묶어 둔 작품들.</Text>
            <View style={styles.introFooter}>
              {!error && <Text style={styles.collectionTotal}>컬렉션 {collections.length}개</Text>}
              <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)} accessibilityRole="button" accessibilityLabel="새 컬렉션 만들기">
                <Ionicons name="add-outline" size={18} color={COLORS.gold} />
                <Text style={styles.retryText}>컬렉션 만들기</Text>
              </TouchableOpacity>
            </View>
          </View>

          {error ? (
            <View style={styles.errorState} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>컬렉션을 불러오지 못했습니다.</Text>
              <TouchableOpacity onPress={() => void loadData(false)} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="컬렉션 다시 불러오기">
                <Ionicons name="refresh-outline" size={18} color={COLORS.gold} />
                <Text style={styles.retryText}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {collections.length > 0 ? (
            <View style={styles.list}>
              {collections.map((collection, index) => {
                const poster = collection.preview_posters?.find((url) => url && !failedPosters.includes(url))
                return (
                  <TouchableOpacity
                    key={collection.id}
                    style={[styles.shelf, { width: shelfWidth }]}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate("CollectionDetail", { id: collection.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${collection.name}, ${collection.movie_count}작품${collection.description ? `, ${collection.description}` : ""}`}
                    accessibilityHint="컬렉션의 작품을 엽니다"
                  >
                    <View style={[styles.cover, width >= 720 && styles.wideCover]}>
                      {poster ? (
                        <Image
                          source={{ uri: poster }}
                          style={styles.poster}
                          resizeMode="cover"
                          accessible={false}
                          onError={() => setFailedPosters((previous) => previous.includes(poster) ? previous : [...previous, poster])}
                        />
                      ) : (
                        <View style={styles.typographicCover}>
                          <Text style={styles.coverCaption}>컬렉션</Text>
                          <Text style={styles.coverTitle} numberOfLines={4}>{collection.name}</Text>
                          <Text style={styles.coverNumber}>{String(index + 1).padStart(2, "0")}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.shelfInfo}>
                      <Text style={styles.shelfIndex}>{String(index + 1).padStart(2, "0")} / {collection.is_auto ? "자동 컬렉션" : "나의 컬렉션"}</Text>
                      <Text style={styles.shelfName} numberOfLines={2}>{collection.name}</Text>
                      {collection.description ? <Text style={styles.shelfDescription} numberOfLines={3}>{collection.description}</Text> : null}
                      <View style={styles.shelfFooter}>
                        <Text style={styles.shelfCount}>{collection.movie_count}작품</Text>
                        <Ionicons name="arrow-forward" size={18} color={COLORS.lightGray} />
                      </View>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : !error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>아직 비어 있는 선반</Text>
              <Text style={styles.emptyText}>만든 컬렉션이 이곳에 모입니다.{"\n"}이름을 붙이고, 함께 두고 싶은 작품을 모아 보세요.</Text>
              <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)} accessibilityRole="button" accessibilityLabel="첫 컬렉션 만들기">
                <Text style={styles.retryText}>첫 컬렉션 만들기</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.gold} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <CreateCollectionModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={() => void loadData(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.darkNavy },
  loadingState: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: COLORS.lightGray, marginTop: 12 },
  header: { width: "100%", alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 12 },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 15, fontWeight: "600", color: COLORS.white },
  scrollView: { flex: 1 },
  content: { alignSelf: "center" },
  intro: { paddingTop: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  eyebrow: { fontSize: 12, fontWeight: "600", letterSpacing: 1.4, color: COLORS.gold, marginBottom: 12 },
  title: { fontSize: 30, lineHeight: 40, fontWeight: "700", letterSpacing: -1, color: COLORS.white },
  wideTitle: { fontSize: 40, lineHeight: 52 },
  subtitle: { fontSize: 15, lineHeight: 23, color: COLORS.lightGray, marginTop: 10 },
  introFooter: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18 },
  collectionTotal: { fontSize: 12, color: COLORS.lightGray },
  list: { flexDirection: "row", flexWrap: "wrap", columnGap: 32 },
  shelf: { flexDirection: "row", alignItems: "center", paddingVertical: 26, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray, gap: 20 },
  cover: { width: 80, aspectRatio: 2 / 3, borderRadius: 3, overflow: "hidden", backgroundColor: COLORS.deepGray },
  wideCover: { width: 104 },
  poster: { width: "100%", height: "100%" },
  typographicCover: { flex: 1, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.mediumGray },
  coverCaption: { fontSize: 9, color: COLORS.lightGray },
  coverTitle: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: COLORS.white },
  coverNumber: { fontSize: 11, color: COLORS.gold },
  shelfInfo: { flex: 1, minWidth: 0 },
  shelfIndex: { fontSize: 10, letterSpacing: 0.6, color: COLORS.lightGray, marginBottom: 8 },
  shelfName: { fontSize: 20, lineHeight: 28, fontWeight: "600", letterSpacing: -0.5, color: COLORS.white },
  shelfDescription: { fontSize: 13, lineHeight: 21, color: COLORS.lightGray, marginTop: 8 },
  shelfFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  shelfCount: { fontSize: 12, color: COLORS.gold },
  emptyState: { paddingVertical: 52, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  emptyTitle: { fontSize: 22, fontWeight: "600", color: COLORS.white, marginBottom: 12 },
  emptyText: { fontSize: 14, lineHeight: 24, color: COLORS.lightGray },
  createButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: 44, gap: 8 },
  errorState: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: COLORS.deepGray },
  errorText: { fontSize: 14, color: COLORS.lightGray },
  retryButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", minHeight: 44, gap: 8, marginTop: 8 },
  retryText: { fontSize: 14, fontWeight: "600", color: COLORS.gold },
})
