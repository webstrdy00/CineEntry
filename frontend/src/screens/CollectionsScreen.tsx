import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { getCollections, type Collection } from "../services/collectionService"

type CollectionsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function CollectionsScreen() {
  const navigation = useNavigation<CollectionsScreenNavigationProp>()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getCollections()
      setCollections(data)
    } catch (error) {
      console.error('CollectionsScreen 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    const data = await getCollections().catch(() => [])
    setCollections(data)
    setRefreshing(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>컬렉션</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
        }
      >
        {collections.length > 0 ? (
          <View style={styles.list}>
            {collections.map((collection) => (
              <TouchableOpacity
                key={collection.id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("CollectionDetail", { id: collection.id })}
              >
                <View style={styles.posterRow}>
                  {(collection.preview_posters?.length > 0) ? (
                    collection.preview_posters.slice(0, 3).map((url, idx) => (
                      <Image key={idx} source={{ uri: url }} style={styles.poster} />
                    ))
                  ) : (
                    <View style={styles.emptyPoster}>
                      <Ionicons name="sparkles" size={32} color={COLORS.lightGray} />
                    </View>
                  )}
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>{collection.name}</Text>
                  <Text style={styles.cardCount}>{collection.movie_count}편</Text>
                  {collection.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{collection.description}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.lightGray} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="sparkles" size={48} color={COLORS.lightGray} />
            <Text style={styles.emptyText}>컬렉션이 없습니다</Text>
            <Text style={styles.emptySubtext}>영화를 기록하면 자동으로 컬렉션이 생성됩니다</Text>
          </View>
        )}

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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 14,
    gap: 14,
  },
  posterRow: {
    flexDirection: "row",
    width: 120,
    height: 70,
    gap: 3,
  },
  poster: {
    flex: 1,
    height: 70,
    borderRadius: 6,
    backgroundColor: COLORS.darkNavy,
  },
  emptyPoster: {
    flex: 1,
    height: 70,
    borderRadius: 6,
    backgroundColor: COLORS.darkNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 2,
  },
  cardCount: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: "600",
  },
  cardDesc: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.lightGray,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginTop: 6,
    opacity: 0.7,
  },
  bottomPadding: {
    height: 100,
  },
})
