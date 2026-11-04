import { create } from 'zustand'

// App-wide UI state: the Settings dialog, the sign-in dialog and the Undo toast.
// Anything can open them (the header, a link, a page) without prop drilling.

export type SettingsSection = 'account' | 'training' | 'workout' | 'audio' | 'display' | 'data'

export interface Toast {
  id: number
  message: string
  /** Restores what the action changed; shown as an Undo button. */
  undo?: () => void
}

interface UiState {
  settingsSection: SettingsSection | null
  signInOpen: boolean
  toast: Toast | null
  openSettings: (section?: SettingsSection) => void
  closeSettings: () => void
  setSignInOpen: (open: boolean) => void
  showToast: (message: string, undo?: () => void) => void
  dismissToast: (id?: number) => void
}

let nextId = 1

export const useUiStore = create<UiState>((set, get) => ({
  settingsSection: null,
  signInOpen: false,
  toast: null,
  openSettings: (section = 'account') => set({ settingsSection: section, signInOpen: false }),
  closeSettings: () => set({ settingsSection: null }),
  setSignInOpen: (signInOpen) => set({ signInOpen }),
  showToast: (message, undo) => set({ toast: { id: nextId++, message, undo } }),
  dismissToast: (id) => {
    if (id === undefined || get().toast?.id === id) set({ toast: null })
  },
}))
