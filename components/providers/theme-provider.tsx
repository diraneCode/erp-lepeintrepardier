"use client"

import * as React from "react"

export type Theme = "light" | "dark" | "system"
export const THEME_STORAGE_KEY = "isonem-theme"

/** Script exécuté dans <head> avant le premier rendu pour éviter le flash de thème. */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`

const listeners = new Set<() => void>()

function readTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "system"
  } catch {
    return "system"
  }
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark())
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const onMedia = () => {
    if (readTheme() === "system") applyTheme("system")
    callback()
  }
  media.addEventListener("change", onMedia)
  return () => {
    listeners.delete(callback)
    media.removeEventListener("change", onMedia)
  }
}

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(subscribe, readTheme, () => "system" as Theme)
  const prefersDark = React.useSyncExternalStore(subscribe, systemPrefersDark, () => false)
  const resolvedTheme = theme === "dark" || (theme === "system" && prefersDark) ? "dark" : "light"

  const setTheme = React.useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {}
    applyTheme(next)
    listeners.forEach((l) => l())
  }, [])

  const value = React.useMemo(() => ({ theme, resolvedTheme, setTheme }) as const, [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme doit être utilisé dans <ThemeProvider>")
  return ctx
}
