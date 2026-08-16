/**
 * Section 1 — Data, Decomposition & Stationarity     (Abhinabha Das)
 *
 * Establishes the series and answers the question every later section
 * depends on: is it stationary, and if not, how many differences does it take?
 */

import { useState } from "react"
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, Cell, ComposedChart,
} from "recharts"
import useApiData from "@/hooks/useApiData"
import { useSettings } from "@/context/Settings"
import { getSeries, getDecompose, getStationarity, getAcf } from "@/lib/api"
import { SectionShell, Grid, Table, Row, Cell as Td } from "@/components/shell/SectionShell"
import { FreqToggle } from "@/components/shell/FreqToggle"
import {
  Card, StatGrid, StatBox, Interpretation, Badge,
  ChartSkeleton, StatsSkeleton, ChartLabel, Async,
} from "@/components/shell/Primitives"
import { Chart, Axes, Tip, C, Band, ZeroLine } from "@/components/charts/base"
import { num, pct, pval } from "@/lib/format"

export default function S1Explore() {
  const { ticker, freq } = useSettings()
  const [method, setMethod] = useState<"classical" | "stl">("classical")
  const [acfOn, setAcfOn] = useState<"log" | "logret">("log")

  const px = useApiData((s) => getSeries(ticker, freq, 0, s), [ticker, freq], "s1-series")
  const dec = useApiData((s) => getDecompose(ticker, "additive", method, s), [ticker, method], "s1-dec")
  const st = useApiData((s) => getStationarity(ticker, freq, s), [ticker, freq], "s1-stat")
  const ac = useApiData((s) => getAcf(ticker, freq, acfOn, 40, s), [ticker, freq, acfOn], "s1-acf")

  return (
    <SectionShell
      title="Data, Decomposition & Stationarity"
      presenter="Abhinabha Das"
      source="Labs 1–4, 6 · ts objects, decompose(), ADF/KPSS, ACF/PACF"
      toolbar={<FreqToggle />}
      intro={
        <>
          Everything downstream rests on two decisions made here. First, we model the{" "}
          <strong className="text-ink font-semibold">logarithm</strong> of the price rather than
          the price: ASML has compounded at roughly 29% a year, and growth that fast is
          multiplicative — logs turn it additive and stabilise the variance at the same time.
          Second, we establish the{" "}
          <strong className="text-ink font-semibold">order of integration</strong>. A series with
          no fixed mean cannot be modelled directly, so ADF and KPSS are run on the level and on
          the first difference to determine how many differences are needed.
        </>
      }
    >
      {/* ---------------------------------------------------------- price */}
      <Async q={px} skeleton={<StatsSkeleton n={6} />}>
        {(d) => (
          <>
            <StatGrid>
              <StatBox label="Observations" value={num(d.n, 0)} hint={freq} />
              <StatBox label="Min close" value={num(d.stats.min, 0)} unit="$" />
              <StatBox label="Max close" value={num(d.stats.max, 0)} unit="$" />
              <StatBox
                label="Mean daily return"
                value={num(d.stats.mean_return_pct, 3)}
                unit="%"
                tone={d.stats.mean_return_pct >= 0 ? "up" : "down"}
              />
              <StatBox label="Return SD" value={num(d.stats.sd_return_pct, 3)} unit="%" />
              <StatBox
                label="Kurtosis"
                value={num(d.stats.kurtosis, 2)}
                tone="accent"
                tip="Excess of 3 means fat tails: extreme days happen far more often than a normal distribution allows. This reappears in Section 3's residual diagnostics and again in Section 4."
                hint="normal = 3"
              />
            </StatGrid>
          </>
        )}
      </Async>

      <Grid>
        <Card
          title="Price and log price"
          subtitle="log scale turns constant growth into a straight line"
          tip="A pure exponential growth path is a straight line in logs. Curvature away from a straight line is where growth accelerated or stalled."
        >
          <Async q={px} skeleton={<ChartSkeleton />}>
            {(d) => (
              <>
                <Chart>
                  <AreaChart data={d.series ?? []}>
                    <defs>
                      <linearGradient id="g-close" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.accent} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Axes yTickFormatter={(v) => num(v, 0)} />
                    <Tip formatter={(v: number) => [num(v, 2), "close"]} />
                    <Area
                      type="monotone" dataKey="close" stroke={C.accent} strokeWidth={1.5}
                      fill="url(#g-close)" dot={false} name="Close"
                    />
                  </AreaChart>
                </Chart>
              </>
            )}
          </Async>
        </Card>

        <Card
          title="Log returns"
          subtitle="Δ log price — the stationary series everything is modelled on"
          tip="Volatility clustering is visible directly: quiet stretches and violent stretches group together rather than alternating randomly. Section 4 models this explicitly."
        >
          <Async q={px} skeleton={<ChartSkeleton />}>
            {(d) => (
              <>
                <Chart>
                  <LineChart data={d.series ?? []}>
                    <Axes yTickFormatter={(v) => (v * 100).toFixed(0) + "%"} />
                    <ZeroLine />
                    <Tip formatter={(v: number) => [pct(v * 100, 2), "return"]} />
                    <Line
                      type="linear" dataKey="log_return" stroke={C.accent} strokeWidth={0.6}
                      dot={false} name="Log return"
                    />
                  </LineChart>
                </Chart>
              </>
            )}
          </Async>
        </Card>
      </Grid>
      {px.data && <Interpretation>{px.data.interpretation}</Interpretation>}

      {/* --------------------------------------------------- decomposition */}
      <Card
        title="Classical decomposition"
        subtitle="observed = trend + seasonal + remainder · monthly"
        tip="Splits the series into a long-run trend, a repeating annual pattern, and what is left over. Fitted on monthly data because a seasonal period has to be defined, and daily stock bars have no weekly cycle."
        right={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-[var(--radius-sm)] border border-hairline overflow-hidden">
              {(["classical", "stl"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`px-2.5 py-1 text-caption mono transition-colors ${
                    method === m ? "bg-accent-wash text-accent" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <FreqToggle locked="monthly" reason="Decomposition needs a defined seasonal period. Daily stock bars have no meaningful weekly cycle, so this is always fitted on the 140 monthly observations." />
          </div>
        }
      >
        <Async q={dec} skeleton={<ChartSkeleton height={340} />}>
          {(d) => (
            <>
              <div className="grid gap-2">
                {[
                  { key: "observed", label: "Observed", color: C.accent },
                  { key: "trend", label: "Trend", color: "var(--ramp-2)" },
                  { key: "seasonal", label: "Seasonal", color: "var(--ramp-3)" },
                  { key: "resid", label: "Remainder", color: "var(--ramp-4)" },
                ].map((p) => (
                  <div key={p.key}>
                    <ChartLabel>
                      {p.label}
                    </ChartLabel>
                    <Chart height={78}>
                      <LineChart data={d.components} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                        <Axes yTickFormatter={(v) => num(v, 2)} />
                        <Tip formatter={(v: number) => [num(v, 4), p.label]} />
                        <Line type="monotone" dataKey={p.key} stroke={p.color} strokeWidth={1.3} dot={false} />
                      </LineChart>
                    </Chart>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3 py-2">
                  <ChartLabel>Trend strength</ChartLabel>
                  <div className="mono text-stat font-semibold text-up">{num(d.strength.trend, 3)}</div>
                </div>
                <div className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3 py-2">
                  <ChartLabel>Seasonal strength</ChartLabel>
                  <div className="mono text-stat font-semibold text-ink-muted">{num(d.strength.seasonal, 3)}</div>
                </div>
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      <Card
        title="Average seasonal effect by month"
        subtitle="if a calendar season existed, these bars would show it"
        tip="Each bar is the average seasonal component for that month across all years. Genuine seasonality produces a consistent, repeating shape — noise produces small, arbitrary bars."
      >
        <Async q={dec} skeleton={<ChartSkeleton height={180} />}>
          {(d) => (
            <>
              <Chart height={180}>
                <BarChart data={d.seasonal_profile ?? []}>
                  <Axes dateAxis={false} xKey="month" yTickFormatter={(v) => num(v, 3)} />
                  <ZeroLine />
                  <Tip formatter={(v: number) => [num(v, 4), "effect"]} />
                  <Bar dataKey="effect" radius={[2, 2, 0, 0]}>
                    {(d.seasonal_profile ?? []).map((d: any, i: number) => (
                      <Cell key={i} fill={d.effect >= 0 ? C.up : C.down} />
                    ))}
                  </Bar>
                </BarChart>
              </Chart>
            </>
          )}
        </Async>
      </Card>

      {/* ---------------------------------------------------- stationarity */}
      <Card
        title="Stationarity: ADF and KPSS"
        subtitle="two tests, opposite null hypotheses"
        tip="ADF's null is that a unit root exists (non-stationary). KPSS's null is that the series is stationary. Because the nulls are opposite, agreement between them is much stronger evidence than either test alone."
      >
        <Async q={st} skeleton={<ChartSkeleton height={200} />}>
          {(d) => (
            <>
              <Table head={["Series", "Test", "Statistic", "p-value", "Null hypothesis", "Verdict"]}>
                {d.tests.map((t: any, i: number) => (
                  <Row key={i}>
                    <Td align="left" mono={false} className="text-ink-secondary">{t.series}</Td>
                    <Td align="left">{t.test}</Td>
                    <Td>{num(t.statistic, 3)}</Td>
                    <Td>{pval(t.pvalue)}</Td>
                    <Td align="left" mono={false} className="text-ink-muted text-caption">{t.null}</Td>
                    <Td>
                      <Badge tone={t.says_stationary ? "up" : "down"}>
                        {t.says_stationary ? "stationary" : "non-stationary"}
                      </Badge>
                    </Td>
                  </Row>
                ))}
              </Table>

              <div className="grid grid-cols-2 gap-3 mt-3">
                {(["level", "diff"] as const).map((k) => (
                  <div key={k} className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3 py-2.5">
                    <ChartLabel>
                      {k === "level" ? "Log level" : "First difference"}
                    </ChartLabel>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={d.matrix[k].verdict === "stationary" ? "up" : "down"}>
                        {d.matrix[k].verdict}
                      </Badge>
                      {d.matrix[k].agree && <Badge tone="accent">tests agree</Badge>}
                    </div>
                  </div>
                ))}
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* ------------------------------------------------------- ACF/PACF */}
      <Card
        title="Correlogram"
        subtitle="ACF and PACF with Bartlett bands"
        tip="ACF measures correlation with lag k including everything in between; PACF strips the intermediate lags out. Slow ACF decay signals non-stationarity; an ACF cut-off at lag q identifies MA(q); a PACF cut-off at lag p identifies AR(p)."
        right={
          <div className="inline-flex rounded-[var(--radius-sm)] border border-hairline overflow-hidden">
            {([["log", "log price"], ["logret", "log returns"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setAcfOn(v)}
                className={`px-2.5 py-1 text-caption mono transition-colors ${
                  acfOn === v ? "bg-accent-wash text-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <Async q={ac} skeleton={<ChartSkeleton height={240} />}>
          {(d) => (
            <>
              <Grid>
                {([["acf", "ACF"], ["pacf", "PACF"]] as const).map(([key, label]) => (
                  <div key={key}>
                    <ChartLabel>{label}</ChartLabel>
                    <Chart height={190}>
                      <ComposedChart data={d[key]}>
                        <Axes dateAxis={false} xKey="lag" yDomain={[-1, 1]} yTickFormatter={(v) => v.toFixed(1)} />
                        <Band upper={d.conf_band} lower={-d.conf_band} />
                        <Tip formatter={(v: number) => [num(v, 4), label]} labelFormatter={(l: any) => `lag ${l}`} />
                        <Bar dataKey="value" barSize={3}>
                          {d[key].map((d: any, i: number) => (
                            <Cell key={i} fill={d.significant ? C.accent : "var(--ramp-5)"} />
                          ))}
                        </Bar>
                      </ComposedChart>
                    </Chart>
                  </div>
                ))}
              </Grid>

              <div className="mt-3">
                <ChartLabel>
                  Ljung-Box p-value by lag · below the line rejects white noise
                </ChartLabel>
                <Chart height={140}>
                  <LineChart data={d.ljung_box}>
                    <Axes dateAxis={false} xKey="lag" yDomain={[0, 1]} yTickFormatter={(v) => v.toFixed(2)} />
                    <ZeroLine y={0.05} label="0.05" />
                    <Tip formatter={(v: number) => [pval(v), "p-value"]} labelFormatter={(l: any) => `lag ${l}`} />
                    <Line type="monotone" dataKey="pvalue" stroke={C.accent} strokeWidth={1.5} dot={{ r: 2 }} />
                  </LineChart>
                </Chart>
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>
    </SectionShell>
  )
}
