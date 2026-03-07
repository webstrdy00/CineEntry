/**
 * Theme Configuration for CineEntry App
 *
 * Typography, Spacing, Border Radius 등 디자인 시스템 정의
 */

export const TYPOGRAPHY = {
  // Font Sizes
  fontSize: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 15,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 28,
  },

  // Font Weights
  fontWeight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
} as const

export const SPACING = {
  // Padding & Margin values
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,

  // Screen specific
  screenHorizontal: 20,  // 화면 좌우 패딩
  sectionBottom: 24,     // 섹션 간 여백
  cardPadding: 16,       // 카드 내부 패딩
} as const

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const

export const SHADOWS = {
  small: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
} as const

// Type exports
export type TypographySize = keyof typeof TYPOGRAPHY.fontSize
export type SpacingSize = keyof typeof SPACING
export type BorderRadiusSize = keyof typeof BORDER_RADIUS
