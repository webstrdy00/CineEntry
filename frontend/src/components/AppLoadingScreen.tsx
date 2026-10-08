import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BRAND_LOCKUP_RATIO } from "../constants/branding"
import { COLORS } from "../constants/colors"

const TRACK_MIN_WIDTH = 220
const TRACK_MAX_WIDTH = 280
const SWEEP_WIDTH = 76
const LOADING_LOGO = require("../../assets/branding/cineentry-logo-loading.png")

export default function AppLoadingScreen() {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [reduceMotion, setReduceMotion] = useState(false)
  const compactLayout = height < 760
  const androidSharpImageProps =
    Platform.OS === "android"
      ? ({
          resizeMethod: "resize",
          resizeMultiplier: 2,
        } as const)
      : undefined

  const iconOpacity = useRef(new Animated.Value(0.78)).current
  const iconScale = useRef(new Animated.Value(1)).current
  const progressTranslateX = useRef(new Animated.Value(-SWEEP_WIDTH)).current

  const contentWidth = useMemo(() => Math.min(width - 40, 360), [width])
  const trackWidth = useMemo(
    () => Math.min(Math.max(width - 104, TRACK_MIN_WIDTH), TRACK_MAX_WIDTH),
    [width]
  )
  const logoWidth = useMemo(
    () => Math.max(176, Math.min(width * (compactLayout ? 0.48 : 0.5), height * 0.22, 208)),
    [compactLayout, height, width]
  )
  const logoHeight = useMemo(() => logoWidth / BRAND_LOCKUP_RATIO, [logoWidth])
  const brandGap = compactLayout ? 18 : 24
  const subtitleGap = compactLayout ? 20 : 28
  const footerPaddingBottom = compactLayout ? 2 : 6
  const mainAreaPaddingBottom = compactLayout ? 30 : 44
  const subtitleFontSize = compactLayout ? 15 : 16
  const subtitleLineHeight = compactLayout ? 22 : 24
  const helperFontSize = compactLayout ? 12 : 13
  const helperLineHeight = compactLayout ? 18 : 20

  useEffect(() => {
    let mounted = true
    let subscription: { remove?: () => void } | undefined

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setReduceMotion(enabled)
        }
      })
      .catch(() => {})

    if (AccessibilityInfo.addEventListener) {
      subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion)
    }

    return () => {
      mounted = false
      subscription?.remove?.()
    }
  }, [])

  useEffect(() => {
    const useNativeDriver = Platform.OS !== "web"

    if (reduceMotion) {
      iconOpacity.setValue(1)
      iconScale.setValue(1)
      progressTranslateX.setValue(trackWidth * 0.38)
      return
    }

    progressTranslateX.setValue(-SWEEP_WIDTH)

    const iconLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(iconOpacity, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
          Animated.timing(iconOpacity, {
            toValue: 0.78,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
        ]),
        Animated.sequence([
          Animated.timing(iconScale, {
            toValue: 1.03,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
          Animated.timing(iconScale, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
        ]),
      ])
    )

    const progressLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(progressTranslateX, {
          toValue: trackWidth,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver,
        }),
        Animated.timing(progressTranslateX, {
          toValue: -SWEEP_WIDTH,
          duration: 0,
          useNativeDriver,
        }),
        Animated.delay(180),
      ])
    )

    iconLoop.start()
    progressLoop.start()

    return () => {
      iconLoop.stop()
      progressLoop.stop()
    }
  }, [iconOpacity, iconScale, progressTranslateX, reduceMotion, trackWidth])

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <View style={[styles.mainArea, { paddingBottom: mainAreaPaddingBottom }]}>
          <View style={[styles.centerBlock, { maxWidth: contentWidth }]}>
            <Animated.View
              style={[
                styles.brandWrap,
                {
                  marginBottom: brandGap,
                  opacity: iconOpacity,
                  transform: [{ scale: iconScale }],
                },
              ]}
            >
              <Image
                source={LOADING_LOGO}
                style={[
                  styles.logo,
                  {
                    width: logoWidth,
                    height: logoHeight,
                  },
                ]}
                resizeMode="contain"
                {...(androidSharpImageProps as any)}
                accessibilityLabel="CineEntry 로고"
                fadeDuration={0}
              />
            </Animated.View>

            <Text
              style={[
                styles.subtitle,
                {
                  fontSize: subtitleFontSize,
                  lineHeight: subtitleLineHeight,
                  marginBottom: subtitleGap,
                },
              ]}
            >
              당신의 기록장을 준비하고 있어요
            </Text>

            <View style={[styles.progressTrack, { width: trackWidth }]}>
              <Animated.View
                style={[
                  styles.progressSweep,
                  {
                    transform: [{ translateX: progressTranslateX }],
                  },
                ]}
              />
            </View>

            <Text
              style={[
                styles.helper,
                {
                  fontSize: helperFontSize,
                  lineHeight: helperLineHeight,
                },
              ]}
            >
              저장한 영화와 감상을 불러오고 있습니다
            </Text>
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          <Text style={styles.footerText}>검색</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerText}>기록</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerText}>정리</Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerText}>회고</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkNavy,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
  },
  mainArea: {
    flex: 1,
    justifyContent: "center",
  },
  centerBlock: {
    alignSelf: "center",
    width: "100%",
    alignItems: "center",
  },
  brandWrap: {
    alignItems: "center",
  },
  logo: {
  },
  subtitle: {
    color: COLORS.lightGray,
    textAlign: "center",
  },
  progressTrack: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: 16,
  },
  progressSweep: {
    width: SWEEP_WIDTH,
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.gold,
  },
  helper: {
    color: "rgba(255,255,255,0.54)",
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  footerText: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  footerDot: {
    color: COLORS.gold,
    fontSize: 13,
    marginHorizontal: 8,
  },
})
