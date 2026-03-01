import { useState, useRef, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  Animated,
  Pressable,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import ViewShot from "react-native-view-shot"
import * as MediaLibrary from "expo-media-library"
import * as Sharing from "expo-sharing"
import * as FileSystem from "expo-file-system"
import { COLORS } from "../constants/colors"
import type { CalendarData, CalendarDay } from "../types"

type PosterMode = "single" | "split"
type WeekStart = "monday" | "sunday"

interface BackgroundOption {
  id: string
  label: string
  colors: string[]
  textColor: string
}

const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "dark", label: "다크", colors: ["#1a1d29"], textColor: "#ffffff" },
  { id: "navy", label: "네이비", colors: ["#0f1628"], textColor: "#ffffff" },
  { id: "charcoal", label: "차콜", colors: ["#2c2c2c"], textColor: "#ffffff" },
  { id: "midnight", label: "미드나잇", colors: ["#191970"], textColor: "#ffffff" },
  { id: "wine", label: "와인", colors: ["#3c1438"], textColor: "#ffffff" },
  { id: "forest", label: "포레스트", colors: ["#1a2e1a"], textColor: "#ffffff" },
  { id: "cream", label: "크림", colors: ["#f5f0e8"], textColor: "#1a1d29" },
  { id: "white", label: "화이트", colors: ["#ffffff"], textColor: "#1a1d29" },
]

const { width: SCREEN_WIDTH } = Dimensions.get("window")
const PREVIEW_PADDING = 12
const CARD_H_PADDING = 14
const PREVIEW_WIDTH = SCREEN_WIDTH - PREVIEW_PADDING * 2
const PREVIEW_CELL_SIZE = Math.floor((PREVIEW_WIDTH - CARD_H_PADDING * 2 - 12) / 7)

const DAY_LABELS_MONDAY = ["월", "화", "수", "목", "금", "토", "일"]
const DAY_LABELS_SUNDAY = ["일", "월", "화", "수", "목", "금", "토"]

interface Props {
  visible: boolean
  onClose: () => void
  calendarData: CalendarData | null
  year: number
  month: number
  posterMode: PosterMode
  weekStart: WeekStart
}

