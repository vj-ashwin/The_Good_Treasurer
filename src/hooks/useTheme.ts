import { useCallback, useEffect, useState } from 'react'

/** Light/dark UI theme. Presentation only: it touches no app data. */
type Theme = 'light' | 'dark'

const STORAGE_KEY = 'tgt-theme'

/**
 * Initial theme for this mount. The saved choice wins; otherwise the operating
 * system preference is honoured. Storage can be unavailable (private mode),
 * which simply falls back to the media query.
 */
function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage blocked: fall through to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Keeps `<html class="dark">` in sync with the chosen theme and persists the
 * choice in localStorage. The inline script in index.html applies the saved
 * theme before first paint, so this only needs to maintain it afterwards.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Persistence unavailable: the choice simply lasts for the session.
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
