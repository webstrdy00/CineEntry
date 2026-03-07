import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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
import { isAxiosError } from "axios"
import { COLORS } from "../constants/colors"
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_FILE_SIZE_BYTES,
  YEARLY_GOAL_MAX,
  YEARLY_GOAL_MIN,
} from "../constants/profile"
import type { RootStackParamList } from "../types"
import { useAuth } from "../contexts/AuthContext"
import { getCurrentUser, updateUserProfile, deleteUser } from "../services/userService"
import { requestPasswordReset, resendVerificationEmail } from "../services/authService"
import api, { unwrapResponse } from "../lib/api"
import { useAlert } from "../components/CustomAlert"
import UserAvatar from "../components/UserAvatar"

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
  const [authMethods, setAuthMethods] = useState<string[]>([])
  const [emailVerified, setEmailVerified] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [createdAt, setCreatedAt] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [sendingAccountMail, setSendingAccountMail] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  // 원본 값 (변경 감지용)
  const originalValues = useRef({ displayName: "", avatarUrl: "", yearlyGoal: "" })
  const isBusy = saving || uploadingAvatar || isDeleting || sendingAccountMail

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (!isAxiosError(error)) return fallback

    if (!error.response) {
      return "네트워크 연결을 확인하고 다시 시도해주세요."
    }

    const responseData = error.response.data as any
    const detail = responseData?.detail
    if (typeof detail === "string") {
      return detail
    }
    if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
      return detail[0].msg
    }

    if (error.response.status === 401) {
      return "세션이 만료되었습니다. 다시 로그인해주세요."
    }

    if (error.response.status === 422) {
      return "입력값을 확인해주세요."
    }

    return fallback
  }

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      setLoading(true)
      const user = await getCurrentUser()
      const name = (user.display_name || "").trim()
      const avatar = (user.avatar_url || "").trim()
      const goal = user.yearly_goal?.toString() || "100"

      setDisplayName(name)
      setAvatarUrl(avatar)
      setYearlyGoal(goal)
      setEmail(user.email || "")
      setAuthProvider(user.auth_provider || "email")
      setAuthMethods(user.auth_methods || [user.auth_provider || "email"])
      setEmailVerified(!!user.email_verified)
      setHasPassword(!!user.has_password)
      setCreatedAt(user.created_at || "")

      originalValues.current = { displayName: name, avatarUrl: avatar, yearlyGoal: goal }
    } catch (error) {
      showAlert("오류", getErrorMessage(error, "사용자 정보를 불러오지 못했습니다."), [
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
    if (isBusy) return

    const trimmedName = displayName.trim()
    if (!trimmedName) {
      showAlert("알림", "이름을 입력해주세요.")
      return
    }

    const trimmedGoal = yearlyGoal.trim()
    const goalNum = trimmedGoal ? parseInt(trimmedGoal, 10) : 100
    if (trimmedGoal && (isNaN(goalNum) || goalNum < YEARLY_GOAL_MIN || goalNum > YEARLY_GOAL_MAX)) {
      showAlert("알림", `연간 목표는 ${YEARLY_GOAL_MIN}~${YEARLY_GOAL_MAX} 사이의 숫자를 입력해주세요.`)
      return
    }

    try {
      setSaving(true)
      const trimmedAvatar = avatarUrl.trim()
      await updateUserProfile({
        display_name: trimmedName,
        avatar_url: trimmedAvatar ? trimmedAvatar : null,
        yearly_goal: goalNum,
      })
      await refreshUser()
      originalValues.current = {
        displayName: trimmedName,
        avatarUrl: trimmedAvatar,
        yearlyGoal: goalNum.toString(),
      }
      navigation.goBack()
    } catch (error) {
      showAlert("오류", getErrorMessage(error, "프로필 수정에 실패했습니다. 다시 시도해주세요."))
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (isBusy) {
      showAlert("알림", "처리 중입니다. 잠시만 기다려주세요.")
      return
    }

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
    if (isBusy) return

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
    if ((asset.fileSize || 0) > MAX_AVATAR_FILE_SIZE_BYTES) {
      showAlert("알림", "프로필 이미지는 5MB 이하 파일만 업로드할 수 있습니다.")
      return
    }

    const fileName = asset.fileName || `avatar_${Date.now()}.jpg`
    const fileType = (asset.mimeType || "image/jpeg").toLowerCase()

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(fileType)) {
      showAlert("알림", "지원하지 않는 이미지 형식입니다. JPG/PNG/WEBP 파일만 업로드할 수 있습니다.")
      return
    }

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
      const uploadResponse = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": fileType },
        body: blob,
      })
      if (!uploadResponse.ok) {
        throw new Error(`업로드 실패 (${uploadResponse.status})`)
      }

      // 3. avatar_url 업데이트
      setAvatarUrl(file_url)
    } catch (error) {
      console.error("아바타 업로드 실패:", error)
      const fallback =
        error instanceof Error
          ? `이미지 업로드에 실패했습니다. (${error.message})`
          : "이미지 업로드에 실패했습니다."
      showAlert("오류", getErrorMessage(error, fallback))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleRemoveAvatar = () => {
    if (isBusy) return
    if (!avatarUrl.trim()) {
      showAlert("알림", "이미 기본 프로필 이미지가 설정되어 있습니다.")
      return
    }

    showAlert("프로필 이미지 제거", "기본 프로필 이미지로 되돌리시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "제거", style: "destructive", onPress: () => setAvatarUrl("") },
    ])
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "회원탈퇴") return
    try {
      setIsDeleting(true)
      await deleteUser()
      setShowDeleteModal(false)
      setDeleteConfirmText("")
      showAlert("탈퇴 완료", "회원 탈퇴가 완료되었습니다.", [
        { text: "확인", onPress: () => signOut() },
      ])
    } catch (error) {
      showAlert("오류", getErrorMessage(error, "회원 탈퇴에 실패했습니다. 다시 시도해주세요."))
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

  const formatAuthMethodLabel = (method: string) => {
    if (method === "google") return "Google"
    if (method === "kakao") return "Kakao"
    return "이메일"
  }

  const handleResendVerification = async () => {
    if (isBusy) return
    try {
      setSendingAccountMail(true)
      await resendVerificationEmail()
      showAlert("인증 메일 발송", "인증 메일을 다시 보냈습니다. 메일함과 스팸함을 확인해주세요.")
    } catch (error) {
      showAlert("오류", getErrorMessage(error, "인증 메일 재발송에 실패했습니다."))
    } finally {
      setSendingAccountMail(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (isBusy) return
    try {
      setSendingAccountMail(true)
      await requestPasswordReset(email)
      showAlert(
        hasPassword ? "재설정 메일 발송" : "비밀번호 설정 메일 발송",
        hasPassword
          ? "비밀번호 재설정 안내 메일을 보냈습니다. 메일함과 스팸함을 확인해주세요."
          : "이메일 로그인 비밀번호를 설정할 수 있는 메일을 보냈습니다. 메일함과 스팸함을 확인해주세요.",
      )
    } catch (error) {
      showAlert("오류", getErrorMessage(error, "비밀번호 재설정 메일 발송에 실패했습니다."))
    } finally {
      setSendingAccountMail(false)
    }
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
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.backButton, isBusy && styles.backButtonDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={isBusy}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>프로필 수정</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={isBusy} style={styles.avatarTouchable}>
            <UserAvatar uri={avatarUrl} size={100} style={styles.avatar} />
            <View style={styles.avatarOverlay}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="camera" size={20} color={COLORS.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>사진을 탭하여 프로필 이미지를 변경하세요 (최대 5MB)</Text>
          <TouchableOpacity
            style={[styles.removeAvatarButton, isBusy && styles.removeAvatarButtonDisabled]}
            onPress={handleRemoveAvatar}
            disabled={isBusy}
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.red} />
            <Text style={styles.removeAvatarButtonText}>기본 이미지로 변경</Text>
          </TouchableOpacity>
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
            <View style={styles.methodChipRow}>
              {authMethods.map((method) => (
                <View key={method} style={styles.methodChip}>
                  <Text style={styles.methodChipText}>{formatAuthMethodLabel(method)}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.fieldHint}>연결된 로그인 수단</Text>
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
            <Text style={styles.fieldHint}>{`올해 목표 관람 횟수를 설정하세요 (${YEARLY_GOAL_MIN}~${YEARLY_GOAL_MAX})`}</Text>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, (isBusy || !hasChanges()) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isBusy || !hasChanges()}
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
            <Text style={styles.accountInfoText}>기본 로그인 방식: {providerLabel}</Text>
          </View>

          {!emailVerified ? (
            <>
              <View style={styles.accountInfoRow}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#f59e0b"
                />
                <Text style={styles.accountInfoText}>이메일 인증이 아직 필요합니다</Text>
              </View>

              <TouchableOpacity
                style={[styles.accountActionButton, isBusy && styles.accountActionButtonDisabled]}
                onPress={() => void handleResendVerification()}
                disabled={isBusy}
              >
                <Ionicons name="mail-unread-outline" size={18} color={COLORS.gold} />
                <Text style={styles.accountActionText}>인증 메일 다시 보내기</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.accountActionButton, isBusy && styles.accountActionButtonDisabled]}
            onPress={() => void handleSendPasswordReset()}
            disabled={isBusy}
          >
            <Ionicons name="key-outline" size={18} color={COLORS.gold} />
            <Text style={styles.accountActionText}>
              {hasPassword ? "비밀번호 재설정 메일 보내기" : "이메일 비밀번호 설정 메일 보내기"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerSection}>
          <View style={styles.sectionDivider} />
          <Text style={styles.dangerSectionTitle}>위험 구역</Text>
          <TouchableOpacity
            style={[styles.deleteAccountButton, isBusy && styles.deleteAccountButtonDisabled]}
            onPress={() => setShowDeleteModal(true)}
            disabled={isBusy}
          >
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
  backButtonDisabled: {
    opacity: 0.4,
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
  removeAvatarButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.4)",
    backgroundColor: "rgba(231, 76, 60, 0.08)",
  },
  removeAvatarButtonDisabled: {
    opacity: 0.5,
  },
  removeAvatarButtonText: {
    fontSize: 12,
    color: COLORS.red,
    fontWeight: "600",
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
  methodChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  methodChip: {
    backgroundColor: COLORS.darkNavy,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  methodChipText: {
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: "700",
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
  accountActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.deepGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  accountActionButtonDisabled: {
    opacity: 0.5,
  },
  accountActionText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: "600",
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
  deleteAccountButtonDisabled: {
    opacity: 0.5,
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
