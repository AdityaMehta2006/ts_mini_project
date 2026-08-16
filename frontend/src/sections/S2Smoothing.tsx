/**
 * Section 2 — Moving Averages & Exponential Smoothing     (K Suraj Das)
 *
 * The three-model ladder from Lab 5, scored against benchmarks that cost
 * nothing to compute. Monthly only: Holt-Winters needs a seasonal period.
 */

import { useState } from "react"
import { LineChart, Line, BarChart, Bar, Cell, ComposedChart, Area } from "recharts"
import useApiData from "@/hooks/useApiData"
import { useSettings } from "@/context/Settings"
import { getMa, getEts, getCompare } from "@/lib/api"
import { SectionShell, Table, Row, Cell as Td } from "@/components/shell/SectionShell"
import { FreqToggle } from "@/components/shell/FreqToggle"
import {
  Card, StatGrid, StatBox, Interpretation, Badge,
  ChartSkeleton, StatsSkeleton, ChartLabel, Async,
} from "@/components/shell/Primitives"
import { Chart, Axes, Tip, Key, C, SERIES } from "@/components/charts/base"
import { num } from "@/lib/format"

const METHODS = [
  { id: "ses", label: "SES", desc: "level only" },
  { id: "holt", label: "Holt", desc: "level + trend" },
  { id: "hw", label: "Holt-Winters", desc: "level + trend + season" },
] as const

