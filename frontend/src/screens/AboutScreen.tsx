import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"

type AboutScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function AboutScreen() {
  const navigation = useNavigation<AboutScreenNavigationProp>()
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>앱 정보</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* App Logo Area */}
      <View style={styles.logoArea}>
        <View style={styles.logoContainer}>
          <Ionicons name="film" size={64} color={COLORS.gold} />
        </View>
        <Text style={styles.appName}>Filmory</Text>
        <Text style={styles.tagline}>나만의 영화 기록 앱</Text>
        <Text style={styles.version}>버전 1.0.0</Text>
      </View>

      {/* Info Cards */}
      <View style={styles.cardsContainer}>
        {/* 기능 소개 Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="star-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>기능 소개</Text>
          </View>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Ionicons name="search-outline" size={16} color={COLORS.gold} />
              <Text style={styles.bulletText}>영화 검색 및 기록</Text>
            </View>
            <View style={styles.bulletItem}>
              <Ionicons name="star-outline" size={16} color={COLORS.gold} />
              <Text style={styles.bulletText}>별점 및 리뷰 작성</Text>
            </View>
            <View style={styles.bulletItem}>
              <Ionicons name="folder-outline" size={16} color={COLORS.gold} />
              <Text style={styles.bulletText}>컬렉션 관리</Text>
            </View>
            <View style={styles.bulletItem}>
              <Ionicons name="bar-chart-outline" size={16} color={COLORS.gold} />
              <Text style={styles.bulletText}>관람 통계</Text>
            </View>
          </View>
        </View>

        {/* 연락처 Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="mail-outline" size={20} color={COLORS.gold} />
            <Text style={styles.cardTitle}>연락처</Text>
          </View>
          <View style={styles.contactList}>
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>이메일</Text>
              <Text style={styles.contactValue}>filmory@example.com</Text>
            </View>
            <View style={styles.contactDivider} />
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>버전</Text>
              <Text style={styles.contactValue}>1.0.0</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>Made with love for movie lovers</Text>
    </ScrollView>
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
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "center",
  },
  headerSpacer: {
    width: 32,
  },
  logoArea: {
    alignItems: "center",
    paddingVertical: 32,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: COLORS.deepGray,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: COLORS.lightGray,
    marginBottom: 8,
  },
  version: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
  },
  bulletList: {
    gap: 12,
  },
  bulletItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bulletText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  contactList: {
    gap: 0,
  },
  contactItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  contactDivider: {
    height: 1,
    backgroundColor: "rgba(160,160,160,0.15)",
  },
  contactLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  contactValue: {
    fontSize: 14,
    color: COLORS.white,
  },
  footer: {
    textAlign: "center",
    color: COLORS.lightGray,
    fontSize: 13,
    marginTop: 40,
  },
})
