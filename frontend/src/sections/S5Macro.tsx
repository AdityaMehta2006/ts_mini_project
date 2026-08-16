/**
 * Section 5 — Macro-Factor Lag Analysis     (Aditya Mehta)   [BEYOND SYLLABUS]
 *
 * If ASML cannot predict itself, can anything else predict it? The answer
 * turns on one distinction: correlation at lag 0 versus correlation at any
 * lag. Moving together is not the same as leading.
 */

import { useState } from "react"
import { LineChart, Line, BarChart, Bar, Cell } from "recharts"
import useApiData from "@/hooks/useApiData"
import { useSettings } from "@/context/Settings"
import { getCcf, getGranger, getDlag } from "@/lib/api"
import { SectionShell, Table, Row, Cell as Td } from "@/components/shell/SectionShell"
import {
  Card, StatGrid, StatBox, Interpretation, Badge,
  ChartSkeleton, StatsSkeleton, ChartLabel, Async,
} from "@/components/shell/Primitives"
import { Chart, Axes, Tip, Key, C, Band, ZeroLine, SERIES } from "@/components/charts/base"
import { num, pval } from "@/lib/format"

export default function S5Macro() {
  const { ticker } = useSettings()
  const [factor, setFactor] = useState("SOXX")

  const ccf = useApiData((s) => getCcf(ticker, 10, s), [ticker], "s5-ccf")
  const gr = useApiData((s) => getGranger(ticker, 5, s), [ticker], "s5-granger")
  const dl = useApiData((s) => getDlag(ticker, factor, s), [ticker, factor], "s5-dlag")

  return (
    <SectionShell
      title="Macro-Factor Lag Analysis"
      presenter="Aditya Mehta"
      source="Extension · cross-correlation, distributed lags, Granger causality"
      beyond
      intro={
        <>
          Sections 1 to 3 asked whether ASML's own past predicts its future and answered no. The
          obvious follow-up is whether something else can: the semiconductor sector, its largest
          customers, the market, the fear gauge, the euro, the ten-year yield. The method is{" "}
          <strong className="text-ink font-semibold">cross-correlation across leads and lags</strong>,
          then Granger causality on whatever looks promising. Everything here turns on one
          distinction — correlation <em>at lag 0</em>, which is very large, against correlation{" "}
          <em>at any lag</em>, which is not. Moving together is not the same as leading, and only
          the second one can be forecast with.
        </>
      }
    >
      <Async q={ccf} skeleton={<StatsSkeleton n={4} />}>
        {(d) => (
          <>
            <StatGrid>
              <StatBox label="Common days" value={num(d.n_obs, 0)} hint="inner-joined" />
              <StatBox label="Factors tested" value={num(d.factors.length, 0)} />
              <StatBox
                label="Strongest same-day"
                value={num(d.factors[0].contemporaneous, 3)}
                tone="up"
                hint={d.factors[0].symbol}
              />
              <StatBox
                label="Meaningful leaders"
                value={d.leaders.length === 0 ? "none" : String(d.leaders.length)}
                tone={d.leaders.length === 0 ? "down" : "up"}
                hint="usable lead signal"
                tip="A factor counts as leading only if its best lagged correlation is both statistically significant and at least half the size of its same-day correlation."
              />
            </StatGrid>
          </>
        )}
      </Async>

      {/* ----------------------------------------------------------- CCF */}
      <Card
        title="Cross-correlation by lag"
        subtitle="negative lag = ASML leads · zero = same day · positive lag = factor leads"
        tip="Each line is one factor's correlation with ASML at every shift from −10 to +10 trading days. A factor useful for forecasting would peak to the right of zero. A peak at zero means they simply move together."
      >
        <Async q={ccf} skeleton={<ChartSkeleton height={280} />}>
          {(d) => (
            <>
              <Chart height={290}>
                <LineChart
                  data={Array.from({ length: 21 }, (_, i) => {
                    const lag = i - 10
                    const row: any = { lag }
                    for (const f of d.factors ?? []) {
                      row[f.symbol] = f.lags.find((l: any) => l.lag === lag)?.corr
                    }
                    return row
                  })}
                >
                  <Axes dateAxis={false} xKey="lag" yDomain={[-0.7, 1]} yTickFormatter={(v) => v.toFixed(1)} />
                  <Band upper={d.conf_band ?? 0.04} lower={-(d.conf_band ?? 0.04)} />
                  <ZeroLine />
                  <Tip formatter={(v: number) => num(v, 3)} labelFormatter={(l: any) => `lag ${l} days`} />
                  <Key />
                  {(d.factors ?? []).map((f: any, i: number) => (
                    <Line
                      key={f.symbol} type="monotone" dataKey={f.symbol}
                      stroke={SERIES[i % SERIES.length]} strokeWidth={1.5} dot={false} name={f.symbol}
                    />
                  ))}
                </LineChart>
              </Chart>
              <p className="text-micro text-ink-muted mt-1">
                The shaded band is the 95% range for a correlation of zero. Every line spikes at lag 0
                and returns almost to the band on either side — that shape <em>is</em> the result.
              </p>

              <div className="mt-4">
                <Table head={["Factor", "Name", "Same day", "Best lag", "Corr at lag", "Ratio", "Usable lead"]}>
                  {(d.factors ?? []).map((f: any) => (
                    <Row key={f.symbol}>
                      <Td align="left">{f.symbol}</Td>
                      <Td align="left" mono={false} className="text-ink-muted">{f.name}</Td>
                      <Td className={Math.abs(f.contemporaneous) > 0.4 ? "text-up font-semibold" : ""}>
                        {num(f.contemporaneous, 3)}
                      </Td>
                      <Td className="text-ink-muted">+{f.best_positive_lag}</Td>
                      <Td>{num(f.best_positive_lag_corr, 3)}</Td>
                      <Td className="text-ink-muted">{num(f.ratio, 2)}</Td>
                      <Td>
                        <Badge tone={f.lead_meaningful ? "up" : "neutral"}>
                          {f.lead_meaningful ? "yes" : "no"}
                        </Badge>
                      </Td>
                    </Row>
                  ))}
                </Table>
              </div>
              {d && <Interpretation>{d.interpretation}</Interpretation>}
            </>
          )}
        </Async>
      </Card>

      {/* ------------------------------------------------ distributed lag */}
      <Card
        title="Distributed-lag regression"
        subtitle="ASML returns ~ factor + 5 lags · the same claim, quantified"
        tip="Regressing on the factor and its lags splits the relationship into the part that is simultaneous and the part that could actually be forecast with."
        right={
          <select
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-2 py-1 text-caption mono text-ink"
          >
            {(ccf.data?.factors ?? []).map((f: any) => (
              <option key={f.symbol} value={f.symbol}>{f.symbol}</option>
            ))}
          </select>
        }
      >
        <Async q={dl} skeleton={<ChartSkeleton height={220} />}>
          {(d) => (
            <>
              <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
                <div className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3.5 py-3">
                  <ChartLabel>
                    R² with same-day term
                  </ChartLabel>
                  <div className="mono text-stat font-semibold text-up mt-1">
                    {num(d.r_squared * 100, 1)}%
                  </div>
                  <div className="text-micro text-ink-muted mt-0.5">explains a lot — but not tradeable</div>
                </div>
                <div className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3.5 py-3">
                  <ChartLabel>
                    R² from lags only
                  </ChartLabel>
                  <div className="mono text-stat font-semibold text-down mt-1">
                    {num(d.r_squared_lags_only * 100, 2)}%
                  </div>
                  <div className="text-micro text-ink-muted mt-0.5">
                    all a forecaster could actually use
                  </div>
                </div>
              </div>

              <Chart height={200}>
                <BarChart data={d.coefficients.filter((c: any) => c.lag !== null)}>
                  <Axes dateAxis={false} xKey="name" yTickFormatter={(v) => num(v, 1)} />
                  <ZeroLine />
                  <Tip formatter={(v: number) => [num(v, 4), "coefficient"]} />
                  <Bar dataKey="estimate" radius={[2, 2, 0, 0]}>
                    {d.coefficients
                      .filter((c: any) => c.lag !== null)
                      .map((c: any, i: number) => (
                        <Cell key={i} fill={c.lag === 0 ? C.accent : c.significant ? "var(--ramp-3)" : "var(--ramp-5)"} />
                      ))}
                  </Bar>
                </BarChart>
              </Chart>
              <p className="text-micro text-ink-muted mt-1">
                The amber bar at lag 0 dwarfs every lagged coefficient. That single bar is the
                difference between explaining ASML and predicting it.
              </p>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* ------------------------------------------------------- Granger */}
      <Card
        title="Granger causality"
        subtitle={
          gr.data
            ? `lags 1–${gr.data.max_lag} · Bonferroni-corrected threshold α = ${num(gr.data.alpha_corrected, 3)}`
            : "does adding the factor improve a forecast built from ASML alone?"
        }
        tip="Both series are stationary log returns, which the test requires — running Granger on price levels is the classic misuse and gives spurious results."
      >
        <Async q={gr} skeleton={<ChartSkeleton height={200} />}>
          {(d) => (
            <>
              <Table head={["Factor", "Name", "Best lag", "Min p-value", "Significant"]}>
                {d.results.map((r: any) => (
                  <Row key={r.symbol}>
                    <Td align="left">{r.symbol}</Td>
                    <Td align="left" mono={false} className="text-ink-muted">{r.name}</Td>
                    <Td className="text-ink-muted">{r.best_lag ?? "—"}</Td>
                    <Td>{pval(r.min_pvalue)}</Td>
                    <Td>
                      <Badge tone={r.significant ? "accent" : "neutral"}>
                        {r.significant ? "yes" : "no"}
                      </Badge>
                    </Td>
                  </Row>
                ))}
              </Table>
              <Interpretation>{d.interpretation}</Interpretation>

              <div className="mt-3 bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3.5 py-3">
                <span className="block text-micro uppercase tracking-[0.12em] text-accent font-semibold mb-1.5">
                  Why this does not contradict the section
                </span>
                <p className="text-body leading-[1.65] text-ink-secondary">
                  Several factors <em>are</em> Granger-significant, and that is worth stating plainly
                  rather than hiding. But significance and usefulness are different questions. Across
                  nearly 3,000 observations a test will detect an effect that explains well under one
                  percent of variance — which is exactly what the distributed-lag regression above
                  measures directly. Section 3 already showed what becomes of small in-sample effects
                  when they are taken out of sample: they disappear. The honest summary is that these
                  factors carry a statistically real but economically negligible lead.
                </p>
              </div>
            </>
          )}
        </Async>
      </Card>
    </SectionShell>
  )
}
