"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

interface Settings {
  soundEnabled: boolean
  notificationsEnabled: boolean
  reducedMotion: boolean
}

interface SettingsContextType {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

const defaultSettings: Settings = {
  soundEnabled: true,
  notificationsEnabled: true,
  reducedMotion: false,
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)

  useEffect(() => {
    const saved = localStorage.getItem("app-settings")
    if (saved) {
      try {
        setSettings(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse settings", e)
      }
    }
  }, [])

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      if (typeof window !== "undefined") {
        localStorage.setItem("app-settings", JSON.stringify(next))
      }
      return next
    })
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}
