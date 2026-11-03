/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build for the Android app (bundles the Health Connect plugin). */
  readonly VITE_NATIVE?: string
  /** Origin of the API, e.g. https://fitflow7.vercel.app. Unset: same origin. */
  readonly VITE_API_BASE_URL?: string
  /** Public app URL written into calendar events. Unset: https://fitflow7.vercel.app. */
  readonly VITE_APP_URL?: string
}
