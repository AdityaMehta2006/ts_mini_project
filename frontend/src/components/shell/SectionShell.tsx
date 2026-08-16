/**
 * SectionShell — the frame every analysis section reuses.
 *
 * Header (title, presenter, lab reference) -> intro paragraph -> toolbar ->
 * content. Keeping this in one place is what lets five people build five
 * sections that look like one product.
 */

import type { ReactNode } from "react"
import { BeyondPill } from "./Primitives"

export function SectionShell({
  title, presenter, source, intro, beyond, toolbar, children,
}: {
  title: string
  presenter: string
  source: string
  intro: ReactNode
  beyond?: boolean
  toolbar?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-2.5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-title font-semibold tracking-tight text-ink">{title}</h2>
              {beyond && <BeyondPill />}
            </div>
            <p className="text-caption text-ink-muted mt-1 mono">
              {presenter} · {source}
            </p>
          </div>
          {toolbar && <div className="flex items-center gap-2 flex-wrap">{toolbar}</div>}
        </div>
        <p className="text-lead leading-[1.7] text-ink-secondary max-w-[78ch]">{intro}</p>
      </header>
      {children}
    </div>
  )
}

/** Two-column grid that collapses to one on narrow screens. */
export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: cols === 1 ? "1fr" : "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}
    >
      {children}
    </div>
  )
}

/** Wide content (tables, dense charts) must scroll itself, never the page. */
export function ScrollX({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto -mx-1 px-1">{children}</div>
}

export function Table({
  head, children,
}: {
  head: (string | { label: string; align?: "left" | "right" })[]
  children: ReactNode
}) {
  return (
    <ScrollX>
      <table className="w-full text-body border-collapse">
        <thead>
          <tr className="border-b border-hairline-strong">
            {head.map((h, i) => {
              const label = typeof h === "string" ? h : h.label
              const align = typeof h === "string" ? (i === 0 ? "left" : "right") : (h.align ?? "right")
              return (
                <th
                  key={label}
                  className="py-2 px-2.5 text-micro uppercase tracking-[0.07em] text-ink-muted font-medium whitespace-nowrap"
                  style={{ textAlign: align }}
                >
                  {label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </ScrollX>
  )
}

export function Row({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return (
    <tr
      className={
        "border-b border-hairline/60 last:border-0 " +
        (highlight ? "bg-accent-wash" : "hover:bg-sunk transition-colors")
      }
    >
      {children}
    </tr>
  )
}

export function Cell({
  children, align = "right", mono = true, className = "",
}: {
  children: ReactNode
  align?: "left" | "right"
  mono?: boolean
  className?: string
}) {
  return (
    <td
      className={`py-2 px-2.5 whitespace-nowrap ${mono ? "mono" : ""} ${className}`}
      style={{ textAlign: align }}
    >
      {children}
    </td>
  )
}
