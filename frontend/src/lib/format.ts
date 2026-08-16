/** Display helpers. Everything arrives pre-rounded from the API. */

export const num = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })

export const pct = (v: number | null | undefined, d = 1): string =>
  v === null || v === undefined ? "—" : `${v.toFixed(d)}%`

/**
 * p-values need care: 0.0000 reads as "exactly zero", which is never what a
 * test means. Anything below the display floor becomes an inequality.
 */
export const pval = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return "—"
  if (v < 0.0001) return "< 0.0001"
  if (v < 0.001) return v.toExponential(1)
  return v.toFixed(4)
}

export const shortDate = (d: string): string => {
  const t = new Date(d)
  return Number.isNaN(t.getTime())
    ? d
    : t.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

/**
 * Day-level labels. A 30-business-day forecast spans two calendar months, so
 * `shortDate` renders it as "Aug 26" a dozen times over — the axis looks
 * broken even though the data is fine.
 */
export const dayDate = (d: string): string => {
  const t = new Date(d)
  return Number.isNaN(t.getTime())
    ? d
    : t.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