export default function S2Smoothing() {
  const { ticker } = useSettings()
  const [method, setMethod] = useState<"ses" | "holt" | "hw">("hw")

  const ma = useApiData((s) => getMa(ticker, "3,6,12", s), [ticker], "s2-ma")
  const ets = useApiData((s) => getEts(ticker, method, "add", 12, 12, s), [ticker, method], "s2-ets")
  const cmp = useApiData((s) => getCompare(ticker, 12, s), [ticker], "s2-cmp")

  return (
    <SectionShell
      title="Moving Averages & Exponential Smoothing"
      presenter="K Suraj Das"
      source="Lab 5 · MA smoothing, SES / Holt / Holt-Winters, accuracy measures"
      toolbar={
        <FreqToggle
          locked="monthly"
          reason="Holt-Winters needs a defined seasonal period, which daily stock bars do not have. On daily data SES also collapses to alpha ≈ 1 and teaches nothing, so this whole section is fitted on the 140 monthly observations."
        />
      }
      intro={
        <>
          Exponential smoothing weights the past geometrically — recent observations matter most,
          and older ones fade rather than being dropped. The three models form a ladder:{" "}
          <strong className="text-ink font-semibold">SES</strong> tracks a level,{" "}
          <strong className="text-ink font-semibold">Holt</strong> adds a trend, and{" "}
          <strong className="text-ink font-semibold">Holt-Winters</strong> adds a seasonal term.
          Each is fitted on the same training window and scored on the same held-out tail, then
          measured against naive and drift benchmarks. A model that cannot beat "next month equals
          this month" has earned nothing, no matter how sophisticated it looks.
        </>
      }
    >
      {/* ------------------------------------------------------------ MA */}
      <Card
        title="Moving average smoothing"
        subtitle="centred MA(3), MA(6), MA(12) over the monthly log price"
        tip="A centred moving average replaces each point with the average of its neighbours. Short windows follow the data closely and keep the noise; long windows expose the trend but lag turning points and cannot reach the ends of the sample."
      >
        <Async q={ma} skeleton={<ChartSkeleton />}>
          {(d) => (
            <>
              <Chart height={280}>
                <LineChart data={d.series}>
                  <Axes yTickFormatter={(v) => num(v, 1)} />
                  <Tip formatter={(v: number) => num(v, 3)} />
                  <Key />
                  <Line type="monotone" dataKey="observed" stroke={C.muted} strokeWidth={0.9} dot={false} name="Observed" />
                  {[3, 6, 12].map((w, i) => (
                    <Line
                      key={w} type="monotone" dataKey={`ma_${w}`} stroke={SERIES[i]}
                      strokeWidth={1.6} dot={false} name={`MA(${w})`} connectNulls
                    />
                  ))}
                </LineChart>
              </Chart>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* ----------------------------------------------------------- ETS */}
      <Card
        title="Exponential smoothing"
        subtitle="σ̂ fitted on the training window, scored on a 12-month holdout"
        tip="Alpha is the level weight, beta the trend weight, gamma the seasonal weight. Each runs 0 to 1: near 0 means the component is stable and barely updates; near 1 means it is reset to whatever just happened."
        right={
          <div className="inline-flex rounded-[var(--radius-sm)] border border-hairline overflow-hidden">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                title={m.desc}
                className={`px-2.5 py-1 text-caption mono transition-colors ${
                  method === m.id ? "bg-accent-wash text-accent" : "text-ink-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <Async
          q={ets}
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
                <StatBox
                  label="α  level"
                  value={num(d.params.alpha, 3)}
                  tone={d.params.alpha > 0.85 ? "accent" : "neutral"}
                  tip="Weight on the most recent observation when updating the level. Above ~0.85 the model is essentially copying the last value."
                />
                {d.params.beta !== undefined && (
                  <StatBox
                    label="β  trend"
                    value={num(d.params.beta, 3)}
                    tip="Weight on the most recent change when updating the slope. Zero means the trend is treated as fixed for the whole sample."
                  />
                )}
                {d.params.gamma !== undefined && (
                  <StatBox
                    label="γ  season"
                    value={num(d.params.gamma, 3)}
                    tip="Weight on the most recent seasonal deviation. Zero means the model found no seasonal pattern worth updating."
                  />
                )}
                <StatBox label="AIC" value={num(d.aic, 1)} />
                <StatBox
                  label="Holdout MAPE"
                  value={num(d.holdout.errors.mape, 2)}
                  unit="%"
                  tone={d.holdout.beats_naive ? "up" : "down"}
                  hint={`naive ${num(d.holdout.naive_errors.mape, 2)}%`}
                />
              </StatGrid>

              <div className="mt-4">
                <Chart height={280}>
                  <ComposedChart data={d.fitted}>
                    <Axes yTickFormatter={(v) => num(v, 0)} />
                    <Tip formatter={(v: number) => num(v, 2)} />
                    <Key />
                    <Line type="monotone" dataKey="observed" stroke={C.muted} strokeWidth={1} dot={false} name="Observed" />
                    <Line type="monotone" dataKey="fitted" stroke={C.accent} strokeWidth={1.5} dot={false} name="Fitted" />
                  </ComposedChart>
                </Chart>
              </div>

              <div className="mt-4">
                <ChartLabel>
                  12-month forecast with 80% and 95% intervals
                </ChartLabel>
                <Chart height={220}>
                  <ComposedChart data={d.forecast}>
                    <Axes yTickFormatter={(v) => num(v, 0)} />
                    <Tip formatter={(v: number) => num(v, 2)} />
                    <Area dataKey="hi95" stroke="none" fill={C.accent} fillOpacity={0.10} name="95%" />
                    <Area dataKey="lo95" stroke="none" fill="var(--surface)" fillOpacity={1} legendType="none" />
                    <Line type="monotone" dataKey="mean" stroke={C.accent} strokeWidth={1.8} dot={false} name="Forecast" />
                  </ComposedChart>
                </Chart>
              </div>
              <Interpretation>{d.interpretation}</Interpretation>
            </>
          )}
        </Async>
      </Card>

      {/* ------------------------------------------------------- compare */}
      <Card
        title="Model comparison"
        subtitle="every smoother against every benchmark on one 12-month holdout"
        tip="MASE divides the forecast error by the in-sample one-step naive error. At a 12-step horizon values well above 1 are normal — what matters is the ranking and the gap to the same-horizon naive row."
      >
        <Async q={cmp} skeleton={<ChartSkeleton height={200} />}>
          {(d) => (
            <>
              <Table head={["Model", "Type", "α", "MAE", "RMSE", "MAPE %", "MASE", "vs naive"]}>
                {d.models.map((m: any) => (
                  <Row key={m.name} highlight={m.name === d.best_by_mase}>
                    <Td align="left" mono={false} className="text-ink">{m.name}</Td>
                    <Td align="left" className="text-ink-muted text-caption">{m.kind}</Td>
                    <Td>{m.alpha === null || m.alpha === undefined ? "—" : num(m.alpha, 3)}</Td>
                    <Td>{num(m.mae, 2)}</Td>
                    <Td>{num(m.rmse, 2)}</Td>
                    <Td>{num(m.mape, 2)}</Td>
                    <Td className="font-semibold">{num(m.mase, 3)}</Td>
                    <Td>
                      <Badge tone={m.beats_naive ? "up" : "neutral"}>
                        {m.beats_naive ? "better" : "worse"}
                      </Badge>
                    </Td>
                  </Row>
                ))}
              </Table>

              <div className="mt-4">
                <ChartLabel>
                  MASE by model · lower is better
                </ChartLabel>
                <Chart height={200}>
                  <BarChart data={d.models.filter((m: any) => m.mase !== null)}>
                    <Axes dateAxis={false} xKey="name" yTickFormatter={(v) => num(v, 0)} />
                    <Tip formatter={(v: number) => [num(v, 3), "MASE"]} />
                    <Bar dataKey="mase" radius={[2, 2, 0, 0]}>
                      {d.models
                        .filter((m: any) => m.mase !== null)
                        .map((m: any, i: number) => (
                          <Cell key={i} fill={m.kind === "benchmark" ? "var(--ramp-4)" : C.accent} />
                        ))}
                    </Bar>
                  </BarChart>
                </Chart>
                <p className="text-micro text-ink-muted mt-1">
                  Grey bars are benchmarks. A model bar that fails to clear them has added complexity
                  without adding accuracy.
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
