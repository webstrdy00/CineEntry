import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"

type TermsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

const EFFECTIVE_DATE = "2026년 2월 21일"

interface SectionProps {
  number: string
  title: string
  children: React.ReactNode
}

function Section({ number, title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>제{number}조 ({title})</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.listBullet}>-</Text>
      <Text style={styles.listText}>{children}</Text>
    </View>
  )
}

export default function TermsScreen() {
  const navigation = useNavigation<TermsScreenNavigationProp>()
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
        <Text style={styles.headerTitle}>이용약관</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.effectiveDate}>시행일: {EFFECTIVE_DATE}</Text>

        <Section number="1" title="목적">
          <P>이 약관은 Filmory(이하 "앱")가 제공하는 영화 기록 및 관리 서비스(이하 "서비스")의 이용 조건과 절차, 이용자와 앱 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</P>
        </Section>

        <Section number="2" title="정의">
          <Li>"서비스"란 앱이 제공하는 영화 검색, 기록, 별점/리뷰 작성, 컬렉션 관리, 통계 등 일체의 기능을 의미합니다.</Li>
          <Li>"이용자"란 이 약관에 따라 서비스를 이용하는 자를 의미합니다.</Li>
          <Li>"회원"이란 앱에 가입하여 계정을 생성한 이용자를 의미합니다.</Li>
          <Li>"콘텐츠"란 이용자가 서비스 내에서 작성한 별점, 리뷰, 태그 등을 의미합니다.</Li>
        </Section>

        <Section number="3" title="약관의 효력 및 변경">
          <P>1. 이 약관은 서비스를 이용하고자 하는 모든 이용자에게 적용됩니다.</P>
          <P>2. 앱은 관련 법령에 위배되지 않는 범위에서 약관을 변경할 수 있으며, 변경된 약관은 앱 내 공지를 통해 효력이 발생합니다.</P>
          <P>3. 이용자가 변경된 약관에 동의하지 않는 경우, 서비스 이용을 중단하고 회원 탈퇴를 할 수 있습니다.</P>
        </Section>

        <Section number="4" title="서비스 이용">
          <P>1. 서비스는 무료로 제공됩니다.</P>
          <P>2. 서비스 이용을 위해 회원가입이 필요하며, 이메일 또는 소셜 계정(Google, Kakao)을 통해 가입할 수 있습니다.</P>
          <P>3. 서비스는 연중무휴 24시간 제공을 원칙으로 하나, 시스템 점검이나 기술적 문제로 일시 중단될 수 있습니다.</P>
        </Section>

        <Section number="5" title="회원가입 및 탈퇴">
          <P>1. 회원가입은 이용자가 약관에 동의하고 필요한 정보를 제공하여 가입 신청을 하면 완료됩니다.</P>
          <P>2. 회원은 언제든지 앱 내 설정에서 회원 탈퇴를 요청할 수 있습니다.</P>
          <P>3. 회원 탈퇴 시 해당 계정의 모든 데이터(영화 기록, 리뷰, 컬렉션 등)가 삭제되며, 삭제된 데이터는 복구할 수 없습니다.</P>
        </Section>

        <Section number="6" title="개인정보 보호">
          <P>앱은 이용자의 개인정보를 소중히 보호하며, 관련 법령 및 개인정보 처리방침에 따라 처리합니다. 자세한 내용은 개인정보 처리방침을 참고해 주세요.</P>
        </Section>

        <Section number="7" title="이용자의 의무">
          <P>이용자는 다음 행위를 해서는 안 됩니다:</P>
          <Li>타인의 개인정보를 도용하여 회원가입하는 행위</Li>
          <Li>서비스를 이용하여 법령 또는 공서양속에 반하는 행위</Li>
          <Li>다른 이용자의 정상적인 서비스 이용을 방해하는 행위</Li>
          <Li>서비스의 안정적 운영을 방해하는 행위</Li>
          <Li>앱의 사전 동의 없이 서비스를 상업적 목적으로 이용하는 행위</Li>
        </Section>

        <Section number="8" title="콘텐츠에 대한 권리">
          <P>1. 이용자가 작성한 콘텐츠(리뷰, 별점, 태그 등)의 저작권은 이용자에게 있습니다.</P>
          <P>2. 영화 정보 및 포스터 이미지는 KOBIS(영화진흥위원회)와 TMDb(The Movie Database)에서 제공하며, 해당 서비스의 이용 약관에 따릅니다.</P>
        </Section>

        <Section number="9" title="면책사항">
          <P>1. 앱은 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력으로 인하여 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</P>
          <P>2. 앱은 이용자의 귀책사유로 인한 서비스 이용 장애에 대하여 책임을 지지 않습니다.</P>
          <P>3. 앱은 외부 API(KOBIS, TMDb)에서 제공하는 영화 정보의 정확성에 대해 보증하지 않습니다.</P>
        </Section>

        <Section number="10" title="분쟁 해결">
          <P>1. 서비스 이용과 관련하여 분쟁이 발생한 경우, 앱과 이용자는 원만한 해결을 위해 성실히 협의합니다.</P>
          <P>2. 협의가 이루어지지 않을 경우, 대한민국 법령에 따라 관할 법원에서 해결합니다.</P>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>본 약관은 {EFFECTIVE_DATE}부터 시행됩니다.</Text>
        </View>
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
  content: {
    paddingHorizontal: 20,
  },
  effectiveDate: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.gold,
    marginBottom: 10,
  },
  sectionBody: {
    gap: 6,
  },
  paragraph: {
    fontSize: 13,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  listItem: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 4,
  },
  listBullet: {
    fontSize: 13,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  listText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  footer: {
    marginTop: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(160,160,160,0.1)",
  },
  footerText: {
    fontSize: 12,
    color: COLORS.lightGray,
    opacity: 0.6,
    textAlign: "center",
  },
})
