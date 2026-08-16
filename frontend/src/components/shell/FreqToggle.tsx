import { Lock } from "lucide-react"
import { useSettings } from "@/context/Settings"
import { InfoTip } from "./Primitives"
import { cn } from "@/lib/utils"

/**
 * Frequency switch.
 *
 * `locked` renders a disabled pill plus the reason instead of silently
 * ignoring the global setting. Some analyses are only defined at one
 * frequency — Holt-Winters needs a seasonal period, GARCH needs daily
 * returns — and a control that appears to work but does nothing is worse than
 * no control at all.
 */
export function FreqToggle({ locked, reason }: { locked?: "daily" | "monthly"; reason?: string }) {
  const { freq, setFreq } = useSettings()

  if (locked) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border border-hairline bg-sunk text-caption text-ink-muted mono">
        <Lock size={11} />
        {locked}
        {reason && <InfoTip text={reason} size={11} />}
      </span>
    )
  }

  return (
    <div className="inline-flex rounded-[var(--radius-sm)] border border-hairline overflow-hidden">
      {(["daily", "monthly"] as const).map((f) => (
        <button
          key={f}
          onClick={() => setFreq(f)}
          aria-pressed={freq === f}
          className={cn(
            "px-2.5 py-1 text-caption mono transition-colors",
            freq === f
              ? "bg-accent-wash text-accent"
              : "text-ink-muted hover:text-ink hover:bg-sunk",
          )}
        >
          {f}
        </button>
      ))}
    </div>
  )
}
