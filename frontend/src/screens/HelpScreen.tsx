import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, LayoutAnimation, Platform, UIManager, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useCallback, useMemo } from "react"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type HelpScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>

interface FaqItem {
  question: string
  answer: string
}

interface FaqSection {
  title: string
  icon: keyof typeof Ionicons.glyphMap
  items: FaqItem[]
}

const FAQ_DATA: FaqSection[] = [
  {
    title: "영화 검색 및 기록",
    icon: "search-outline",
    items: [
      {
        question: "영화를 어떻게 검색하나요?",
        answer: "홈 화면 상단의 검색 아이콘을 탭하면 영화 검색 화면으로 이동합니다. 영화 제목을 입력하면 KOBIS(한국영화)와 TMDb(해외영화) 데이터베이스에서 검색 결과를 보여줍니다.",
      },
      {
        question: "영화를 기록하려면 어떻게 하나요?",
        answer: "검색 결과에서 영화를 선택한 후, '보고 싶어요', '보는 중', '다 봤어요' 중 원하는 상태를 선택하면 내 영화 목록에 추가됩니다.",
      },
      {
        question: "기록한 영화를 삭제할 수 있나요?",
        answer: "영화 상세 화면에서 우측 상단의 메뉴(···) 버튼을 탭하면 삭제 옵션이 나타납니다.",
      },
    ],
  },
  {
    title: "별점 및 리뷰",
    icon: "star-outline",
    items: [
      {
        question: "별점은 어떻게 매기나요?",
        answer: "영화 상세 화면에서 별 아이콘을 탭하여 1~5점까지 별점을 매길 수 있습니다. 같은 별을 한 번 더 탭하면 별점이 취소됩니다.",
      },
      {
        question: "한줄평은 어떻게 작성하나요?",
        answer: "영화 상세 화면의 한줄평 영역을 탭하면 리뷰를 작성할 수 있습니다. 짧은 감상을 기록해 보세요.",
      },
    ],
  },
  {
    title: "컬렉션",
    icon: "folder-outline",
    items: [
      {
        question: "컬렉션은 어떻게 만들어지나요?",
        answer: "컬렉션은 영화를 기록하면 자동으로 생성됩니다. 장르별, 평점별, 연도별 등 다양한 기준으로 영화가 자동 분류됩니다.",
      },
      {
        question: "컬렉션은 어디서 볼 수 있나요?",
        answer: "프로필 탭에서 컬렉션 목록을 확인할 수 있습니다. 각 컬렉션을 탭하면 해당 컬렉션에 포함된 영화 목록을 볼 수 있습니다.",
      },
    ],
  },
  {
    title: "인생 영화",
    icon: "heart-outline",
    items: [
      {
        question: "인생 영화는 어떻게 설정하나요?",
        answer: "영화 상세 화면 상단의 하트(♥) 아이콘을 탭하면 해당 영화가 인생 영화로 지정됩니다. 다시 탭하면 해제됩니다.",
      },
      {
        question: "인생 영화 목록은 어디서 보나요?",
        answer: "프로필 탭의 컬렉션 중 '인생 영화' 컬렉션에서 모아볼 수 있습니다.",
      },
    ],
  },
  {
    title: "태그",
    icon: "pricetag-outline",
    items: [
      {
        question: "태그는 어떻게 추가하나요?",
        answer: "영화 상세 화면에서 태그 영역을 탭하면 기존 태그를 선택하거나 새로운 태그를 만들 수 있습니다. 태그는 '#명작' 형태로 표시됩니다.",
      },
      {
        question: "태그로 영화를 검색할 수 있나요?",
        answer: "태그를 탭하면 같은 태그가 붙은 영화 목록을 볼 수 있습니다.",
      },
    ],
  },
  {
    title: "계정 및 프로필",
    icon: "person-outline",
    items: [
      {
        question: "프로필 사진을 변경하려면?",
        answer: "프로필 탭에서 '프로필 수정'을 탭한 후, 프로필 이미지를 탭하면 갤러리에서 사진을 선택할 수 있습니다.",
      },
      {
        question: "닉네임을 변경할 수 있나요?",
        answer: "프로필 수정 화면에서 닉네임을 수정하고 저장 버튼을 누르면 변경됩니다.",
      },
      {
        question: "회원탈퇴는 어떻게 하나요?",
        answer: "프로필 수정 화면 하단의 '회원탈퇴' 버튼을 탭하면 계정 삭제를 진행할 수 있습니다. 삭제된 데이터는 복구할 수 없으니 신중하게 결정해 주세요.",
      },
    ],
  },
]

const POPULAR_ITEMS: { sectionIndex: number; itemIndex: number }[] = [
  { sectionIndex: 0, itemIndex: 0 },
  { sectionIndex: 1, itemIndex: 0 },
  { sectionIndex: 3, itemIndex: 0 },
]

const CONTACT_EMAIL = "cineentry.app@gmail.com"

function AccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={styles.faqItem} onPress={onToggle} activeOpacity={0.7}>
      <View style={styles.faqQuestionRow}>
        <Text style={styles.faqQuestion}>{item.question}</Text>
        <Ionicons
          name={isOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.lightGray}
        />
      </View>
      {isOpen && (
        <Text style={styles.faqAnswer}>{item.answer}</Text>
      )}
    </TouchableOpacity>
  )
}

