/**
 * Section 3 — ARIMA / Box-Jenkins & Forecast Evaluation     (Akash Kumar)
 *
 * The full loop: identify, estimate, diagnose, forecast, then check the
 * forecast honestly against benchmarks over many origins.
 */

import { useState, useEffect } from "react"
import {
  LineChart, Line, ComposedChart, Area, BarChart, Bar, Cell,
  ScatterChart, Scatter, ReferenceLine,
} from "recharts"
import { AlertTriangle } from "lucide-react"
import useApiData from "@/hooks/useApiData"
import { useSettings } from "@/context/Settings"
import { getArimaGrid, getArimaFit, getArimaDiagnostics, getBacktest } from "@/lib/api"
import { SectionShell, Table, Row, Cell as Td } from "@/components/shell/SectionShell"
import { FreqToggle } from "@/components/shell/FreqToggle"
import {
  Card, StatGrid, StatBox, Interpretation, Badge,
  ChartSkeleton, StatsSkeleton, ChartLabel, Async,
} from "@/components/shell/Primitives"
import { Chart, Axes, Tip, Key, C, Band, ZeroLine, SERIES } from "@/components/charts/base"
import { num, pval, dayDate } from "@/lib/format"

export default function S3Arima() {
  const { ticker, freq } = useSettings()
  const [order, setOrder] = useState<[number, number, number]>([1, 1, 3])

  const grid = useApiData((s) => getArimaGrid(ticker, freq, s), [ticker, freq], "s3-grid")

  // Follow whatever the grid selected, so the fit below is always the model
  // the selection step actually chose rather than a hardcoded guess.
  useEffect(() => {
    const b = grid.data?.best
    if (b) setOrder([b.p, b.d, b.q])
  }, [grid.data])

  const [p, d, q] = order
  const fit = useApiData((s) => getArimaFit(ticker, freq, p, d, q, 30, s), [ticker, freq, p, d, q], "s3-fit")
  const dg = useApiData((s) => getArimaDiagnostics(ticker, freq, p, d, q, s), [ticker, freq, p, d, q], "s3-dg")
  const bt = useApiData((s) => getBacktest(ticker, "1,3,6", s), [ticker], "s3-bt")

  return (
    <SectionShell
      title="ARIMA & Forecast Evaluation"
      presenter="Akash Kumar"
      source="Labs 7–9 · Box–Jenkins, auto.arima, checkresiduals, holdout accuracy"
      toolbar={<FreqToggle />}
      intro={
        <>
          Box–Jenkins is a loop, not a formula:{" "}
          <strong className="text-ink font-semibold">identify</strong> a candidate order from
          Section 1's correlograms, <strong className="text-ink font-semibold">estimate</strong> it,{" "}
          <strong className="text-ink font-semibold">diagnose</strong> the residuals, and only then{" "}
          <strong className="text-ink font-semibold">forecast</strong>. Since <code>pmdarima</code>{" "}
          is unavailable on NumPy 2, the search below is an explicit AIC grid — which is what{" "}
          <code>auto.arima</code> does internally, and easier to defend because every candidate is
          visible. The final subsection is the one that matters: a model that looks good in-sample
          has proved nothing until it is tested out of sample.
        </>
      }
    >
      {/* ---------------------------------------------------------- grid */}
      <Card
        title="Order selection by AIC"
        subtitle={`d = 1 fixed by Section 1's ADF/KPSS result · ${grid.data?.n_fitted ?? 16} orders fitted`}
        tip="AIC balances fit against parameter count. Differences under about 2 units are not meaningful; a model 10+ units worse is clearly rejected."
      >
        <Async q={grid} skeleton={<ChartSkeleton height={220} />}>
          {(d) => (
            <>
              <Chart height={230}>
                <BarChart data={d.candidates.map((c: any) => ({ ...c, label: `(${c.p},${c.d},${c.q})` }))}>
                  <Axes dateAxis={false} xKey="label" yTickFormatter={(v) => num(v, 1)} />
                  <Tip formatter={(v: number) => [num(v, 2), "ΔAIC"]} />
                  {/* The winner's ΔAIC is 0 by definition, so its bar has no
                      height and the amber the caption promises never renders.
                      minPointSize gives it a stub on the axis — still honest
                      about the value, and visible. */}
                  <Bar dataKey="delta_aic" radius={[2, 2, 0, 0]} minPointSize={3}>
                    {d.candidates.map((c: any, i: number) => (
                      <Cell
                        key={i}
                        fill={c.p === 0 && c.q === 0 ? C.down : c.delta_aic === 0 ? C.accent : "var(--ramp-4)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </Chart>
              <p className="text-micro text-ink-muted mt-1">
                Every bar is AIC units <em>worse</em> than the best order, so the selected order is
                the amber stub sitting at zero on the left. Red is ARIMA(0,1,0), the pure random
                walk — its height is how much worse doing nothing would be.
              </p>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* ----------------------------------------------------------- fit */}
      <Card
        title={`ARIMA(${p},${d},${q}) estimates`}
        subtitle="coefficients, characteristic roots and stability"
        tip="A stationary AR process has every characteristic root outside the unit circle (modulus > 1). This is the polyroot check from Lab 6."
      >
        <Async
          q={fit}
          skeleton={
            <>
              <StatsSkeleton n={4} />
              <div className="mt-3"><ChartSkeleton /></div>
            </>
          }
        >
          {(d) => (
            <>
              <StatGrid>
                <StatBox label="AIC" value={num(d.aic, 1)} />
                <StatBox label="BIC" value={num(d.bic, 1)} />
                <StatBox label="Log-likelihood" value={num(d.loglik, 1)} />
                <StatBox label="σ²" value={num(d.sigma2, 6)} tip="Residual variance — the model's estimate of one-period noise." />
                <StatBox
                  label="Stable"
                  value={d.is_stationary ? "yes" : "no"}
                  tone={d.is_stationary ? "up" : "down"}
                  hint="all roots outside unit circle"
                />
              </StatGrid>

              <div className="mt-4">
                <Table head={["Coefficient", "Estimate", "Std. error", "z", "p-value", ""]}>
                  {d.coefficients.map((c: any) => (
                    <Row key={c.name}>
                      <Td align="left">{c.name}</Td>
                      <Td>{num(c.estimate, 4)}</Td>
                      <Td>{num(c.std_err, 4)}</Td>
                      <Td>{num(c.z, 2)}</Td>
                      <Td>{pval(c.pvalue)}</Td>
                      <Td>
                        <Badge tone={c.significant ? "accent" : "neutral"}>
                          {c.significant ? "significant" : "not significant"}
                        </Badge>
                      </Td>
                    </Row>
                  ))}
                </Table>
              </div>

              <div className="mt-4">
                <ChartLabel>
                  {d.h}-step forecast with 80% and 95% intervals
                </ChartLabel>
                <Chart height={240}>
                  <ComposedChart data={d.forecast}>
                    <Axes xTickFormatter={dayDate} yTickFormatter={(v) => num(v, 0)} />
                    <Tip formatter={(v: number) => num(v, 2)} />
                    <Key />
                    <Area dataKey="hi95" stroke="none" fill={C.accent} fillOpacity={0.09} name="95% interval" />
                    <Area dataKey="hi80" stroke="none" fill={C.accent} fillOpacity={0.10} name="80% interval" />
                    <Area dataKey="lo80" stroke="none" fill="var(--surface)" fillOpacity={1} legendType="none" />
                    <Area dataKey="lo95" stroke="none" fill="var(--surface)" fillOpacity={0} legendType="none" />
                    <Line type="monotone" dataKey="mean" stroke={C.accent} strokeWidth={2} dot={false} name="Point forecast" />
                  </ComposedChart>
                </Chart>
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* --------------------------------------------------- diagnostics */}
      <Card
        title="Residual diagnostics"
        subtitle="checkresiduals: Ljung-Box, Jarque-Bera, ARCH-LM"
        tip="A well-specified model leaves residuals that are white noise, normally distributed and constant in variance. Each test checks one of those three claims."
      >
        <Async q={dg} skeleton={<ChartSkeleton height={300} />}>
          {(d) => (
            <>
              {/* The methodological centrepiece — surfaced, not buried. */}
              <div className="bg-sunk border border-accent/40 rounded-[var(--radius-sm)] p-3.5 mb-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={15} className="text-accent shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-ink mb-1">
                      Burn-in residuals excluded ({d.burn_in.dropped})
                    </p>
                    <p className="text-body leading-[1.6] text-ink-secondary">
                      {d.burn_in.note}
                    </p>
                    <div className="flex gap-4 mt-2.5 flex-wrap">
                      <span className="text-caption mono text-ink-muted">
                        LB p kept:{" "}
                        <span className="text-down font-semibold">
                          {num(d.burn_in.ljung_box_p_if_kept, 4)}
                        </span>
                      </span>
                      <span className="text-caption mono text-ink-muted">
                        LB p trimmed:{" "}
                        <span className="text-up font-semibold">
                          {pval(d.burn_in.ljung_box_p_after_trim)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <StatGrid>
                <StatBox
                  label="Ljung-Box (10)"
                  value={pval(d.ljung_box.find((l: any) => l.lag === 10)?.pvalue)}
                  tone={d.verdict.white_noise ? "up" : "down"}
                  hint={d.verdict.white_noise ? "white noise" : "autocorrelation left"}
                  tip="Tests whether residual autocorrelations are jointly zero. p < 0.05 means structure remains."
                />
                <StatBox
                  label="Jarque-Bera"
                  value={pval(d.jarque_bera.pvalue)}
                  tone={d.verdict.normal ? "up" : "down"}
                  hint={`kurtosis ${num(d.jarque_bera.kurtosis, 2)}`}
                  tip="Tests normality using skewness and kurtosis. p < 0.05 rejects the normal distribution."
                />
                <StatBox
                  label="ARCH-LM (10)"
                  value={pval(d.arch_lm.pvalue)}
                  tone={d.verdict.homoskedastic ? "up" : "down"}
                  hint={d.verdict.homoskedastic ? "constant variance" : "variance clusters"}
                  tip="Tests whether squared residuals are autocorrelated. p < 0.05 means volatility clustering — the direct motivation for Section 4."
                />
                <StatBox
                  label="LB on squared"
                  value={pval(d.ljung_box_squared.pvalue)}
                  tone={d.ljung_box_squared.pvalue >= 0.05 ? "up" : "down"}
                  hint="variance memory"
                />
              </StatGrid>

              <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
                <div>
                  <ChartLabel>Residuals</ChartLabel>
                  <Chart height={170}>
                    <LineChart data={d.resid}>
                      <Axes yTickFormatter={(v) => num(v, 2)} />
                      <ZeroLine />
                      <Tip formatter={(v: number) => [num(v, 4), "residual"]} />
                      <Line type="linear" dataKey="resid" stroke={C.accent} strokeWidth={0.6} dot={false} />
                    </LineChart>
                  </Chart>
                </div>
                <div>
                  <ChartLabel>Residual ACF</ChartLabel>
                  <Chart height={170}>
                    <ComposedChart data={d.resid_acf}>
                      <Axes dateAxis={false} xKey="lag" yDomain={[-0.1, 0.1]} yTickFormatter={(v) => v.toFixed(2)} />
                      <Band upper={d.resid_acf[0].upper} lower={d.resid_acf[0].lower} />
                      <Tip formatter={(v: number) => [num(v, 4), "ACF"]} labelFormatter={(l: any) => `lag ${l}`} />
                      <Bar dataKey="value" barSize={4}>
                        {d.resid_acf.map((r: any, i: number) => (
                          <Cell key={i} fill={r.significant ? C.down : "var(--ramp-5)"} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </Chart>
                </div>
                <div>
                  <ChartLabel>
                    Normal Q–Q · curvature at the ends means fat tails
                  </ChartLabel>
                  <Chart height={170}>
                    <ScatterChart>
                      <Axes dateAxis={false} xKey="theoretical" yTickFormatter={(v) => num(v, 0)} />
                      <ReferenceLine
                        segment={[{ x: -4, y: -4 }, { x: 4, y: 4 }]}
                        stroke={C.muted}
                        strokeDasharray="3 3"
                      />
                      <Tip formatter={(v: number) => num(v, 2)} />
                      <Scatter data={d.qq} dataKey="sample" fill={C.accent} fillOpacity={0.5} shape="circle" />
                    </ScatterChart>
                  </Chart>
                </div>
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* ------------------------------------------------------ backtest */}
      <Card
        title="Rolling-origin backtest"
        subtitle="expanding window · refit at every origin · Diebold–Mariano vs naive"
        tip="A single holdout is one draw and can flatter a model by luck. This refits at every origin and scores each model at each horizon over all of them."
      >
        <Async q={bt} skeleton={<ChartSkeleton height={260} />}>
          {(d) => (
            <>
              <StatGrid>
                <StatBox label="Origins" value={num(d.n_origins, 0)} hint="refits" />
                <StatBox label="Min train" value={num(d.min_train, 0)} unit="mo" />
                <StatBox
                  label="Beats naive"
                  value={d.significant_vs_naive.length === 0 ? "none" : String(d.significant_vs_naive.length)}
                  tone={d.significant_vs_naive.length === 0 ? "down" : "up"}
                  hint="at p < 0.05"
                  tip="How many model/horizon combinations beat the naive forecast by a statistically significant margin."
                />
                <StatBox
                  label="PI coverage"
                  value={num(d.results.find((r: any) => r.pi_coverage_95)?.pi_coverage_95, 1)}
                  unit="%"
                  tone="down"
                  hint="nominal 95%"
                  tip="How often the 95% interval actually contained the truth. Below 95% means the intervals are too narrow and the model understates risk."
                />
              </StatGrid>

              <div className="mt-4">
                <Table head={["Model", "h", "n", "MAE", "RMSE", "MAPE %", "MASE", "DM p vs naive", "PI cov %"]}>
                  {d.results.map((r: any, i: number) => (
                    <Row key={i} highlight={r.model === d.winner_by_horizon[String(r.h)]}>
                      <Td align="left" mono={false} className="text-ink">{r.model}</Td>
                      <Td>{r.h}</Td>
                      <Td className="text-ink-muted">{r.n}</Td>
                      <Td>{num(r.mae, 2)}</Td>
                      <Td>{num(r.rmse, 2)}</Td>
                      <Td>{num(r.mape, 2)}</Td>
                      <Td className="font-semibold">{num(r.mase, 3)}</Td>
                      <Td>
                        {r.dm_pvalue_vs_naive === undefined ? (
                          <span className="text-ink-muted">baseline</span>
                        ) : (
                          <span className={r.sig_vs_naive ? "text-up" : "text-ink-muted"}>
                            {pval(r.dm_pvalue_vs_naive)}
                          </span>
                        )}
                      </Td>
                      <Td>{r.pi_coverage_95 ? num(r.pi_coverage_95, 1) : "—"}</Td>
                    </Row>
                  ))}
                </Table>
              </div>

              <div className="mt-4">
                <ChartLabel>
                  MASE by horizon · lines that overlap are models that cannot be told apart
                </ChartLabel>
                <Chart height={210}>
                  <LineChart
                    data={d.horizons.map((h: number) => {
                      const row: any = { h }
                      for (const r of d.results) if (r.h === h) row[r.model] = r.mase
                      return row
                    })}
                  >
                    <Axes dateAxis={false} xKey="h" yTickFormatter={(v) => num(v, 0)} />
                    <Tip formatter={(v: number) => num(v, 3)} labelFormatter={(l: any) => `horizon ${l}`} />
                    <Key />
                    {["ARIMA", "Holt", "Drift", "Naive"].map((m, i) => (
                      <Line
                        key={m} type="monotone" dataKey={m}
                        stroke={m === "Naive" ? C.down : SERIES[i]}
                        strokeWidth={m === "Naive" ? 2 : 1.5}
                        strokeDasharray={m === "Naive" ? "4 3" : undefined}
                        dot={{ r: 3 }} name={m}
                      />
                    ))}
                  </LineChart>
                </Chart>
                <p className="text-micro text-ink-muted mt-1">
                  The dashed red line is the naive benchmark. A model only wins if it sits clearly
                  below it <em>and</em> its Diebold–Mariano p-value is under 0.05.
                </p>
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>
    </SectionShell>
  )
}
