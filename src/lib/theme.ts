// Applies the color-theme preference to the DOM. Storage lives in storage.ts
// (the localStorage seam); this module is pure DOM glue so it can run anywhere.
import type { ThemePref } from '../types'

// Status-bar / browser-chrome color per resolved theme (matches --color-surface).
const THEME_COLOR = { dark: '#0b0f17', light: '#f1f5f9' } as const

/** Resolves 'system' against the OS preference; passes 'light'/'dark' through. */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark'
  }
  return pref
}

/** Sets <html data-theme> + the theme-color meta to the resolved theme. */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(pref)
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved])
}
