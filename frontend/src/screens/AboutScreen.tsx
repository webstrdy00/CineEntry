import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import BrandMark from "../components/BrandMark"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"

type AboutScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>
type IoniconName = keyof typeof Ionicons.glyphMap

const APP_VERSION = "1.0.0"
const BUILD_NUMBER = "1"

interface InfoRowProps {
  label: string
  value: string
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

interface FeatureItemProps {
  icon: IoniconName
  title: string
  description: string
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIconContainer}>
        <Ionicons name={icon} size={20} color={COLORS.gold} />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  )
}

export default function AboutScreen() {
  const navigation = useNavigation<AboutScreenNavigationProp>()
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>앱 정보</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* App Identity */}
      <View style={styles.identityArea}>
        <BrandMark width={232} subtitle="나만의 영화 기록 앱" />
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{APP_VERSION}</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 주요 기능 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>주요 기능</Text>
        <View style={styles.featuresGrid}>
          <FeatureItem
            icon="search-outline"
            title="영화 검색"
            description="KOBIS, TMDb 기반 국내외 영화 검색 및 상세 정보 조회"
          />
          <FeatureItem
            icon="create-outline"
            title="감상 기록"
            description="별점, 한줄평, 관람일, 시청 진행도를 기록하고 관리"
          />
          <FeatureItem
            icon="folder-outline"
            title="스마트 컬렉션"
            description="장르별, 평점별, 인생 영화 등 자동 분류 컬렉션"
          />
          <FeatureItem
            icon="stats-chart-outline"
            title="관람 통계"
            description="월별 관람 추이, 장르 분포, 평균 평점 등 다양한 통계"
          />
          <FeatureItem
            icon="heart-outline"
            title="인생 영화"
            description="특별한 영화를 인생 영화로 지정하여 따로 모아보기"
          />
          <FeatureItem
            icon="pricetag-outline"
            title="태그 관리"
            description="나만의 태그로 영화를 분류하고 빠르게 검색"
          />
        </View>
      </View>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 앱 정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>앱 정보</Text>
        <View style={styles.infoCard}>
          <InfoRow label="앱 이름" value="CineEntry" />
          <View style={styles.infoDivider} />
          <InfoRow label="버전" value={`${APP_VERSION} (${BUILD_NUMBER})`} />
        </View>
      </View>

      {/* Divider */}
      <View style={styles.sectionDivider} />

      {/* 데이터 출처 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>데이터 출처</Text>
        <View style={styles.infoCard}>
          <View style={styles.dataSourceItem}>
            <View style={styles.dataSourceBadge}>
              <Text style={styles.dataSourceBadgeText}>KOBIS</Text>
            </View>
            <View style={styles.dataSourceContent}>
              <Text style={styles.dataSourceName}>영화진흥위원회</Text>
              <Text style={styles.dataSourceDesc}>국내 영화 정보 및 박스오피스</Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.dataSourceItem}>
            <View style={styles.dataSourceBadge}>
              <Text style={styles.dataSourceBadgeText}>TMDb</Text>
            </View>
            <View style={styles.dataSourceContent}>
              <Text style={styles.dataSourceName}>The Movie Database</Text>
              <Text style={styles.dataSourceDesc}>해외 영화 정보 및 포스터 이미지</Text>
            </View>
          </View>
        </View>
        <Text style={styles.dataSourceNotice}>
          본 앱은 KOBIS와 TMDb의 API를 활용하며, 해당 서비스의 데이터 정책을 준수합니다.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footerArea}>
        <Ionicons name="film-outline" size={20} color={COLORS.lightGray} style={{ opacity: 0.4 }} />
        <Text style={styles.footerText}>
          {`\u00A9 ${new Date().getFullYear()} CineEntry. All rights reserved.`}
        </Text>
        <Text style={styles.footerSubtext}>Made with love for movie lovers</Text>
      </View>
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
    paddingBottom: 16,
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

  // Identity
  identityArea: {
    alignItems: "center",
    paddingVertical: 28,
  },
  versionBadge: {
    backgroundColor: "rgba(212,175,55,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
  },
  versionText: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: "600",
  },

  // Sections
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(160,160,160,0.08)",
    marginHorizontal: 20,
    marginVertical: 4,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 16,
  },

  // Info card
  infoCard: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: "500",
  },
  infoDivider: {
    height: 1,
    backgroundColor: "rgba(160,160,160,0.1)",
  },

  // Features
  featuresGrid: {
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(212,175,55,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 13,
    color: COLORS.lightGray,
    lineHeight: 18,
  },

  // Data sources
  dataSourceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  dataSourceBadge: {
    backgroundColor: "rgba(212,175,55,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 52,
    alignItems: "center",
  },
  dataSourceBadgeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.gold,
    letterSpacing: 0.5,
  },
  dataSourceContent: {
    flex: 1,
  },
  dataSourceName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
    marginBottom: 2,
  },
  dataSourceDesc: {
    fontSize: 12,
    color: COLORS.lightGray,
  },
  dataSourceNotice: {
    fontSize: 12,
    color: COLORS.lightGray,
    lineHeight: 18,
    marginTop: 12,
    opacity: 0.7,
  },

  // Footer
  footerArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 20,
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.lightGray,
    opacity: 0.5,
  },
  footerSubtext: {
    fontSize: 12,
    color: COLORS.lightGray,
    opacity: 0.35,
  },
})
