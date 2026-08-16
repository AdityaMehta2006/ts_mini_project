/**
 * Chart primitives on Recharts, in the bklit spirit: compose small pieces
 * rather than configure one monolithic component.
 *
 * Colours are `var()` strings. Recharts emits them as SVG presentation
 * attributes, so charts follow the theme with no JavaScript and no re-render.
 */

import type { ReactNode } from "react"
import {
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  ReferenceLine, ReferenceArea,
} from "recharts"
import { shortDate } from "@/lib/format"

export const C = {
  accent: "var(--accent)",
  ink: "var(--ink)",
  muted: "var(--ink-muted)",
  grid: "var(--hairline)",
  up: "var(--up)",
  down: "var(--down)",
  surface: "var(--surface)",
} as const

export const SERIES = [
  "var(--accent)",
  "var(--ramp-2)",
  "var(--ramp-3)",
  "var(--ramp-4)",
  "var(--ramp-5)",
  "var(--ramp-6)",
]

const tooltipStyle = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "var(--radius-sm)",
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    padding: "8px 10px",
  },
  labelStyle: { color: "var(--ink-muted)", fontSize: 11, marginBottom: 4 },
  itemStyle: { padding: "1px 0" },
} as const

export function Chart({ height = 260, children }: { height?: number; children: ReactNode }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as any}
      </ResponsiveContainer>
    </div>
  )
}

/** Standard axis set. `dateAxis` formats the x-axis as short month-year. */
export function Axes({
  dateAxis = true, xKey = "date", yDomain, yTickFormatter, xTickFormatter, unit,
}: {
  dateAxis?: boolean
  xKey?: string
  yDomain?: [number | string, number | string]
  yTickFormatter?: (v: any) => string
  xTickFormatter?: (v: any) => string
  unit?: string
}) {
  return (
    <>
      <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
      <XAxis
        dataKey={xKey}
        tickFormatter={xTickFormatter ?? (dateAxis ? shortDate : undefined)}
        tick={{ fontSize: 11 }}
        stroke={C.grid}
        tickLine={false}
        axisLine={{ stroke: C.grid }}
        minTickGap={28}
      />
      <YAxis
        domain={yDomain ?? ["auto", "auto"]}
        tickFormatter={yTickFormatter}
        tick={{ fontSize: 11 }}
        stroke={C.grid}
        tickLine={false}
        axisLine={false}
        width={54}
        unit={unit}
      />
    </>
  )
}

export function Tip(props: Record<string, unknown> = {}) {
  return <Tooltip {...tooltipStyle} cursor={{ stroke: C.muted, strokeDasharray: "3 3" }} {...props} />
}

export function Key() {
  return (
    <Legend
      wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)", paddingTop: 8 }}
      iconType="plainline"
      iconSize={14}
    />
  )
}

export function ZeroLine({ y = 0, label }: { y?: number; label?: string }) {
  return (
    <ReferenceLine
      y={y}
      stroke={C.muted}
      strokeDasharray="3 3"
      label={label ? { value: label, fill: C.muted, fontSize: 10, position: "right" } : undefined}
    />
  )
}

/** Bartlett / confidence bands on correlogram charts. */
export function Band({ upper, lower }: { upper: number; lower: number }) {
  return (
    <>
      <ReferenceArea y1={lower} y2={upper} fill={C.muted} fillOpacity={0.08} />
      <ReferenceLine y={upper} stroke={C.muted} strokeDasharray="3 3" />
      <ReferenceLine y={lower} stroke={C.muted} strokeDasharray="3 3" />
    </>
  )
}

// Event shading was tried here and removed. The x-axis is categorical (date
// strings) and the series is subsampled server-side, so a ReferenceArea whose
// x1/x2 are literal dates rarely matches an existing category and Recharts
// silently snaps it to the wrong span — it shaded 2015-2020 as "COVID". Making
// it correct means snapping each bound to the nearest surviving row, which is
// more machinery than a decorative band earns. The volatility regimes are
// plainly visible in Section 4's conditional-volatility chart instead.
