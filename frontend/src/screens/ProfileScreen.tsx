import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from "react-native"
import { useAlert } from "../components/CustomAlert"
import UserAvatar from "../components/UserAvatar"
import { Ionicons } from "@expo/vector-icons"
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs"
import Constants from "expo-constants"
import { useNavigation, useFocusEffect } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback } from "react"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { useAuth } from "../contexts/AuthContext"
import { getCurrentUser } from "../services/userService"
import { getOverallStats } from "../services/statsService"
import { resendVerificationEmail } from "../services/authService"

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>
type IoniconName = keyof typeof Ionicons.glyphMap

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const { signOut } = useAuth()
  const { showAlert } = useAlert()

  // State
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
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
      const [userData, statsData] = await Promise.all([
        getCurrentUser(),
        getOverallStats().catch(() => null),
      ])

      if (!userData) {
        throw new Error("사용자 정보를 불러오지 못했습니다.")
      }

      setUser(userData)
      setStats(statsData)
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

  const formatAuthMethod = (method: string) => {
    if (method === "google") return "Google"
    if (method === "kakao") return "Kakao"
    return "이메일"
  }

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail()
      await loadData()
      showAlert("인증 메일 발송", "인증 메일을 다시 보냈습니다. 메일함과 스팸함을 확인해주세요.")
    } catch (error: any) {
      const message =
        error.response?.data?.detail ||
        error.message ||
        "인증 메일 재발송에 실패했습니다."
      showAlert("오류", message)
    }
  }

  const handleLogout = () => {
    showAlert(
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

  const implementedActions: Record<string, () => void> = {
    editProfile: () => navigation.navigate("EditProfile"),
    about: () => navigation.navigate("About"),
    help: () => navigation.navigate("Help"),
    contact: () => {
      Linking.openURL("mailto:cineentry.app@gmail.com?subject=[CineEntry] 문의/버그 신고").catch(() =>
        showAlert("알림", "메일 앱을 열 수 없습니다.\ncineentry.app@gmail.com으로 문의해 주세요.")
      )
    },
    terms: () => navigation.navigate("Terms"),
    privacy: () => navigation.navigate("Privacy"),
  }

  const settingsMenu: Array<{ icon: IoniconName; label: string; action: string }> = [
    { icon: "person-outline", label: "프로필 수정", action: "editProfile" },
    { icon: "color-palette-outline", label: "테마 설정", action: "theme" },
    { icon: "cloud-upload-outline", label: "백업 및 복원", action: "backup" },
    { icon: "information-circle-outline", label: "앱 정보", action: "about" },
  ]

  const supportMenu: Array<{ icon: IoniconName; label: string; action: string; subtitle?: string }> = [
    { icon: "help-circle-outline", label: "도움말", action: "help" },
    { icon: "mail-outline", label: "사용 문의 및 버그 신고", action: "contact", subtitle: "cineentry.app@gmail.com" },
  ]

  const etcMenu: Array<{ icon: IoniconName; label: string; action: string }> = [
    { icon: "document-text-outline", label: "이용약관", action: "terms" },
    { icon: "shield-checkmark-outline", label: "개인정보 처리방침", action: "privacy" },
  ]

  const renderMenuGroup = (items: Array<{ icon: IoniconName; label: string; action: string; subtitle?: string }>) => (
    <>
      {items.map((item, index) => {
        const isImplemented = !!implementedActions[item.action]
        return (
          <TouchableOpacity
            key={index}
            style={[styles.menuItem, !isImplemented && { opacity: 0.5 }]}
            onPress={() => {
              if (isImplemented) {
                implementedActions[item.action]()
              } else {
                showAlert("준비 중", "이 기능은 곧 추가될 예정입니다.")
              }
            }}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name={item.icon} size={24} color={COLORS.gold} />
              <View>
                <Text style={styles.menuItemText}>{item.label}{!isImplemented ? " (준비 중)" : ""}</Text>
                {item.subtitle && <Text style={styles.menuItemSubtext}>{item.subtitle}</Text>}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.lightGray} />
          </TouchableOpacity>
        )
      })}
    </>
  )

  const appVersion = Constants.expoConfig?.version || "알 수 없음"

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
        <UserAvatar uri={user?.avatar_url} style={styles.avatar} />
        <Text style={styles.userName}>{user?.display_name || "영화 애호가"}</Text>
        <Text style={styles.userEmail}>{user?.email || "-"}</Text>
        <View style={styles.authBadgeRow}>
          {(user?.auth_methods || [user?.auth_provider || "email"]).map((method: string) => (
            <View key={method} style={styles.authBadge}>
              <Text style={styles.authBadgeText}>{formatAuthMethod(method)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.cardDivider} />
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.total_watched || 0}</Text>
            <Text style={styles.statLabel}>관람</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.current_streak || 0}</Text>
            <Text style={styles.statLabel}>연속 기록</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{(stats?.average_rating || 0).toFixed(1)}</Text>
            <Text style={styles.statLabel}>평균 별점</Text>
          </View>
        </View>
      </View>

      {!user?.email_verified ? (
        <View style={styles.noticeCard}>
          <View style={styles.noticeHeader}>
            <Ionicons name="mail-unread-outline" size={20} color="#f59e0b" />
            <Text style={styles.noticeTitle}>이메일 인증이 아직 완료되지 않았어요</Text>
          </View>
          <Text style={styles.noticeText}>
            지금 기기에서는 계속 사용할 수 있지만, 다음 이메일 로그인과 비밀번호 변경은 인증 후 가능합니다.
          </Text>
          <TouchableOpacity style={styles.noticeButton} onPress={() => void handleResendVerification()}>
            <Text style={styles.noticeButtonText}>인증 메일 다시 보내기</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 설정 */}
      <View style={styles.menuSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="settings-outline" size={20} color={COLORS.gold} />
            <Text style={styles.sectionTitle}>설정</Text>
          </View>
        </View>
        {renderMenuGroup(settingsMenu)}
      </View>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 문의 및 지원 */}
      <View style={styles.menuSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="chatbubbles-outline" size={20} color={COLORS.gold} />
            <Text style={styles.sectionTitle}>문의 및 지원</Text>
          </View>
        </View>
        {renderMenuGroup(supportMenu)}
      </View>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 기타 설정 */}
      <View style={styles.menuSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="ellipsis-horizontal-circle-outline" size={20} color={COLORS.gold} />
            <Text style={styles.sectionTitle}>기타 설정</Text>
          </View>
        </View>
        {renderMenuGroup(etcMenu)}
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>로그아웃</Text>
      </TouchableOpacity>

      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>{`앱 버전 v${appVersion}`}</Text>
      </View>

      <View style={[styles.bottomPadding, { height: tabBarHeight + 40 }]} />
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
  authBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  authBadge: {
    backgroundColor: COLORS.darkNavy,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  authBadgeText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  cardDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "rgba(160,160,160,0.15)",
    marginTop: 20,
  },
  noticeCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 18,
    borderRadius: 14,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.24)",
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  noticeTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
  noticeText: {
    color: COLORS.lightGray,
    fontSize: 13,
    lineHeight: 20,
  },
  noticeButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeButtonText: {
    color: COLORS.darkNavy,
    fontSize: 13,
    fontWeight: "800",
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
  menuItemSubtext: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 2,
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
  versionContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  versionText: {
    fontSize: 12,
    color: COLORS.lightGray,
    opacity: 0.8,
  },
  bottomPadding: {
    height: 100,
  },
})
