import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Freq } from "@/lib/api"

interface Settings {
  ticker: string
  freq: Freq
  theme: "dark" | "light"
  setFreq: (f: Freq) => void
  toggleTheme: () => void
}

const Ctx = createContext<Settings | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [freq, setFreq] = useState<Freq>("daily")
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("ts-theme") as "dark" | "light") || "dark",
  )

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("ts-theme", theme)
  }, [theme])

  return (
    <Ctx.Provider
      value={{
        ticker: "ASML",
        freq,
        theme,
        setFreq,
        toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useSettings must be used inside SettingsProvider")
  return v
}
