import React from "react"
import { Image, StyleSheet, Text, View } from "react-native"

import { COLORS } from "../constants/colors"

const BRAND_LOCKUP = require("../../assets/branding/cineentry-logo-lockup.png")
const BRAND_LOCKUP_SOURCE = Image.resolveAssetSource(BRAND_LOCKUP)
const BRAND_LOCKUP_RATIO = BRAND_LOCKUP_SOURCE.width / BRAND_LOCKUP_SOURCE.height

type BrandMarkProps = {
  width?: number
  subtitle?: string
}

export default function BrandMark({
  width = 260,
  subtitle,
}: BrandMarkProps) {
  const radius = Math.max(16, Math.round(width * 0.08))

  return (
    <View style={styles.container}>
      <Image
        source={BRAND_LOCKUP}
        style={[
          styles.logo,
          {
            width,
            aspectRatio: BRAND_LOCKUP_RATIO,
            borderRadius: radius,
          },
        ]}
        resizeMode="contain"
        accessibilityLabel="CineEntry 로고"
      />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  logo: {
    backgroundColor: "#E7E8E4",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 8,
  },
  subtitle: {
    color: COLORS.lightGray,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
})
