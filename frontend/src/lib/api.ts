/**
 * api.ts — one typed function per endpoint.
 *
 * Requests go to a relative /api path; Vite proxies it to uvicorn in dev.
 * The backend returns {error, detail} on failure, so that body is unpacked
 * into the thrown Error rather than surfacing a bare status code.
 */

const BASE = "/api"

async function get<T>(path: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v))
  }
  const url = `${BASE}${path}${qs.toString() ? `?${qs}` : ""}`
  const res = await fetch(url, { signal })

  if (!res.ok) {
    const msg = await res
      .json()
      .then((b) => [b.error, b.detail].filter(Boolean).join(" — "))
      .catch(() => "")
    throw new Error(msg || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export type Freq = "daily" | "monthly"

export const getMeta = (ticker: string, s?: AbortSignal) => get<any>("/meta", { ticker }, s)

export const getSeries = (ticker: string, freq: Freq, limit = 0, s?: AbortSignal) =>
  get<any>("/series", { ticker, freq, limit }, s)

export const getDecompose = (ticker: string, model: string, method: string, s?: AbortSignal) =>
  get<any>("/decompose", { ticker, model, method }, s)

export const getStationarity = (ticker: string, freq: Freq, s?: AbortSignal) =>
  get<any>("/stationarity", { ticker, freq }, s)

export const getAcf = (ticker: string, freq: Freq, transform: string, nlags = 40, s?: AbortSignal) =>
  get<any>("/acf", { ticker, freq, transform, nlags }, s)

export const getMa = (ticker: string, windows = "3,6,12", s?: AbortSignal) =>
  get<any>("/smoothing/ma", { ticker, windows }, s)

export const getEts = (
  ticker: string, method: string, seasonal: string, holdout = 12, h = 12, s?: AbortSignal,
) => get<any>("/smoothing/ets", { ticker, method, seasonal, holdout, h }, s)

export const getCompare = (ticker: string, holdout = 12, s?: AbortSignal) =>
  get<any>("/smoothing/compare", { ticker, holdout }, s)

export const getArimaGrid = (ticker: string, freq: Freq, s?: AbortSignal) =>
  get<any>("/arima/grid", { ticker, freq }, s)

export const getArimaFit = (
  ticker: string, freq: Freq, p: number, d: number, q: number, h = 30, s?: AbortSignal,
) => get<any>("/arima/fit", { ticker, freq, p, d, q, h }, s)

export const getArimaDiagnostics = (
  ticker: string, freq: Freq, p: number, d: number, q: number, s?: AbortSignal,
) => get<any>("/arima/diagnostics", { ticker, freq, p, d, q }, s)

export const getBacktest = (ticker: string, horizons = "1,3,6", s?: AbortSignal) =>
  get<any>("/backtest", { ticker, freq: "monthly", horizons }, s)

export const getGarch = (ticker: string, s?: AbortSignal) => get<any>("/garch", { ticker }, s)

export const getOptions = (ticker: string, expiryIndex = 4, s?: AbortSignal) =>
  get<any>("/options", { ticker, expiry_index: expiryIndex }, s)

export const getCcf = (ticker: string, maxLag = 10, s?: AbortSignal) =>
  get<any>("/macro/ccf", { ticker, max_lag: maxLag }, s)

export const getGranger = (ticker: string, maxLag = 5, s?: AbortSignal) =>
  get<any>("/macro/granger", { ticker, max_lag: maxLag }, s)

export const getDlag = (ticker: string, symbol = "SOXX", s?: AbortSignal) =>
  get<any>("/macro/dlag", { ticker, symbol }, s)
