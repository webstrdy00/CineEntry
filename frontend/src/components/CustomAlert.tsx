import { createContext, useContext, useState, useCallback, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Animated,
  Dimensions,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { COLORS } from "../constants/colors"

type IoniconName = keyof typeof Ionicons.glyphMap

interface AlertButton {
  text: string
  onPress?: () => void
  style?: "default" | "cancel" | "destructive"
}

interface AlertConfig {
  title: string
  message?: string
  buttons?: AlertButton[]
  icon?: IoniconName
}

interface AlertContextType {
  showAlert: (title: string, message?: string, buttons?: AlertButton[], icon?: IoniconName) => void
}

const AlertContext = createContext<AlertContextType>({
  showAlert: () => {},
})

export function useAlert() {
  return useContext(AlertContext)
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [config, setConfig] = useState<AlertConfig>({ title: "" })
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(100)).current

  const showAlert = useCallback(
    (title: string, message?: string, buttons?: AlertButton[], icon?: IoniconName) => {
      setConfig({ title, message, buttons, icon })
      setVisible(true)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
    },
    [fadeAnim, slideAnim],
  )

  const hideAlert = useCallback(
    (callback?: () => void) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false)
        callback?.()
      })
    },
    [fadeAnim, slideAnim],
  )

  const handleButtonPress = (button: AlertButton) => {
    hideAlert(button.onPress)
  }

  const buttons = config.buttons?.length ? config.buttons : [{ text: "확인" }]
  const hasCancel = buttons.some((b) => b.style === "cancel")
  const hasDestructive = buttons.some((b) => b.style === "destructive")

  // Pick icon based on context
  const getIcon = (): { name: IoniconName; color: string } => {
    if (config.icon) {
      return { name: config.icon, color: COLORS.gold }
    }
    const titleLower = config.title.toLowerCase()
    if (titleLower.includes("오류") || titleLower.includes("실패")) {
      return { name: "alert-circle", color: COLORS.red }
    }
    if (titleLower.includes("완료") || titleLower.includes("성공") || titleLower.includes("환영")) {
      return { name: "checkmark-circle", color: COLORS.success }
    }
    if (titleLower.includes("삭제") || titleLower.includes("탈퇴") || titleLower.includes("제거")) {
      return { name: "trash-outline", color: COLORS.red }
    }
    if (titleLower.includes("권한") || titleLower.includes("알림") || titleLower.includes("안내") || titleLower.includes("확인")) {
      return { name: "information-circle", color: COLORS.gold }
    }
    if (titleLower.includes("준비")) {
      return { name: "time-outline", color: COLORS.gold }
    }
    return { name: "chatbubble-ellipses-outline", color: COLORS.gold }
  }

  const iconInfo = getIcon()

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => hideAlert()}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <Pressable style={styles.overlayPress} onPress={() => {
            if (!hasDestructive) hideAlert()
          }}>
            <Animated.View
              style={[
                styles.alertContainer,
                { transform: [{ translateY: slideAnim }] },
              ]}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                  <Ionicons name={iconInfo.name} size={36} color={iconInfo.color} />
                </View>

                {/* Title */}
                <Text style={styles.title}>{config.title}</Text>

                {/* Message */}
                {config.message ? (
                  <Text style={styles.message}>{config.message}</Text>
                ) : null}

                {/* Buttons */}
                {(() => {
                  const cancelBtn = buttons.find((b) => b.style === "cancel")
                  const actionBtns = buttons.filter((b) => b.style !== "cancel")

                  // 3+ buttons: action buttons in a row, cancel below
                  if (buttons.length >= 3 && cancelBtn) {
                    return (
                      <View style={styles.buttonContainer}>
                        <View style={styles.buttonRow}>
                          {actionBtns.map((button, idx) => {
                            const isDestructive = button.style === "destructive"
                            return (
                              <TouchableOpacity
                                key={idx}
                                style={[
                                  styles.button,
                                  styles.buttonHalf,
                                  isDestructive ? styles.buttonDestructive : styles.buttonPrimary,
                                ]}
                                onPress={() => handleButtonPress(button)}
                              >
                                <Text
                                  style={[
                                    styles.buttonText,
                                    isDestructive ? styles.buttonTextDestructive : styles.buttonTextPrimary,
                                  ]}
                                >
                                  {button.text}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                        <TouchableOpacity
                          style={[styles.button, styles.buttonFull, styles.buttonCancel]}
                          onPress={() => handleButtonPress(cancelBtn)}
                        >
                          <Text style={[styles.buttonText, styles.buttonTextCancel]}>
                            {cancelBtn.text}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )
                  }

                  // 2 buttons: side by side
                  if (buttons.length === 2) {
                    return (
                      <View style={[styles.buttonContainer, styles.buttonRow]}>
                        {buttons.map((button, idx) => {
                          const isCancel = button.style === "cancel"
                          const isDestructive = button.style === "destructive"
                          return (
                            <TouchableOpacity
                              key={idx}
                              style={[
                                styles.button,
                                styles.buttonHalf,
                                isCancel && styles.buttonCancel,
                                isDestructive && styles.buttonDestructive,
                                !isCancel && !isDestructive && styles.buttonPrimary,
                              ]}
                              onPress={() => handleButtonPress(button)}
                            >
                              <Text
                                style={[
                                  styles.buttonText,
                                  isCancel && styles.buttonTextCancel,
                                  isDestructive && styles.buttonTextDestructive,
                                  !isCancel && !isDestructive && styles.buttonTextPrimary,
                                ]}
                              >
                                {button.text}
                              </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )
                  }

                  // 1 button: full width
                  return (
                    <View style={styles.buttonContainer}>
                      {buttons.map((button, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.button, styles.buttonFull, styles.buttonPrimary]}
                          onPress={() => handleButtonPress(button)}
                        >
                          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                            {button.text}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )
                })()}
              </Pressable>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  )
}

const { width: SCREEN_WIDTH } = Dimensions.get("window")

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  overlayPress: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  alertContainer: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.deepGray,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: COLORS.lightGray,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonContainer: {
    width: "100%",
    gap: 8,
  },
  buttonRow: {
    flexDirection: "row",
  },
  button: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonFull: {
    width: "100%",
  },
  buttonHalf: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: COLORS.gold,
  },
  buttonCancel: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  buttonDestructive: {
    backgroundColor: COLORS.red,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "bold",
  },
  buttonTextPrimary: {
    color: COLORS.darkNavy,
  },
  buttonTextCancel: {
    color: COLORS.lightGray,
  },
  buttonTextDestructive: {
    color: COLORS.white,
  },
})
