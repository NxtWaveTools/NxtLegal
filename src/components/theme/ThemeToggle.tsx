'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import styles from './ThemeToggle.module.css'

const THEME_STORAGE_KEY = 'nxt-legal-theme'
const THEME_CHANGE_EVENT = 'nxt-legal-theme-change'

type ThemeMode = 'light' | 'dark'

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') {
        return () => {}
      }

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const onThemeEvent = () => onStoreChange()
      const onStorage = (event: StorageEvent) => {
        if (!event.key || event.key === THEME_STORAGE_KEY) {
          onStoreChange()
        }
      }

      window.addEventListener(THEME_CHANGE_EVENT, onThemeEvent)
      window.addEventListener('storage', onStorage)
      mediaQuery.addEventListener('change', onThemeEvent)

      return () => {
        window.removeEventListener(THEME_CHANGE_EVENT, onThemeEvent)
        window.removeEventListener('storage', onStorage)
        mediaQuery.removeEventListener('change', onThemeEvent)
      }
    },
    () => {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      return stored === 'light' || stored === 'dark' ? stored : getSystemTheme()
    },
    () => 'light'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const label = useMemo(() => (theme === 'dark' ? 'Dark' : 'Light'), [theme])

  const handleToggle = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark'
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  return (
    <button type="button" className={styles.toggle} onClick={handleToggle} aria-pressed={theme === 'dark'}>
      <span className={styles.toggleLabel}>{label} Mode</span>
      <span className={styles.toggleTrack}>
        <span className={theme === 'dark' ? styles.toggleThumbDark : styles.toggleThumbLight} />
      </span>
    </button>
  )
}
