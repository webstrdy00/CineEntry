import { Platform } from "react-native"

export type OAuthBridgeProvider = "google" | "kakao"

const truthyValues = new Set(["1", "true", "yes", "on"])

const isTruthyEnv = (value: string | undefined) => {
  return truthyValues.has((value || "").trim().toLowerCase())
}

export const isWebPlatform = Platform.OS === "web"
export const isFullWebAppEnabled = isTruthyEnv(process.env.EXPO_PUBLIC_ENABLE_WEB_APP)
export const isWebOAuthOnlyMode = isWebPlatform && !isFullWebAppEnabled

export const getOAuthBridgeProviderFromUrl = (
  url: string
): OAuthBridgeProvider | null => {
  if (url.includes("/auth/google/callback")) {
    return "google"
  }
  if (url.includes("/auth/kakao/callback")) {
    return "kakao"
  }
  return null
}

export const buildAppOAuthCallbackUrl = (
  provider: OAuthBridgeProvider,
  params: URLSearchParams
) => {
  const forwardedParams = new URLSearchParams()
  const forwardedParamKeys = ["code", "state", "error", "error_description"]

  forwardedParamKeys.forEach((key) => {
    const value = params.get(key)
    if (value) {
      forwardedParams.set(key, value)
    }
  })

  const query = forwardedParams.toString()
  const baseUrl = `cineentry://auth/${provider}/callback`
  return query ? `${baseUrl}?${query}` : baseUrl
}