export default function HelpScreen() {
  const navigation = useNavigation<HelpScreenNavigationProp>()
  const insets = useSafeAreaInsets()
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const toggleItem = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.trim().toLowerCase()
    const results: { item: FaqItem; key: string }[] = []
    FAQ_DATA.forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        if (
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query)
        ) {
          results.push({ item, key: `search-${sectionIndex}-${itemIndex}` })
        }
      })
    })
    return results
  }, [searchQuery])

  const handleCategorySelect = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setSelectedCategory(index)
  }, [])

  const handleCategoryBack = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setSelectedCategory(null)
  }, [])

  const handleContact = useCallback(() => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`)
  }, [])

  const isSearching = searchQuery.trim().length > 0

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>도움말</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={COLORS.lightGray} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="궁금한 점을 검색해 보세요"
          placeholderTextColor={COLORS.lightGray}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.searchClear}>
            <Ionicons name="close-circle" size={18} color={COLORS.lightGray} />
          </TouchableOpacity>
        )}
      </View>

      {isSearching ? (
        /* Search Results */
        searchResults && searchResults.length > 0 ? (
          <View style={styles.resultSection}>
            <Text style={styles.sectionLabel}>검색 결과 ({searchResults.length})</Text>
            <View style={styles.accordionCard}>
              {searchResults.map(({ item, key }, index) => (
                <View key={key}>
                  {index > 0 && <View style={styles.faqDivider} />}
                  <AccordionItem
                    item={item}
                    isOpen={openItems.has(key)}
                    onToggle={() => toggleItem(key)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={COLORS.mediumGray} />
            <Text style={styles.emptyStateText}>검색 결과가 없습니다</Text>
          </View>
        )
      ) : selectedCategory !== null ? (
        /* Category Detail */
        <View style={styles.resultSection}>
          <TouchableOpacity style={styles.categoryHeader} onPress={handleCategoryBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={18} color={COLORS.gold} />
            <Text style={styles.categoryHeaderTitle}>{FAQ_DATA[selectedCategory].title}</Text>
          </TouchableOpacity>
          <View style={styles.accordionCard}>
            {FAQ_DATA[selectedCategory].items.map((item, itemIndex) => {
              const key = `cat-${selectedCategory}-${itemIndex}`
              return (
                <View key={key}>
                  {itemIndex > 0 && <View style={styles.faqDivider} />}
                  <AccordionItem
                    item={item}
                    isOpen={openItems.has(key)}
                    onToggle={() => toggleItem(key)}
                  />
                </View>
              )
            })}
          </View>
        </View>
      ) : (
        /* Default: Popular + Categories + Contact */
        <>
          {/* Popular Questions */}
          <View style={styles.resultSection}>
            <Text style={styles.sectionLabel}>자주 묻는 질문</Text>
            <View style={styles.accordionCard}>
              {POPULAR_ITEMS.map(({ sectionIndex, itemIndex }, index) => {
                const item = FAQ_DATA[sectionIndex].items[itemIndex]
                const key = `popular-${sectionIndex}-${itemIndex}`
                return (
                  <View key={key}>
                    {index > 0 && <View style={styles.faqDivider} />}
                    <AccordionItem
                      item={item}
                      isOpen={openItems.has(key)}
                      onToggle={() => toggleItem(key)}
                    />
                  </View>
                )
              })}
            </View>
          </View>

          {/* Category Grid */}
          <View style={styles.resultSection}>
            <Text style={styles.sectionLabel}>카테고리</Text>
            <View style={styles.categoryGrid}>
              {FAQ_DATA.map((section, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.categoryCard}
                  onPress={() => handleCategorySelect(index)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={section.icon} size={24} color={COLORS.gold} style={styles.categoryCardIcon} />
                  <Text style={styles.categoryCardTitle}>{section.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Contact Card */}
          <View style={styles.resultSection}>
            <TouchableOpacity style={styles.contactCard} onPress={handleContact} activeOpacity={0.7}>
              <Ionicons name="mail-outline" size={24} color={COLORS.gold} />
              <View style={styles.contactTextArea}>
                <Text style={styles.contactTitle}>문의하기</Text>
                <Text style={styles.contactSubtitle}>해결되지 않은 문제가 있나요?</Text>
                <Text style={styles.contactEmail}>{CONTACT_EMAIL}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.lightGray} />
            </TouchableOpacity>
          </View>
        </>
      )}
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

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 24,
    paddingHorizontal: 14,
    height: 46,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    padding: 0,
  },
  searchClear: {
    padding: 4,
    marginLeft: 8,
  },

  // Sections
  resultSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },

  // Accordion card (shared)
  accordionCard: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    overflow: "hidden",
  },

  // FAQ Item
  faqItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  faqQuestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
    lineHeight: 20,
  },
  faqAnswer: {
    fontSize: 13,
    color: COLORS.lightGray,
    lineHeight: 20,
    marginTop: 10,
    paddingRight: 30,
  },
  faqDivider: {
    height: 1,
    backgroundColor: "rgba(160,160,160,0.1)",
    marginHorizontal: 16,
  },

  // Category Grid
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryCard: {
    width: "31%",
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCardIcon: {
    marginBottom: 8,
  },
  categoryCardTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.white,
    textAlign: "center",
  },

  // Category Header
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  categoryHeaderTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.gold,
  },

  // Contact
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  contactTextArea: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 2,
  },
  contactSubtitle: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginBottom: 4,
  },
  contactEmail: {
    fontSize: 13,
    color: COLORS.gold,
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
})
