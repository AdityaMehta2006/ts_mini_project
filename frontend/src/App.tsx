import { useState } from "react"
import { motion } from "motion/react"
import { Sun, Moon, Activity } from "lucide-react"
import { SettingsProvider, useSettings } from "@/context/Settings"
import useApiData from "@/hooks/useApiData"
import { getMeta } from "@/lib/api"
import { SECTIONS } from "@/sections/registry"
import { num, pct } from "@/lib/format"
import { cn } from "@/lib/utils"

function Header({ tab, setTab }: { tab: string; setTab: (id: string) => void }) {
  const { ticker, theme, toggleTheme } = useSettings()
  const meta = useApiData((s) => getMeta(ticker, s), [ticker], "meta")
  const m = meta.data

  const onTabKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key]
    const i = SECTIONS.findIndex((s) => s.id === tab)
    const next =
      step !== undefined ? (i + step + SECTIONS.length) % SECTIONS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? SECTIONS.length - 1
      : null
    if (next === null) return
    e.preventDefault()
    setTab(SECTIONS[next].id)
    document.getElementById(`tab-${SECTIONS[next].id}`)?.focus()
  }

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur border-b border-hairline">
      <div className="max-w-[1400px] mx-auto px-5">
        <div className="flex items-center justify-between gap-4 py-3 flex-wrap">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="flex items-center gap-1.5 text-accent">
              <Activity size={16} strokeWidth={2.5} />
              <span className="mono text-lead font-bold tracking-tight">{ticker}</span>
            </span>
            <span className="text-body text-ink-muted truncate hidden sm:block">
              How predictable is ASML? — a Box–Jenkins audit
            </span>
          </div>

          <div className="flex items-center gap-4">
            {m && (
              <div className="flex items-center gap-4 mono text-body">
                <span className="text-ink font-semibold">{num(m.last_close, 2)}</span>
                <span className={cn(m.cagr_pct >= 0 ? "text-up" : "text-down")}>
                  {pct(m.cagr_pct, 1)} CAGR
                </span>
                <span className="text-ink-muted hidden md:inline">
                  σ {pct(m.ann_vol_pct, 1)}
                </span>
                <span
                  className="text-micro text-ink-muted hidden lg:inline"
                  title={
                    m.freshness.pinned
                      ? `Dataset pinned at ${m.freshness.pinned}. Last observation ${m.freshness.last_observation}.`
                      : `Last observation ${m.freshness.last_observation}`
                  }
                >
                  {m.freshness.pinned
                    ? "● pinned"
                    : m.freshness.is_fresh
                      ? "● live"
                      : "● stale"}{" "}
                  {m.freshness.last_observation}
                </span>
              </div>
            )}
            {/* Negative margin keeps the icon looking the same size while the
                tap target reaches ~36px. */}
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="p-2.5 -m-2.5 text-ink-muted hover:text-accent transition-colors"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        {/* Roving tabindex: one stop for the whole bar, arrows move between
            tabs. A tablist that leaves every tab in the tab order makes a
            keyboard user press Tab six times to reach the content. */}
        <nav className="flex gap-0.5 overflow-x-auto -mb-px" role="tablist" onKeyDown={onTabKey}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              id={`tab-${s.id}`}
              role="tab"
              aria-selected={tab === s.id}
              aria-controls={`panel-${s.id}`}
              tabIndex={tab === s.id ? 0 : -1}
              onClick={() => setTab(s.id)}
              className={cn(
                "relative px-3 py-2.5 text-body whitespace-nowrap transition-colors",
                tab === s.id ? "text-accent" : "text-ink-muted hover:text-ink",
              )}
            >
              <span className="mono text-micro mr-1.5 opacity-60">{s.num}</span>
              {s.short}
              {tab === s.id && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent"
                  transition={{ type: "spring", stiffness: 440, damping: 36 }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}

function Shell() {
  const [tab, setTab] = useState(SECTIONS[0].id)
  const Active = SECTIONS.find((s) => s.id === tab)!.Component

  return (
    <div className="min-h-screen bg-canvas">
      <Header tab={tab} setTab={setTab} />
      <main className="max-w-[1400px] mx-auto px-5 py-6">
        <motion.div
          key={tab}
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Active />
        </motion.div>
      </main>
      <footer className="max-w-[1400px] mx-auto px-5 py-6 text-caption text-ink-muted border-t border-hairline mt-8">
        Time Series Analysis mini project · data from Yahoo Finance via yfinance ·
        models fitted with statsmodels and arch · figures and report numbers generated
        from the same code that serves this dashboard.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  )
}
