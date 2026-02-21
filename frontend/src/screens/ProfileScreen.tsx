import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, RefreshControl } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { useAuth } from "../contexts/AuthContext"
import { getCurrentUser } from "../services/userService"
import { getOverallStats } from "../services/statsService"
import { getCollections } from "../services/collectionService"

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>
type IoniconName = keyof typeof Ionicons.glyphMap

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const { signOut, user: authUser } = useAuth()

  // State
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [collections, setCollections] = useState<any[]>([])

  // Load data on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [])
  )

  const loadData = async () => {
    try {
      setLoading(true)
      setError(false)
      const [userData, statsData, collectionsData] = await Promise.all([
        getCurrentUser().catch(() => null),
        getOverallStats().catch(() => null),
        getCollections().catch(() => []),
      ])

      setUser(userData)
      setStats(statsData)
      setCollections(collectionsData)
    } catch (error) {
      console.error('❌ ProfileScreen 데이터 로드 실패:', error)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [])

  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃 하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            await signOut()
          },
        },
      ]
    )
  }

  // 로딩 중
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={{ color: COLORS.lightGray, marginTop: 12 }}>데이터를 불러오는 중...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.lightGray} />
        <Text style={{ color: COLORS.lightGray, marginTop: 16, fontSize: 16 }}>데이터를 불러올 수 없습니다</Text>
        <TouchableOpacity
          onPress={loadData}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: COLORS.deepGray, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, gap: 6 }}
        >
          <Ionicons name="refresh" size={18} color={COLORS.gold} />
          <Text style={{ color: COLORS.gold, fontWeight: '600' }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const menuItems: Array<{ icon: IoniconName; label: string; action: string }> = [
    { icon: "person-outline", label: "프로필 수정", action: "editProfile" },
    { icon: "notifications-outline", label: "알림 설정", action: "notifications" },
    { icon: "color-palette-outline", label: "테마 설정", action: "theme" },
    { icon: "cloud-upload-outline", label: "백업 및 복원", action: "backup" },
    { icon: "help-circle-outline", label: "도움말", action: "help" },
    { icon: "information-circle-outline", label: "앱 정보", action: "about" },
  ]

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>프로필</Text>
      </View>

      {/* Profile Card */}
      <View style={styles.profileCard}>
        <Image
          source={{ uri: user?.avatar_url || authUser?.avatar_url || "https://i.pravatar.cc/150?img=12" }}
          style={styles.avatar}
        />
        <Text style={styles.userName}>{user?.display_name || authUser?.display_name || "영화 애호가"}</Text>
        <Text style={styles.userEmail}>{user?.email || authUser?.email || "movie@lover.com"}</Text>
        <View style={styles.cardDivider} />
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.total_watched || 0}</Text>
            <Text style={styles.statLabel}>관람</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{collections.length || 0}</Text>
            <Text style={styles.statLabel}>컬렉션</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.current_streak || 0}</Text>
            <Text style={styles.statLabel}>연속 기록</Text>
          </View>
        </View>
      </View>

      {/* Divider: Profile Card ~ Collections */}
      <View style={styles.sectionDivider} />

      {/* Collections Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="folder-outline" size={20} color={COLORS.gold} />
            <Text style={styles.sectionTitle}>내 컬렉션</Text>
          </View>
        </View>

        {/* Collection List */}
        <View style={styles.collectionList}>
          {collections.length > 0 ? (
            <>
              {collections.map((collection) => (
                <TouchableOpacity
                  key={collection.id}
                  style={styles.collectionItem}
                  onPress={() => navigation.navigate("CollectionDetail", { id: collection.id })}
                >
                  <View style={styles.collectionLeft}>
                    <Ionicons
                      name={collection.is_auto ? "sparkles" : "folder"}
                      size={20}
                      color={collection.is_auto ? COLORS.gold : COLORS.white}
                    />
                    <View style={styles.collectionInfo}>
                      <Text style={styles.collectionName}>{collection.name}</Text>
                      <Text style={styles.collectionCount}>{collection.movie_count}편</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.lightGray} />
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <View style={styles.emptyCollections}>
              <Ionicons name="folder-outline" size={40} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>아직 컬렉션이 없습니다</Text>
            </View>
          )}
        </View>

        {/* Add New Collection Button - separated from list */}
        <TouchableOpacity style={styles.addCollectionButton} onPress={() => Alert.alert("준비 중", "컬렉션 생성 기능이 곧 추가될 예정입니다.")}>
          <Ionicons name="add-circle-outline" size={20} color={COLORS.gold} />
          <Text style={styles.addCollectionText}>새 컬렉션 만들기</Text>
        </TouchableOpacity>
      </View>

      {/* Divider: Collections ~ Menu */}
      <View style={styles.sectionDivider} />

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="settings-outline" size={20} color={COLORS.gold} />
            <Text style={styles.sectionTitle}>설정</Text>
          </View>
        </View>
        {menuItems.map((item, index) => (
          <TouchableOpacity key={index} style={[styles.menuItem, { opacity: 0.5 }]} onPress={() => Alert.alert("준비 중", "이 기능은 곧 추가될 예정입니다.")}>
            <View style={styles.menuItemLeft}>
              <Ionicons name={item.icon} size={24} color={COLORS.gold} />
              <Text style={styles.menuItemText}>{item.label} (준비 중)</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.lightGray} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
  },
  profileCard: {
    backgroundColor: COLORS.deepGray,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: COLORS.gold,
  },
  userName: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  cardDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(160,160,160,0.15)",
    marginTop: 20,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingTop: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.gold,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.darkNavy,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(160,160,160,0.1)",
    marginHorizontal: 20,
    marginBottom: 24,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  collectionList: {
    gap: 8,
  },
  collectionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    padding: 16,
    borderRadius: 12,
  },
  collectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  collectionInfo: {
    flex: 1,
  },
  collectionName: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.white,
    marginBottom: 2,
  },
  collectionCount: {
    fontSize: 13,
    color: COLORS.lightGray,
  },
  addCollectionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212, 175, 55, 0.1)",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderStyle: "dashed",
    gap: 8,
    marginTop: 12,
  },
  addCollectionText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.gold,
  },
  menuSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuItemText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "500",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.red,
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    color: COLORS.red,
    fontWeight: "600",
  },
  bottomPadding: {
    height: 100,
  },
  emptyCollections: {
    alignItems: "center",
    padding: 40,
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.lightGray,
    marginTop: 12,
  },
})
