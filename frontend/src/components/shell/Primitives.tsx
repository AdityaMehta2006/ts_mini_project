/**
 * Primitives — the small pieces every section reuses.
 *
 * The explanation ladder lives here and is the reason the file exists: the
 * course rubric marks interpretation over computation, so a number must never
 * appear on screen without a way to read it. Sentence first (Interpretation),
 * figure beside it (StatBox), mechanism one hover away (InfoTip).
 */

import { useState, useRef, type ReactNode } from "react"
import { Info, AlertTriangle, RotateCw } from "lucide-react"
import type { ApiState } from "@/hooks/useApiData"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------- Card */

export function Card({
  title, subtitle, tip, right, className, children,
}: {
  title?: string
  subtitle?: ReactNode
  tip?: string
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        "bg-surface border border-hairline rounded-[var(--radius-md)] p-4",
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {title && (
              <h3 className="text-lead font-semibold tracking-tight text-ink flex items-center gap-1.5">
                {title}
                {tip && <InfoTip text={tip} />}
              </h3>
            )}
            {subtitle && (
              <p className="text-caption text-ink-muted mt-0.5 mono">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/* ----------------------------------------------------------- InfoTip */

/**
 * Uses the native Popover API so the bubble renders in the browser's top
 * layer. Tooltips inside scrolling chart containers get clipped by
 * `overflow: hidden` ancestors otherwise, which is exactly where most of
 * these sit.
 */
export function InfoTip({ text, size = 13 }: { text: string; size?: number }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLDivElement>(null)

  const place = () => {
    const a = anchor.current?.getBoundingClientRect()
    const b = bubble.current
    if (!a || !b) return
    b.style.visibility = "hidden"
    b.style.display = "block"
    const r = b.getBoundingClientRect()
    const GAP = 8, EDGE = 10
    const above = a.top - GAP - r.height >= EDGE
    b.style.top = `${above ? a.top - GAP - r.height : a.bottom + GAP}px`
    const ideal = a.left + a.width / 2 - r.width / 2
    b.style.left = `${Math.max(EDGE, Math.min(ideal, window.innerWidth - r.width - EDGE))}px`
    b.style.visibility = "visible"
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label="Explain this"
        // p-1/-m-1 doubles the target without moving the glyph. These sit
        // inside dense stat labels, so a full 44px target is not available.
        className="inline-flex items-center justify-center p-1 -m-1 text-ink-muted hover:text-accent transition-colors align-middle"
        onMouseEnter={() => { setOpen(true); requestAnimationFrame(place) }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => { setOpen(true); requestAnimationFrame(place) }}
        onBlur={() => setOpen(false)}
      >
        <Info size={size} strokeWidth={2} />
      </button>
      <div
        ref={bubble}
        role="tooltip"
        className={cn(
          "fixed z-50 max-w-[300px] bg-surface border border-hairline-strong",
          "rounded-[var(--radius-sm)] px-3 py-2 text-body leading-relaxed text-ink-secondary",
          "shadow-lg pointer-events-none",
          open ? "block" : "hidden",
        )}
      >
        {text}
      </div>
    </>
  )
}

/* ---------------------------------------------------- Interpretation */

/**
 * The plain-English reading of whatever sits above it. This is the primary
 * slot, not an afterthought: a reader who skips every chart should still be
 * able to follow the argument from these bands alone.
 */
export function Interpretation({
  label = "Reading",
  children,
}: {
  label?: string
  children: ReactNode
}) {
  if (!children) return null
  return (
    <div className="mt-3 bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3.5 py-3">
      <span className="block text-micro uppercase tracking-[0.12em] text-accent font-semibold mb-1.5">
        {label}
      </span>
      <p className="text-body leading-[1.65] text-ink-secondary">{children}</p>
    </div>
  )
}

/* -------------------------------------------------------------- Stats */

export function StatGrid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | number }) {
  return (
    <div
      className="grid gap-px bg-hairline border border-hairline rounded-[var(--radius-md)] overflow-hidden"
      style={{
        gridTemplateColumns:
          cols === "auto"
            ? "repeat(auto-fit, minmax(min(148px, 100%), 1fr))"
            : `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {children}
    </div>
  )
}

export function StatBox({
  label, value, unit, tip, tone = "neutral", hint,
}: {
  label: string
  value: ReactNode
  unit?: string
  tip?: string
  tone?: "neutral" | "up" | "down" | "accent"
  hint?: string
}) {
  const toneClass = {
    neutral: "text-ink",
    up: "text-up",
    down: "text-down",
    accent: "text-accent",
  }[tone]

  return (
    <div className="bg-surface px-3.5 py-3">
      {/* Deliberately NOT `uppercase`. Stat labels carry Greek parameter names
          (α, β, γ, σ) and CSS uppercasing silently renders them as Α, Β, Γ, Σ —
          which are different letters meaning different things. Weight and
          tracking carry the label styling instead. */}
      <div className="text-micro font-medium tracking-[0.06em] text-ink-muted flex items-center gap-1 leading-tight">
        <span className="truncate">{label}</span>
        {tip && <InfoTip text={tip} size={11} />}
      </div>
      <div className={cn("mono text-stat font-semibold mt-1.5 leading-none", toneClass)}>
        {value}
        {unit && <span className="text-body font-normal text-ink-muted ml-0.5">{unit}</span>}
      </div>
      {hint && <div className="text-micro text-ink-muted mt-1 leading-tight">{hint}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- Badge */

export function Badge({
  children, tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "up" | "down" | "accent" | "warn"
}) {
  const map = {
    neutral: "border-hairline-strong text-ink-muted",
    up: "border-up/50 text-up bg-up-wash",
    down: "border-down/50 text-down bg-down-wash",
    accent: "border-accent/50 text-accent bg-accent-wash",
    warn: "border-accent/40 text-accent",
  }[tone]
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)]",
        "border text-micro font-medium uppercase tracking-wide whitespace-nowrap",
        map,
      )}
    >
      {children}
    </span>
  )
}

/** Marks material the course never covered, so nothing is oversold. */
export function BeyondPill() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-accent/40 bg-accent-wash text-accent text-micro font-medium uppercase tracking-[0.08em]">
      Beyond syllabus
    </span>
  )
}

/* ------------------------------------------------------------- States */

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn("animate-pulse bg-hairline rounded-[var(--radius-sm)]", className)}
      style={style}
    />
  )
}

/** Skeletons mirror the real geometry so nothing reflows when data lands. */
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="bg-surface border border-hairline rounded-[var(--radius-md)] p-4">
      <Skeleton className="h-3 w-40 mb-4" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  )
}

export function StatsSkeleton({ n = 5 }: { n?: number }) {
  return (
    <div className="grid gap-px bg-hairline border border-hairline rounded-[var(--radius-md)] overflow-hidden"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(148px, 100%), 1fr))" }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="bg-surface px-3.5 py-3">
          <Skeleton className="h-2 w-16 mb-2.5" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-surface border border-down/40 rounded-[var(--radius-md)] p-5 flex items-start gap-3">
      <AlertTriangle size={18} className="text-down shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-lead font-medium text-ink">Could not load this data</p>
        <p className="text-body text-ink-muted mt-1 break-words">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 text-body text-accent hover:underline"
          >
            <RotateCw size={12} /> Retry
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Wraps content that is being refetched. Dimming in place keeps the previous
 * answer readable; swapping back to a skeleton would throw away information
 * the user is still looking at.
 */
export function Dim({ when, children }: { when: boolean; children: ReactNode }) {
  return (
    <div className={cn("transition-opacity duration-200", when && "opacity-50")}>
      {children}
    </div>
  )
}

/**
 * The skeleton -> error -> data path, once.
 *
 * Five people maintain five sections and every panel in all of them wants the
 * same three states in the same order. Written out by hand it drifted: some
 * panels dimmed on refetch and some blanked, some offered Retry and some did
 * not. Composing the existing pieces here rather than restating them is what
 * keeps the five sections looking like one product.
 *
 * The render prop also earns its keep in the types: `data` arrives non-null,
 * so panels stop reaching through `q.data!` into a value that may not be there.
 */
export function Async<T>({
  q, skeleton, children,
}: {
  q: ApiState<T>
  skeleton: ReactNode
  children: (data: T) => ReactNode
}) {
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />
  if (!q.data) return <>{skeleton}</>
  return <Dim when={q.loading}>{children(q.data)}</Dim>
}

/**
 * Caption above a chart. Not `uppercase` — same reason as StatBox above: a
 * caption naming σ or γ would be silently rewritten into a different letter.
 */
export function ChartLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-micro font-medium tracking-[0.07em] text-ink-muted mb-1">
      {children}
    </div>
  )
}
