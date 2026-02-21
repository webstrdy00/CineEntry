import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"

type PrivacyScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

const EFFECTIVE_DATE = "2026년 2월 21일"

interface SectionProps {
  number: string
  title: string
  children: React.ReactNode
}

function Section({ number, title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{number}. {title}</Text>
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

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue}>{value}</Text>
    </View>
  )
}

export default function PrivacyScreen() {
  const navigation = useNavigation<PrivacyScreenNavigationProp>()
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
        <Text style={styles.headerTitle}>개인정보 처리방침</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.effectiveDate}>시행일: {EFFECTIVE_DATE}</Text>

        <P>Filmory(이하 "앱")는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을 원활하게 처리할 수 있도록 다음과 같은 처리방침을 수립하여 공개합니다.</P>

        <Section number="1" title="수집하는 개인정보 항목 및 수집 방법">
          <P>앱은 서비스 제공을 위해 다음의 개인정보를 수집합니다.</P>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderLabel}>구분</Text>
              <Text style={styles.tableHeaderValue}>항목</Text>
            </View>
            <TableRow label="필수 항목" value="이메일 주소" />
            <TableRow label="선택 항목" value="닉네임, 프로필 사진" />
            <TableRow label="자동 수집" value="기기 정보, 앱 사용 기록" />
            <TableRow label="소셜 로그인" value="Google/Kakao 계정 이메일, 프로필 정보" />
          </View>
          <P>수집 방법: 회원가입, 서비스 이용 과정에서 이용자가 직접 입력하거나 소셜 로그인 시 자동으로 수집됩니다.</P>
        </Section>

        <Section number="2" title="개인정보의 수집 및 이용 목적">
          <Li>회원 식별 및 가입 의사 확인</Li>
          <Li>서비스 제공 및 개선 (영화 기록, 통계, 컬렉션 등)</Li>
          <Li>이용자 문의 응대 및 공지사항 전달</Li>
          <Li>서비스 이용 통계 및 분석</Li>
          <Li>부정 이용 방지</Li>
        </Section>

        <Section number="3" title="개인정보의 보유 및 이용 기간">
          <P>앱은 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.</P>
          <Li>회원 정보: 회원 탈퇴 시 즉시 파기</Li>
          <Li>영화 기록 데이터: 회원 탈퇴 시 즉시 파기</Li>
          <Li>프로필 이미지: 회원 탈퇴 시 즉시 파기</Li>
          <P>단, 관련 법령에 의해 보존이 필요한 경우 해당 기간 동안 보관합니다.</P>
          <Li>전자상거래법에 의한 표시/광고 기록: 6개월</Li>
          <Li>통신비밀보호법에 의한 로그인 기록: 3개월</Li>
        </Section>

        <Section number="4" title="개인정보의 제3자 제공">
          <P>앱은 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우에는 예외로 합니다.</P>
          <Li>이용자가 사전에 동의한 경우</Li>
          <Li>법령에 의해 요구되는 경우</Li>
          <P>앱은 영화 정보 제공을 위해 다음 외부 API를 이용하며, 이 과정에서 이용자의 개인정보는 전송되지 않습니다.</P>
          <Li>KOBIS (영화진흥위원회 오픈 API)</Li>
          <Li>TMDb (The Movie Database API)</Li>
        </Section>

        <Section number="5" title="개인정보 처리 위탁">
          <P>앱은 서비스 운영을 위해 다음과 같이 개인정보 처리를 위탁하고 있습니다.</P>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderLabel}>수탁업체</Text>
              <Text style={styles.tableHeaderValue}>위탁 업무</Text>
            </View>
            <TableRow label="AWS" value="데이터 저장 및 서버 운영" />
          </View>
        </Section>

        <Section number="6" title="이용자의 권리와 행사 방법">
          <P>이용자는 다음의 권리를 행사할 수 있습니다.</P>
          <Li>개인정보 열람 요구</Li>
          <Li>개인정보 수정 요구</Li>
          <Li>개인정보 삭제 요구</Li>
          <Li>개인정보 처리 정지 요구</Li>
          <P>위 권리는 앱 내 프로필 수정 기능 또는 이메일(filmory.app@gmail.com)을 통해 행사할 수 있으며, 앱은 이에 대해 지체 없이 조치하겠습니다.</P>
        </Section>

        <Section number="7" title="개인정보의 파기 절차 및 방법">
          <P>앱은 개인정보 보유 기간이 경과하거나 처리 목적이 달성된 경우, 해당 개인정보를 지체 없이 파기합니다.</P>
          <Li>전자적 파일: 복구 불가능한 방법으로 영구 삭제</Li>
          <Li>이미지 파일: 저장소(S3)에서 완전 삭제</Li>
        </Section>

        <Section number="8" title="개인정보의 안전성 확보 조치">
          <P>앱은 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</P>
          <Li>비밀번호 암호화 저장</Li>
          <Li>SSL/TLS를 통한 데이터 전송 암호화</Li>
          <Li>접근 권한 관리 및 제한</Li>
          <Li>정기적인 보안 점검</Li>
        </Section>

        <Section number="9" title="개인정보 보호책임자">
          <View style={styles.table}>
            <TableRow label="담당" value="Filmory 개발팀" />
            <TableRow label="이메일" value="filmory.app@gmail.com" />
          </View>
          <P>이용자는 서비스 이용 중 발생하는 모든 개인정보 관련 문의, 불만, 피해구제 등을 위 연락처로 문의할 수 있습니다.</P>
        </Section>

        <Section number="10" title="고지 의무">
          <P>이 개인정보 처리방침은 법령, 정책 또는 서비스 변경에 따라 변경될 수 있으며, 변경 시 앱 내 공지를 통해 안내합니다.</P>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>본 개인정보 처리방침은 {EFFECTIVE_DATE}부터 시행됩니다.</Text>
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
    marginBottom: 20,
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
  table: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 10,
    overflow: "hidden",
    marginVertical: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(212,175,55,0.1)",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tableHeaderLabel: {
    width: 100,
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.gold,
  },
  tableHeaderValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.gold,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(160,160,160,0.08)",
  },
  tableLabel: {
    width: 100,
    fontSize: 13,
    color: COLORS.white,
    fontWeight: "500",
  },
  tableValue: {
    flex: 1,
    fontSize: 13,
    color: COLORS.lightGray,
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
