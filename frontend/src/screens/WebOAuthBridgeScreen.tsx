import React, { useEffect, useMemo } from "react"
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import BrandMark from "../components/BrandMark"
import {
  buildAppOAuthCallbackUrl,
  getOAuthBridgeProviderFromUrl,
  OAuthBridgeProvider,
} from "../config/runtime"
import { COLORS } from "../constants/colors"

const providerLabels: Record<OAuthBridgeProvider, string> = {
  google: "Google",
  kakao: "Kakao",
}

const getCurrentUrl = () => {
  if (typeof window === "undefined" || typeof window.location === "undefined") {
    return ""
  }
  return window.location.href
}

const replaceSensitiveCallbackUrl = () => {
  if (typeof window === "undefined" || typeof window.history === "undefined") {
    return
  }
  window.history.replaceState({}, document.title, "/")
}

export default function WebOAuthBridgeScreen() {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()

  const bridgeState = useMemo(() => {
    const currentUrl = getCurrentUrl()
    const provider = getOAuthBridgeProviderFromUrl(currentUrl)

    if (!provider) {
      return {
        provider: null,
        providerLabel: null,
        appCallbackUrl: null,
        isCallback: false,
        hasError: false,
      }
    }

    const parsedUrl = new URL(currentUrl)
    const appCallbackUrl = buildAppOAuthCallbackUrl(provider, parsedUrl.searchParams)

    return {
      provider,
      providerLabel: providerLabels[provider],
      appCallbackUrl,
      isCallback: true,
      hasError: parsedUrl.searchParams.has("error"),
    }
  }, [])

  useEffect(() => {
    if (!bridgeState.appCallbackUrl) {
      return
    }

    const openTimer = window.setTimeout(() => {
      window.location.href = bridgeState.appCallbackUrl as string
    }, 600)
    const cleanupTimer = window.setTimeout(replaceSensitiveCallbackUrl, 1200)

    return () => {
      window.clearTimeout(openTimer)
      window.clearTimeout(cleanupTimer)
    }
  }, [bridgeState.appCallbackUrl])

  const openApp = () => {
    if (!bridgeState.appCallbackUrl) {
      return
    }
    window.location.href = bridgeState.appCallbackUrl
  }

  const logoWidth = Math.max(150, Math.min(width * 0.42, height * 0.2, 184))
  const title = bridgeState.isCallback
    ? bridgeState.hasError
      ? "로그인을 완료하지 못했습니다"
      : "앱으로 돌아갑니다"
    : "CineEntry는 앱에서 이용할 수 있습니다"
  const description = bridgeState.isCallback
    ? `${bridgeState.providerLabel} 인증 결과를 CineEntry 앱으로 전달하고 있습니다.`
    : "이 웹 주소는 모바일 앱 인증을 위한 보조 화면으로만 운영됩니다."

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(insets.bottom + 24, 32),
        },
      ]}
    >
      <View style={styles.content}>
        <BrandMark
          width={logoWidth}
          subtitle="영화를 취향으로 남기는 기록장"
          variant="immersive"
        />

        <View style={styles.statusGroup}>
          <View style={styles.iconShell}>
            <Ionicons
              name={bridgeState.hasError ? "alert-circle" : "phone-portrait"}
              size={28}
              color={bridgeState.hasError ? COLORS.warning : COLORS.gold}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>

        {bridgeState.appCallbackUrl ? (
          <TouchableOpacity style={styles.primaryButton} onPress={openApp}>
            <Ionicons name="open-outline" size={20} color={COLORS.darkNavy} />
            <Text style={styles.primaryButtonText}>앱으로 돌아가기</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 34,
  },
  statusGroup: {
    width: "100%",
    maxWidth: 430,
    alignItems: "center",
    gap: 14,
  },
  iconShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212, 175, 55, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.28)",
  },
  title: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    textAlign: "center",
  },
  description: {
    color: COLORS.lightGray,
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 52,
    minWidth: 184,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: COLORS.darkNavy,
    fontSize: 16,
    fontWeight: "700",
  },
})
