import { useEffect, useState } from "react"
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { COLORS } from "../constants/colors"

type UserAvatarProps = {
  uri?: string | null
  size?: number
  style?: StyleProp<ImageStyle>
  accessibilityLabel?: string
}

export default function UserAvatar({
  uri,
  size = 80,
  style,
  accessibilityLabel = "프로필 이미지",
}: UserAvatarProps) {
  const trimmedUri = uri?.trim() || ""
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [trimmedUri])

  const avatarShape = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const

  const personIconSize = Math.max(28, Math.round(size * 0.5))

  if (trimmedUri && !imageFailed) {
    return (
      <Image
        source={{ uri: trimmedUri }}
        accessibilityLabel={accessibilityLabel}
        onError={() => setImageFailed(true)}
        style={[styles.image, avatarShape, style]}
      />
    )
  }

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="기본 프로필 이미지"
      style={[styles.container, avatarShape, style as StyleProp<ViewStyle>]}
    >
      <Ionicons name="person" size={personIconSize} color={COLORS.lightGray} />
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: COLORS.deepGray,
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#3a3d4c",
  },
})
