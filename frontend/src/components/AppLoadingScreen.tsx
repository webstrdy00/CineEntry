import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { COLORS } from "../constants/colors"
import BrandMark from "./BrandMark"

const TRACK_MIN_WIDTH = 220
const TRACK_MAX_WIDTH = 280
const SWEEP_WIDTH = 76

export default function AppLoadingScreen() {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const [reduceMotion, setReduceMotion] = useState(false)
  const compactLayout = height < 760

  const iconOpacity = useRef(new Animated.Value(0.78)).current
  const iconScale = useRef(new Animated.Value(1)).current
  const haloOpacity = useRef(new Animated.Value(0.16)).current
  const progressTranslateX = useRef(new Animated.Value(-SWEEP_WIDTH)).current

  const contentWidth = useMemo(() => Math.min(width - 40, 360), [width])
  const trackWidth = useMemo(
    () => Math.min(Math.max(width - 104, TRACK_MIN_WIDTH), TRACK_MAX_WIDTH),
    [width]
  )
  const logoWidth = useMemo(
    () => Math.max(210, Math.min(width * (compactLayout ? 0.66 : 0.74), height * 0.44, 304)),
    [compactLayout, height, width]
  )
  const brandGap = compactLayout ? 18 : 24
  const subtitleGap = compactLayout ? 20 : 28
  const footerPaddingBottom = compactLayout ? 2 : 6
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
      haloOpacity.setValue(0.22)
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
        Animated.sequence([
          Animated.timing(haloOpacity, {
            toValue: 0.26,
            duration: 1800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.16,
            duration: 1800,
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
  }, [haloOpacity, iconOpacity, iconScale, progressTranslateX, reduceMotion, trackWidth])

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#06080F", COLORS.darkNavy, "#111522"]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.textureOverlay} pointerEvents="none" />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: haloOpacity,
            top: insets.top + 76,
          },
        ]}
      />
      <View pointerEvents="none" style={styles.edgeVignette} />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <View style={styles.spacer} />

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
            <BrandMark width={logoWidth} />
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
            영화와 취향의 흐름을 차분하게 이어 붙이는 중
          </Text>
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
  textureOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  halo: {
    position: "absolute",
    alignSelf: "center",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(212,175,55,0.18)",
  },
  edgeVignette: {
    ...StyleSheet.absoluteFillObject,
    borderColor: "rgba(0,0,0,0.26)",
    borderWidth: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
  },
  spacer: {
    flex: 1,
  },
  centerBlock: {
    alignSelf: "center",
    width: "100%",
    alignItems: "center",
  },
  brandWrap: {
  },
  subtitle: {
    color: COLORS.lightGray,
    textAlign: "center",
  },
  progressTrack: {
    height: 6,
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
    shadowColor: COLORS.gold,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 4,
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
    color: "rgba(212,175,55,0.72)",
    fontSize: 13,
    marginHorizontal: 8,
  },
})
