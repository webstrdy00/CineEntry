/**
 * Color Theme for CineEntry App
 *
 * 모든 화면에서 일관된 색상을 사용하기 위한 중앙 집중식 색상 정의
 */

export const COLORS = {
  // Main colors
  darkNavy: "#191918",    // 차콜 배경
  deepGray: "#262624",    // 입력·선택 영역
  gold: "#CEB982",        // 별점·주요 동작
  red: "#E68B80",         // 경고

  // Text colors
  white: "#F2F0E9",       // 기본 텍스트
  lightGray: "#ABA99F",   // 보조 텍스트

  // Additional colors (optional, for future use)
  darkGray: "#20201E",    // 보조 배경
  mediumGray: "#85857C",  // 중간 회색
  success: "#9CB49C",     // 성공 메시지
  warning: "#CEB982",     // 경고 메시지
  info: "#98ADB9",        // 정보 메시지

  // Status colors
  watchingBlue: "#98ADB9",    // 보는 중 상태
  completedGreen: "#9CB49C",  // 완료 상태

  // Calendar colors
  sundayRed: "#E67A7A",      // 일요일
  saturdayBlue: "#7AADE6",   // 토요일

  // Chart colors
  chartBlue: "#98ADB9",
  chartGreen: "#9CB49C",
  chartPurple: "#B0A0B9",
  chartOrange: "#CCA381",
} as const

export type ColorKey = keyof typeof COLORS
