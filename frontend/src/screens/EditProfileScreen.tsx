import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useNavigation } from "@react-navigation/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { useState, useEffect, useRef } from "react"
import * as ImagePicker from "expo-image-picker"
import { COLORS } from "../constants/colors"
import type { RootStackParamList } from "../types"
import { useAuth } from "../contexts/AuthContext"
import { getCurrentUser, updateUserProfile, deleteUser } from "../services/userService"
import api, { unwrapResponse } from "../lib/api"
import { useAlert } from "../components/CustomAlert"

type EditProfileNavigationProp = NativeStackNavigationProp<RootStackParamList>

export default function EditProfileScreen() {
  const navigation = useNavigation<EditProfileNavigationProp>()
  const insets = useSafeAreaInsets()
  const { refreshUser, signOut } = useAuth()
  const { showAlert } = useAlert()

  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [yearlyGoal, setYearlyGoal] = useState("")
  const [email, setEmail] = useState("")
  const [authProvider, setAuthProvider] = useState("")
  const [createdAt, setCreatedAt] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  // 원본 값 (변경 감지용)
  const originalValues = useRef({ displayName: "", avatarUrl: "", yearlyGoal: "" })

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      setLoading(true)
      const user = await getCurrentUser()
      const name = user.display_name || ""
      const avatar = user.avatar_url || ""
      const goal = user.yearly_goal?.toString() || "100"

      setDisplayName(name)
      setAvatarUrl(avatar)
      setYearlyGoal(goal)
      setEmail(user.email || "")
      setAuthProvider((user as any).auth_provider || "email")
      setCreatedAt(user.created_at || "")

      originalValues.current = { displayName: name, avatarUrl: avatar, yearlyGoal: goal }
    } catch (error) {
      showAlert("오류", "사용자 정보를 불러오지 못했습니다.", [
        { text: "확인", onPress: () => navigation.goBack() },
      ])
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = () => {
    return (
      displayName.trim() !== originalValues.current.displayName ||
      avatarUrl.trim() !== originalValues.current.avatarUrl ||
      yearlyGoal.trim() !== originalValues.current.yearlyGoal
    )
  }

  const handleSave = async () => {
    const trimmedName = displayName.trim()
    if (!trimmedName) {
      showAlert("알림", "이름을 입력해주세요.")
      return
    }

    const goalNum = parseInt(yearlyGoal, 10)
    if (yearlyGoal.trim() && (isNaN(goalNum) || goalNum < 1 || goalNum > 999)) {
      showAlert("알림", "연간 목표는 1~999 사이의 숫자를 입력해주세요.")
      return
    }

    try {
      setSaving(true)
      await updateUserProfile({
        display_name: trimmedName,
        avatar_url: avatarUrl.trim() || undefined,
        yearly_goal: goalNum || 100,
      })
      await refreshUser()
      originalValues.current = {
        displayName: trimmedName,
        avatarUrl: avatarUrl.trim(),
        yearlyGoal: (goalNum || 100).toString(),
      }
      navigation.goBack()
    } catch (error) {
      showAlert("오류", "프로필 수정에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (hasChanges()) {
      showAlert("변경사항 취소", "수정한 내용이 저장되지 않습니다. 나가시겠습니까?", [
        { text: "계속 수정", style: "cancel" },
        { text: "나가기", style: "destructive", onPress: () => navigation.goBack() },
      ])
    } else {
      navigation.goBack()
    }
  }

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== "granted") {
      showAlert("권한 필요", "사진 라이브러리 접근 권한이 필요합니다.")
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]
    const fileName = asset.fileName || `avatar_${Date.now()}.jpg`
    const fileType = asset.mimeType || "image/jpeg"

    try {
      setUploadingAvatar(true)

      // 1. Presigned URL 받기
      const presignedRes = await api.post("/api/v1/media/upload", {
        file_name: fileName,
        file_type: fileType,
      })
      const { upload_url, file_url } = unwrapResponse<{ upload_url: string; file_url: string }>(presignedRes)

      // 2. S3에 업로드
      const imageResponse = await fetch(asset.uri)
      const blob = await imageResponse.blob()
      await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": fileType },
        body: blob,
      })

      // 3. avatar_url 업데이트
      setAvatarUrl(file_url)
    } catch (error) {
      console.error("아바타 업로드 실패:", error)
      showAlert("오류", "이미지 업로드에 실패했습니다.")
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "회원탈퇴") return
    try {
      setIsDeleting(true)
      await deleteUser()
      setShowDeleteModal(false)
      showAlert("탈퇴 완료", "회원 탈퇴가 완료되었습니다.", [
        { text: "확인", onPress: () => signOut() },
      ])
    } catch (error) {
      showAlert("오류", "회원 탈퇴에 실패했습니다. 다시 시도해주세요.")
    } finally {
      setIsDeleting(false)
    }
  }

  const formatJoinDate = (dateStr: string) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ""
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    )
  }

  const providerLabel =
    authProvider === "google" ? "Google" : authProvider === "kakao" ? "Kakao" : "이메일"
  const providerIcon =
    authProvider === "google" ? "logo-google" : authProvider === "kakao" ? "chatbubble" : "mail-outline"

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>프로필 수정</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} style={styles.avatarTouchable}>
            <Image
              source={{ uri: avatarUrl || "https://i.pravatar.cc/150?img=12" }}
              style={styles.avatar}
            />
            <View style={styles.avatarOverlay}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="camera" size={20} color={COLORS.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>사진을 탭하여 프로필 이미지를 변경하세요</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* 이름 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>이름</Text>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="이름을 입력하세요"
              placeholderTextColor={COLORS.lightGray}
              maxLength={30}
              returnKeyType="next"
            />
          </View>

          {/* 이메일 (읽기 전용) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>이메일</Text>
            <View style={[styles.textInput, styles.readonlyField]}>
              <Text style={styles.readonlyText}>{email}</Text>
              <View style={styles.providerBadge}>
                <Ionicons name={providerIcon as any} size={12} color={COLORS.gold} style={{ marginRight: 4 }} />
                <Text style={styles.providerText}>{providerLabel}</Text>
              </View>
            </View>
          </View>

          {/* 연간 목표 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>연간 관람 목표</Text>
            <View style={styles.goalRow}>
              <TextInput
                style={[styles.textInput, styles.goalInput]}
                value={yearlyGoal}
                onChangeText={(text) => setYearlyGoal(text.replace(/[^0-9]/g, ""))}
                placeholder="100"
                placeholderTextColor={COLORS.lightGray}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
              />
              <Text style={styles.goalUnit}>편</Text>
            </View>
            <Text style={styles.fieldHint}>올해 목표 관람 횟수를 설정하세요 (1~999)</Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, (saving || !hasChanges()) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || !hasChanges()}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.darkNavy} />
          ) : (
            <Text style={styles.saveButtonText}>저장</Text>
          )}
        </TouchableOpacity>

        {/* Account Info Section */}
        <View style={styles.accountSection}>
          <View style={styles.sectionDivider} />
          <Text style={styles.accountSectionTitle}>계정 정보</Text>

          {createdAt ? (
            <View style={styles.accountInfoRow}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.lightGray} />
              <Text style={styles.accountInfoText}>가입일: {formatJoinDate(createdAt)}</Text>
            </View>
          ) : null}

          <View style={styles.accountInfoRow}>
            <Ionicons name={providerIcon as any} size={18} color={COLORS.lightGray} />
            <Text style={styles.accountInfoText}>로그인 방식: {providerLabel}</Text>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <View style={styles.sectionDivider} />
          <Text style={styles.dangerSectionTitle}>위험 구역</Text>
          <TouchableOpacity style={styles.deleteAccountButton} onPress={() => setShowDeleteModal(true)}>
            <Ionicons name="warning-outline" size={20} color={COLORS.red} />
            <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
          </TouchableOpacity>
          <Text style={styles.dangerHint}>탈퇴 시 모든 데이터(영화 기록, 컬렉션, 태그)가 영구 삭제됩니다.</Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalDismissLayer} activeOpacity={1} onPress={() => setShowDeleteModal(false)} />
          <View style={styles.modalCard}>
            <Ionicons name="warning" size={40} color={COLORS.red} style={styles.modalIcon} />
            <Text style={styles.modalTitle}>회원 탈퇴</Text>
            <Text style={styles.modalDescription}>
              정말 탈퇴하시겠습니까?{"\n"}
              모든 영화 기록, 컬렉션, 태그가 영구적으로 삭제되며 복구할 수 없습니다.
            </Text>
            <Text style={styles.modalConfirmLabel}>확인을 위해 "회원탈퇴"를 입력해주세요</Text>
            <TextInput
              style={styles.modalInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="회원탈퇴"
              placeholderTextColor={COLORS.lightGray}
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmText("")
                }}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteButton, deleteConfirmText !== "회원탈퇴" && styles.modalDeleteButtonDisabled]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== "회원탈퇴" || isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalDeleteText}>탈퇴하기</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: COLORS.lightGray,
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.white,
  },
  headerRight: {
    width: 36,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  avatarTouchable: {
    position: "relative",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.gold,
  },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gold,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.darkNavy,
  },
  avatarHint: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 10,
    opacity: 0.7,
  },
  form: {
    marginHorizontal: 20,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    color: COLORS.lightGray,
    marginBottom: 8,
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.white,
  },
  readonlyField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    opacity: 0.7,
  },
  readonlyText: {
    fontSize: 16,
    color: COLORS.lightGray,
    flex: 1,
  },
  providerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  providerText: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: "600",
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 6,
    opacity: 0.7,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  goalInput: {
    flex: 1,
  },
  goalUnit: {
    fontSize: 16,
    color: COLORS.lightGray,
    fontWeight: "500",
  },
  saveButton: {
    backgroundColor: COLORS.gold,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.darkNavy,
  },

  // Account Info Section
  accountSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(160,160,160,0.1)",
    marginBottom: 20,
  },
  accountSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
    marginBottom: 16,
  },
  accountInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  accountInfoText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },

  // Danger Zone
  dangerSection: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  dangerSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.red,
    marginBottom: 16,
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.deepGray,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.3)",
  },
  deleteAccountText: {
    fontSize: 15,
    color: COLORS.red,
    fontWeight: "600",
  },
  dangerHint: {
    fontSize: 12,
    color: COLORS.lightGray,
    marginTop: 8,
    opacity: 0.7,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    backgroundColor: COLORS.deepGray,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  modalIcon: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  modalConfirmLabel: {
    fontSize: 13,
    color: COLORS.lightGray,
    fontWeight: "600",
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: COLORS.darkNavy,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.white,
    width: "100%",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.3)",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    color: COLORS.lightGray,
    fontWeight: "600",
  },
  modalDeleteButton: {
    flex: 1,
    backgroundColor: COLORS.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalDeleteButtonDisabled: {
    opacity: 0.4,
  },
  modalDeleteText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "bold",
  },

  bottomPadding: {
    height: 80,
  },
})