export default function CalendarDownloadModal({
  visible,
  onClose,
  calendarData,
  year,
  month,
  posterMode,
  weekStart,
}: Props) {
  const viewShotRef = useRef<any>(null)
  const [selectedBg, setSelectedBg] = useState<string>("dark")
  const [saving, setSaving] = useState(false)
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const saveSheetAnim = useRef(new Animated.Value(0)).current
  const [resultMessage, setResultMessage] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null)
  const resultAnim = useRef(new Animated.Value(0)).current

  const bg = BACKGROUND_OPTIONS.find(b => b.id === selectedBg) || BACKGROUND_OPTIONS[0]
  const dayLabels = weekStart === "sunday" ? DAY_LABELS_SUNDAY : DAY_LABELS_MONDAY

  const now = new Date()

  const isFuture = (dateStr: string) => {
    return dateStr > `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  }

  const buildCalendarGrid = (): (CalendarDay | null)[][] => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const jsDay = new Date(year, month - 1, 1).getDay()
    const firstDayOffset = weekStart === "sunday"
      ? jsDay
      : (jsDay === 0 ? 6 : jsDay - 1)

    const dayMap = new Map<string, CalendarDay>()
    if (calendarData) {
      for (const day of calendarData.days) {
        dayMap.set(day.date, day)
      }
    }

    const cells: (CalendarDay | null)[] = []
    for (let i = 0; i < firstDayOffset; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      cells.push(dayMap.get(dateStr) ?? { date: dateStr, movie_count: 0, movies: [] })
    }
    while (cells.length % 7 !== 0) cells.push(null)

    const rows: (CalendarDay | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }

  const captureImage = useCallback(async (): Promise<string | null> => {
    if (!viewShotRef.current) return null
    try {
      const uri = await viewShotRef.current.capture()
      return uri
    } catch (error) {
      console.error("캡처 실패:", error)
      return null
    }
  }, [])

  const showResult = (type: "success" | "error", title: string, message: string) => {
    resultAnim.setValue(0)
    setShowSaveSheet(false)
    // Small delay to let saveSheet unmount cleanly before showing result
    setTimeout(() => {
      setResultMessage({ type, title, message })
      Animated.timing(resultAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start()
    }, 50)
  }

  const hideResult = (callback?: () => void) => {
    Animated.timing(resultAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setResultMessage(null)
      callback?.()
    })
  }

  const openSaveSheet = () => {
    saveSheetAnim.setValue(0)
    setShowSaveSheet(true)
    Animated.timing(saveSheetAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }

  const closeSaveSheet = () => {
    Animated.timing(saveSheetAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSaveSheet(false)
    })
  }

  const handleSaveToGallery = async () => {
    setShowSaveSheet(false)
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== "granted") {
        showResult("error", "권한 필요", "이미지를 저장하려면 갤러리 접근 권한이 필요합니다.")
        return
      }
      setSaving(true)
      const uri = await captureImage()
      if (!uri) return
      await MediaLibrary.saveToLibraryAsync(uri)
      setSaving(false)
      showResult("success", "저장 완료", "달력 이미지가 갤러리에 저장되었습니다.")
    } catch (error) {
      console.error("갤러리 저장 실패:", error)
      setSaving(false)
      showResult("error", "오류", "이미지 저장에 실패했습니다.")
    }
  }

  const handleShare = async () => {
    setShowSaveSheet(false)
    try {
      setSaving(true)
      const uri = await captureImage()
      if (!uri) {
        setSaving(false)
        return
      }

      const filename = `cineentry_${year}${String(month).padStart(2, "0")}.png`
      const shareUri = `${FileSystem.cacheDirectory}${filename}`
      await FileSystem.copyAsync({ from: uri, to: shareUri })

      await Sharing.shareAsync(shareUri, {
        mimeType: "image/png",
        dialogTitle: "시청 달력 공유",
      })
      setSaving(false)
    } catch (error) {
      console.error("공유 실패:", error)
      setSaving(false)
      showResult("error", "오류", "공유에 실패했습니다.")
    }
  }

  const handleSave = () => {
    openSaveSheet()
  }

  const rows = buildCalendarGrid()
  const watchedDays = calendarData?.days.filter(d => d.movie_count > 0).length ?? 0
  const totalMovies = calendarData?.days.reduce((sum, d) => sum + d.movie_count, 0) ?? 0

  const isDark = bg.textColor === "#ffffff"
  const subtextColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)"
  const cellBgColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"
  const dividerColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"
  const overlayColor = isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.2)"

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        {/* Header - overlaid on top */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.darkNavy} />
            ) : (
              <Text style={styles.saveButtonText}>저장</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Center - Calendar Preview */}
        <View style={styles.centerArea}>
          <View style={styles.previewSection}>
            <ViewShot
              ref={viewShotRef}
              options={{ format: "png", quality: 1.0, result: "tmpfile" }}
              style={[styles.previewCard, { backgroundColor: bg.colors[0] }]}
            >
              {/* Logo Area */}
              <View style={styles.logoArea}>
                <View style={styles.logoRow}>
                  <Ionicons name="film" size={18} color={COLORS.gold} />
                  <Text style={[styles.logoText, { color: bg.textColor }]}>CineEntry</Text>
                </View>
                <Text style={[styles.logoSubtext, { color: subtextColor }]}>
                  나만의 영화 기록
                </Text>
              </View>

              {/* Month Title */}
              <Text style={[styles.previewMonthTitle, { color: bg.textColor }]}>
                {year}년 {month}월
              </Text>

              {/* Day Labels */}
              <View style={styles.previewDayLabelRow}>
                {dayLabels.map((label) => (
                  <Text
                    key={label}
                    style={[
                      styles.previewDayLabel,
                      { color: subtextColor },
                      label === "일" && { color: COLORS.sundayRed },
                      label === "토" && { color: COLORS.saturdayBlue },
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.previewGrid}>
                {rows.map((row, rowIdx) => (
                  <View key={rowIdx} style={styles.previewRow}>
                    {row.map((cell, colIdx) => {
                      if (!cell) {
                        return <View key={colIdx} style={styles.previewEmptyCell} />
                      }
                      const dayNum = parseInt(cell.date.split("-")[2], 10)
                      const hasMovie = cell.movie_count > 0
                      const future = isFuture(cell.date)
                      const poster = cell.movies?.[0]?.poster_url
                      const dayLabel = dayLabels[colIdx]
                      const isSunday = dayLabel === "일"
                      const isSaturday = dayLabel === "토"
                      const movies = cell.movies || []
                      const showSplit = posterMode === "split" && hasMovie && cell.movie_count >= 2

                      return (
                        <View
                          key={colIdx}
                          style={[
                            styles.previewCell,
                            { backgroundColor: cellBgColor },
                          ]}
                        >
                          {hasMovie && !showSplit && poster ? (
                            <>
                              <Image source={{ uri: poster }} style={styles.previewPosterImage} />
                              <View style={[styles.previewPosterOverlay, { backgroundColor: overlayColor }]} />
                            </>
                          ) : null}

                          {showSplit && cell.movie_count === 2 ? (
                            <>
                              <View style={styles.splitRow}>
                                {movies.slice(0, 2).map((m, i) => (
                                  <View key={m.id ?? i} style={styles.splitHalf}>
                                    {m.poster_url ? (
                                      <Image source={{ uri: m.poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: cellBgColor }]} />
                                    )}
                                  </View>
                                ))}
                              </View>
                              <View style={[styles.previewPosterOverlay, { backgroundColor: overlayColor }]} />
                            </>
                          ) : null}

                          {showSplit && cell.movie_count === 3 ? (
                            <>
                              <View style={styles.splitRow}>
                                <View style={styles.splitHalf}>
                                  {movies[0]?.poster_url ? (
                                    <Image source={{ uri: movies[0].poster_url }} style={styles.splitImage} />
                                  ) : (
                                    <View style={[styles.splitImage, { backgroundColor: cellBgColor }]} />
                                  )}
                                </View>
                                <View style={styles.splitHalf}>
                                  <View style={{ flex: 1, overflow: "hidden" }}>
                                    {movies[1]?.poster_url ? (
                                      <Image source={{ uri: movies[1].poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: cellBgColor }]} />
                                    )}
                                  </View>
                                  <View style={{ flex: 1, overflow: "hidden" }}>
                                    {movies[2]?.poster_url ? (
                                      <Image source={{ uri: movies[2].poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: cellBgColor }]} />
                                    )}
                                  </View>
                                </View>
                              </View>
                              <View style={[styles.previewPosterOverlay, { backgroundColor: overlayColor }]} />
                            </>
                          ) : null}

                          {showSplit && cell.movie_count >= 4 ? (
                            <>
                              <View style={styles.splitGrid}>
                                {movies.slice(0, 4).map((m, i) => (
                                  <View key={m.id ?? i} style={styles.splitQuarter}>
                                    {m.poster_url ? (
                                      <Image source={{ uri: m.poster_url }} style={styles.splitImage} />
                                    ) : (
                                      <View style={[styles.splitImage, { backgroundColor: cellBgColor }]} />
                                    )}
                                  </View>
                                ))}
                              </View>
                              <View style={[styles.previewPosterOverlay, { backgroundColor: overlayColor }]} />
                            </>
                          ) : null}

                          <Text
                            style={[
                              styles.previewDayNum,
                              { color: bg.textColor },
                              isSunday && { color: COLORS.sundayRed },
                              isSaturday && { color: COLORS.saturdayBlue },
                              future && { color: isDark ? COLORS.mediumGray : "rgba(0,0,0,0.25)" },
                              hasMovie && {
                                color: "#ffffff",
                                textShadowColor: "rgba(0,0,0,0.8)",
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 3,
                              },
                            ]}
                          >
                            {dayNum}
                          </Text>

                          {cell.movie_count > 1 && posterMode === "single" && (
                            <View style={styles.previewCountBadge}>
                              <Text style={styles.previewCountBadgeText}>{cell.movie_count}</Text>
                            </View>
                          )}

                          {hasMovie && <View style={styles.previewWatchedDot} />}
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>

              {/* Summary Footer */}
              <View style={[styles.previewSummary, { borderTopColor: dividerColor }]}>
                <View style={styles.previewSummaryItem}>
                  <Text style={[styles.previewSummaryValue, { color: COLORS.gold }]}>{watchedDays}</Text>
                  <Text style={[styles.previewSummaryLabel, { color: subtextColor }]}>시청한 날</Text>
                </View>
                <View style={[styles.previewSummaryDivider, { backgroundColor: dividerColor }]} />
                <View style={styles.previewSummaryItem}>
                  <Text style={[styles.previewSummaryValue, { color: COLORS.gold }]}>{totalMovies}</Text>
                  <Text style={[styles.previewSummaryLabel, { color: subtextColor }]}>총 시청 편수</Text>
                </View>
              </View>
            </ViewShot>
          </View>
        </View>

        {/* Bottom - Background Selector */}
        <View style={styles.bottomBar}>
          <Text style={styles.bgSectionTitle}>배경</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bgList}>
            {BACKGROUND_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                onPress={() => setSelectedBg(option.id)}
                style={styles.bgOption}
              >
                <View
                  style={[
                    styles.bgPreview,
                    { backgroundColor: option.colors[0] },
                    option.id === "white" && styles.bgPreviewLight,
                    selectedBg === option.id && { borderColor: COLORS.gold },
                  ]}
                />
                <Text
                  style={[
                    styles.bgLabel,
                    selectedBg === option.id && styles.bgLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Inline Save Action Sheet */}
        {showSaveSheet && (
          <Animated.View
            style={[
              styles.sheetOverlay,
              { opacity: saveSheetAnim },
            ]}
          >
            <Pressable style={styles.sheetOverlayPress} onPress={() => closeSaveSheet()}>
              <Animated.View
                style={[
                  styles.sheetContainer,
                  {
                    transform: [{
                      translateY: saveSheetAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [300, 0],
                      }),
                    }],
                  },
                ]}
              >
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View style={styles.sheetHandle} />
                  <Text style={styles.sheetTitle}>저장 방식 선택</Text>
                  <Text style={styles.sheetMessage}>달력 이미지를 어떻게 저장할까요?</Text>

                  <View style={styles.sheetButtonRow}>
                    <TouchableOpacity style={styles.sheetActionButton} onPress={handleSaveToGallery}>
                      <View style={styles.sheetIconCircle}>
                        <Ionicons name="download-outline" size={24} color={COLORS.gold} />
                      </View>
                      <Text style={styles.sheetActionText}>갤러리에 저장</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.sheetActionButton} onPress={handleShare}>
                      <View style={styles.sheetIconCircle}>
                        <Ionicons name="share-outline" size={24} color={COLORS.gold} />
                      </View>
                      <Text style={styles.sheetActionText}>공유하기</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.sheetCancelButton} onPress={() => closeSaveSheet()}>
                    <Text style={styles.sheetCancelText}>취소</Text>
                  </TouchableOpacity>
                </Pressable>
              </Animated.View>
            </Pressable>
          </Animated.View>
        )}

        {/* Inline Result Alert */}
        {resultMessage && (
          <Animated.View style={[styles.resultOverlay, { opacity: resultAnim }]}>
            <View style={styles.resultOverlayPress}>
              <View style={styles.resultCard}>
                <View style={styles.resultIconContainer}>
                  <Ionicons
                    name={resultMessage.type === "success" ? "checkmark-circle" : "alert-circle"}
                    size={36}
                    color={resultMessage.type === "success" ? COLORS.success : COLORS.red}
                  />
                </View>
                <Text style={styles.resultTitle}>{resultMessage.title}</Text>
                <Text style={styles.resultMessageText}>{resultMessage.message}</Text>
                <TouchableOpacity
                  style={styles.resultButton}
                  onPress={() => {
                    hideResult(resultMessage.type === "success" ? onClose : undefined)
                  }}
                >
                  <Text style={styles.resultButtonText}>확인</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButton: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.darkNavy,
  },

  // Center area
  centerArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: PREVIEW_PADDING,
  },
  previewSection: {
    width: "100%",
  },
  previewCard: {
    borderRadius: 16,
    paddingHorizontal: CARD_H_PADDING,
    paddingVertical: 16,
    overflow: "hidden",
  },

  // Logo
  logoArea: {
    alignItems: "center",
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  logoText: {
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  logoSubtext: {
    fontSize: 11,
  },

  // Month title
  previewMonthTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },

  // Day labels
  previewDayLabelRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  previewDayLabel: {
    width: PREVIEW_CELL_SIZE,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
  },

  // Grid
  previewGrid: {
    gap: 2,
  },
  previewRow: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 2,
  },
  previewEmptyCell: {
    width: PREVIEW_CELL_SIZE,
    height: PREVIEW_CELL_SIZE,
  },
  previewCell: {
    width: PREVIEW_CELL_SIZE,
    height: PREVIEW_CELL_SIZE,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  previewPosterImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: 5,
  },
  previewPosterOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    borderRadius: 5,
  },
  previewDayNum: {
    fontSize: 11,
    fontWeight: "600",
    zIndex: 1,
  },
  previewCountBadge: {
    position: "absolute",
    top: 1,
    right: 1,
    backgroundColor: COLORS.gold,
    borderRadius: 7,
    minWidth: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    zIndex: 2,
  },
  previewCountBadgeText: {
    fontSize: 7,
    fontWeight: "800",
    color: COLORS.darkNavy,
  },
  previewWatchedDot: {
    position: "absolute",
    bottom: 2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.gold,
    zIndex: 2,
  },

  // Split poster styles
  splitRow: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    flexDirection: "row",
  },
  splitHalf: {
    flex: 1,
    overflow: "hidden",
  },
  splitGrid: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
  },
  splitQuarter: {
    width: "50%",
    height: "50%",
    overflow: "hidden",
  },
  splitImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  // Summary
  previewSummary: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  previewSummaryItem: {
    flex: 1,
    alignItems: "center",
  },
  previewSummaryValue: {
    fontSize: 22,
    fontWeight: "bold",
  },
  previewSummaryLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  previewSummaryDivider: {
    width: 1,
    height: 32,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: COLORS.deepGray,
  },
  bgSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.lightGray,
    marginBottom: 12,
  },
  bgList: {
    gap: 14,
    paddingRight: 12,
  },
  bgOption: {
    alignItems: "center",
    gap: 5,
  },
  bgPreview: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: "transparent",
  },
  bgPreviewLight: {
    borderColor: "rgba(255,255,255,0.15)",
  },
  bgLabel: {
    fontSize: 10,
    color: COLORS.lightGray,
  },
  bgLabelSelected: {
    color: COLORS.gold,
    fontWeight: "bold",
  },

  // Inline save action sheet
  sheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheetOverlayPress: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: COLORS.deepGray,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "center",
    marginBottom: 6,
  },
  sheetMessage: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: "center",
    marginBottom: 24,
  },
  sheetButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginBottom: 20,
  },
  sheetActionButton: {
    alignItems: "center",
    gap: 8,
  },
  sheetIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheetActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.white,
  },
  sheetCancelButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.lightGray,
  },

  // Inline result alert
  resultOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  resultOverlayPress: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  resultCard: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    width: SCREEN_WIDTH - 64,
    maxWidth: 340,
  },
  resultIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "center",
    marginBottom: 8,
  },
  resultMessageText: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  resultButton: {
    alignSelf: "stretch",
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    alignItems: "center",
  },
  resultButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.darkNavy,
  },
})
