/**
 * Section 4 — Volatility & Black-Scholes     (Ritesh KR)   [BEYOND SYLLABUS]
 *
 * Section 3 left two loose ends: ARCH-LM rejected constant variance, and the
 * prediction intervals covered ~80% instead of 95%. Both say the variance
 * moves. This section models it and then puts a price on it.
 */

import { useState } from "react"
import { LineChart, Line, ComposedChart, Area, ScatterChart, Scatter } from "recharts"
import useApiData from "@/hooks/useApiData"
import { useSettings } from "@/context/Settings"
import { getGarch, getOptions } from "@/lib/api"
import { SectionShell, Grid, Table, Row, Cell as Td } from "@/components/shell/SectionShell"
import { FreqToggle } from "@/components/shell/FreqToggle"
import {
  Card, StatGrid, StatBox, Interpretation, Badge,
  ChartSkeleton, StatsSkeleton, ChartLabel, Async,
} from "@/components/shell/Primitives"
import { Chart, Axes, Tip, Key, C } from "@/components/charts/base"
import { num, pct, pval } from "@/lib/format"

export default function S4Options() {
  const { ticker } = useSettings()
  const [expiryIdx, setExpiryIdx] = useState(4)

  const g = useApiData((s) => getGarch(ticker, s), [ticker], "s4-garch")
  const o = useApiData((s) => getOptions(ticker, expiryIdx, s), [ticker, expiryIdx], "s4-opt")

  return (
    <SectionShell
      title="Volatility & Black–Scholes"
      presenter="Ritesh KR"
      source="Extension · GARCH(1,1), option pricing, implied volatility"
      beyond
      toolbar={
        <FreqToggle
          locked="daily"
          reason="Volatility clustering is a daily-frequency phenomenon. Monthly returns average it away, and the GARCH parameters become meaningless."
        />
      }
      intro={
        <>
          Section 3 ended with two failures pointing the same way: ARCH-LM rejected constant
          variance, and the ARIMA prediction intervals covered only about 80% of outcomes instead
          of the promised 95%. Both mean the same thing — the variance{" "}
          <strong className="text-ink font-semibold">moves</strong>, and a model that averages calm
          and turbulent periods together will understate risk exactly when it matters.{" "}
          <strong className="text-ink font-semibold">GARCH(1,1)</strong> lets today's expected
          variance depend on yesterday's shock and yesterday's variance.{" "}
          <strong className="text-ink font-semibold">Black–Scholes</strong> then converts a
          volatility number into an option price — the point where a volatility forecast can be
          checked against a live market rather than against itself.
        </>
      }
    >
      {/* --------------------------------------------------------- GARCH */}
      <Async q={g} skeleton={<StatsSkeleton n={5} />}>
        {(d) => (
          <>
            <StatGrid>
              <StatBox
                label="Persistence α+β"
                value={num(d.persistence, 4)}
                tone="accent"
                tip="How slowly volatility shocks decay. Close to 1 means today's turbulence is still being felt weeks later. Above 1 the process would be explosive."
              />
              <StatBox
                label="Half-life"
                value={num(d.half_life_days, 0)}
                unit="d"
                hint="shock decay"
                tip="Trading days for a volatility shock to fade to half its size."
              />
              <StatBox
                label="Current vol"
                value={num(d.current_vol_annual_pct, 1)}
                unit="%"
                tone="up"
                hint="annualised"
              />
              <StatBox
                label="Long-run vol"
                value={num(d.long_run_vol_annual_pct, 1)}
                unit="%"
                hint="unconditional"
                tip="The level the process reverts to over time: sqrt(omega / (1 - alpha - beta))."
              />
              <StatBox
                label="ARCH absorbed"
                value={d.arch_removed.clean ? "yes" : "no"}
                tone={d.arch_removed.clean ? "up" : "down"}
                hint={`LB p ${num(d.arch_removed.ljung_box_sq_std_resid_p, 3)}`}
                tip="Ljung-Box on squared standardised residuals. p above 0.05 means the model has absorbed the volatility clustering and left nothing behind."
              />
            </StatGrid>
          </>
        )}
      </Async>

      <Card
        title="Conditional volatility"
        subtitle="σₜ² = ω + α·ε²ₜ₋₁ + β·σ²ₜ₋₁ · annualised"
        tip="Each point is the model's estimate of volatility on that day, conditional on everything before it. The spikes are the crises — they find themselves without being labelled."
      >
        <Async q={g} skeleton={<ChartSkeleton />}>
          {(d) => (
            <>
              <Chart height={260}>
                <ComposedChart data={d.conditional_volatility ?? []}>
                  <defs>
                    <linearGradient id="g-vol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Axes yTickFormatter={(v) => num(v, 0) + "%"} />
                  <Tip formatter={(v: number) => [pct(v, 1), "annualised vol"]} />
                  <Area type="monotone" dataKey="annualised" stroke={C.accent} strokeWidth={1.2} fill="url(#g-vol)" />
                </ComposedChart>
              </Chart>
              {d && (
                <div className="mt-3">
                  <Table head={["Parameter", "Estimate", "p-value", ""]}>
                    {Object.entries(d.parameters).map(([k, v]: [string, any]) => (
                      <Row key={k}>
                        <Td align="left">{k}</Td>
                        <Td>{num(v.value, 4)}</Td>
                        <Td>{pval(v.pvalue)}</Td>
                        <Td>
                          <Badge tone={v.significant ? "accent" : "neutral"}>
                            {v.significant ? "significant" : "not significant"}
                          </Badge>
                        </Td>
                      </Row>
                    ))}
                  </Table>
                </div>
              )}
              {d && <Interpretation>{d.interpretation}</Interpretation>}
            </>
          )}
        </Async>
      </Card>

      {/* ------------------------------------------------- Black-Scholes */}
      <Card
        title="Black–Scholes vs the live market"
        subtitle={
          o.data
            ? `${o.data.n_contracts} calls expiring ${o.data.expiry} · spot ${num(o.data.spot, 2)} · r ${num(o.data.risk_free_pct, 2)}%`
            : "pricing the live option chain"
        }
        tip="C = S·N(d₁) − K·e^(−rT)·N(d₂). We feed in the GARCH volatility and compare the resulting price against the market's bid-ask midpoint."
        right={
          o.data && (
            <select
              value={expiryIdx}
              onChange={(e) => setExpiryIdx(Number(e.target.value))}
              className="bg-sunk border border-hairline rounded-[var(--radius-sm)] px-2 py-1 text-caption mono text-ink"
            >
              {o.data.expiries.map((e: string, i: number) => (
                <option key={e} value={i}>{e}</option>
              ))}
            </select>
          )
        }
      >
        <Async
          q={o}
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
                <StatBox label="Days to expiry" value={num(d.days_to_expiry, 0)} unit="d" />
                <StatBox
                  label="GARCH vol"
                  value={num(d.garch_vol_pct, 1)}
                  unit="%"
                  hint="backward-looking"
                  tip="Volatility estimated from what the stock has actually done."
                />
                <StatBox
                  label="Market implied vol"
                  value={num(d.mean_implied_vol_pct, 1)}
                  unit="%"
                  tone="accent"
                  hint="forward-looking"
                  tip="Volatility backed out of traded option prices — what the market expects, not what has happened."
                />
                <StatBox
                  label="Gap"
                  value={num(d.vol_gap_pct, 1)}
                  unit="pts"
                  tone={d.vol_gap_pct > 0 ? "up" : "down"}
                  hint="implied − GARCH"
                  tip="A positive gap is the variance risk premium: traders pay more for protection than history alone justifies."
                />
              </StatGrid>

              <Grid>
                <div className="mt-4">
                  <ChartLabel>
                    Model price vs market mid
                  </ChartLabel>
                  <Chart height={230}>
                    <LineChart data={d.contracts}>
                      <Axes dateAxis={false} xKey="strike" yTickFormatter={(v) => num(v, 0)} />
                      <Tip formatter={(v: number) => num(v, 2)} labelFormatter={(l: any) => `strike ${l}`} />
                      <Key />
                      <Line type="monotone" dataKey="market_mid" stroke={C.muted} strokeWidth={1.6} dot={false} name="Market mid" />
                      <Line type="monotone" dataKey="bs_price" stroke={C.accent} strokeWidth={1.6} dot={false} name="Black–Scholes" />
                    </LineChart>
                  </Chart>
                </div>

                <div className="mt-4">
                  <ChartLabel>
                    Implied volatility smile · Black–Scholes assumes this is flat
                  </ChartLabel>
                  <Chart height={230}>
                    <ScatterChart>
                      <Axes dateAxis={false} xKey="moneyness" yTickFormatter={(v) => num(v, 0) + "%"} />
                      <Tip formatter={(v: number) => pct(v, 1)} labelFormatter={(l: any) => `K/S ${l}`} />
                      <Scatter data={d.smile} dataKey="implied_vol_pct" fill={C.accent} shape="circle" />
                    </ScatterChart>
                  </Chart>
                  <p className="text-micro text-ink-muted mt-1">
                    A flat line would mean Black–Scholes holds. The curve is the market pricing fat
                    tails the model does not have.
                  </p>
                </div>
              </Grid>

              <div className="mt-4">
                <Table head={["Strike", "K/S", "Market mid", "BS price", "Diff", "Diff %", "IV %", "Δ", "Γ", "Vega"]}>
                  {d.contracts
                    .filter((_: any, i: number) => i % Math.max(1, Math.ceil(d.contracts.length / 18)) === 0)
                    .map((c: any) => (
                      <Row key={c.strike} highlight={Math.abs(c.moneyness - 1) < 0.01}>
                        <Td>{num(c.strike, 0)}</Td>
                        <Td className="text-ink-muted">{num(c.moneyness, 3)}</Td>
                        <Td>{num(c.market_mid, 2)}</Td>
                        <Td>{num(c.bs_price, 2)}</Td>
                        <Td className={c.diff > 0 ? "text-up" : "text-down"}>{num(c.diff, 2)}</Td>
                        <Td className={c.diff > 0 ? "text-up" : "text-down"}>{num(c.diff_pct, 1)}</Td>
                        <Td>{num(c.implied_vol_pct, 1)}</Td>
                        <Td>{num(c.delta, 3)}</Td>
                        <Td>{num(c.gamma, 5)}</Td>
                        <Td>{num(c.vega, 2)}</Td>
                      </Row>
                    ))}
                </Table>
                <p className="text-micro text-ink-muted mt-1.5">
                  Highlighted row is at the money. Δ is the change in option price per $1 of stock,
                  Γ the change in Δ, Vega the change per 1 point of volatility.
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
