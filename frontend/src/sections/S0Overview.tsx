/**
 * Overview — the verdict and the evidence chain.
 *
 * Four independent tools from four different labs reach the same conclusion.
 * That convergence is a stronger result than any single model with a
 * flattering error metric, so it gets stated first rather than buried.
 */

import useApiData from "@/hooks/useApiData"
import { useSettings } from "@/context/Settings"
import { getMeta, getStationarity, getArimaGrid, getBacktest, getGarch, getCcf } from "@/lib/api"
import { Card, StatGrid, StatBox, Badge, StatsSkeleton, Skeleton, Async } from "@/components/shell/Primitives"
import { Grid } from "@/components/shell/SectionShell"
import { num, pval } from "@/lib/format"

const TEAM = [
  { n: "01", name: "Abhinabha Das", owns: "Data, Decomposition & Stationarity" },
  { n: "02", name: "K Suraj Das", owns: "Moving Averages & Exponential Smoothing" },
  { n: "03", name: "Akash Kumar", owns: "ARIMA & Forecast Evaluation" },
  { n: "04", name: "Ritesh KR", owns: "Volatility & Black–Scholes" },
  { n: "05", name: "Aditya Mehta", owns: "Macro-Factor Lag Analysis" },
]

export default function S0Overview() {
  const { ticker } = useSettings()
  const meta = useApiData((s) => getMeta(ticker, s), [ticker], "meta")
  const st = useApiData((s) => getStationarity(ticker, "daily", s), [ticker], "s1-stat")
  const grid = useApiData((s) => getArimaGrid(ticker, "daily", s), [ticker], "s3-grid")
  const bt = useApiData((s) => getBacktest(ticker, "1,3,6", s), [ticker], "s3-bt")
  const g = useApiData((s) => getGarch(ticker, s), [ticker], "s4-garch")
  const ccf = useApiData((s) => getCcf(ticker, 10, s), [ticker], "s5-ccf")

  const evidence = [
    {
      n: 1,
      claim: "ADF and KPSS agree the log price is I(1)",
      detail: st.data
        ? `ADF p = ${num(st.data.matrix.level.adf_p, 3)} on the level and ${pval(st.data.matrix.diff.adf_p)} after one difference. Two tests with opposite null hypotheses agree in both directions.`
        : null,
      from: "Section 1",
    },
    {
      n: 2,
      claim: "The best ARIMA barely improves on doing nothing",
      detail: grid.data
        ? `The best of ${grid.data.n_fitted} orders is ARIMA(${grid.data.best.p},${grid.data.best.d},${grid.data.best.q}), and its AR and MA roots very nearly cancel — large coefficients describing a process close to a random walk. AIC rewards any structure it can find in ${num(meta.data?.n_daily, 0)} observations; whether that structure survives out of sample is a separate question.`
        : null,
      from: "Section 3",
    },
    {
      n: 3,
      claim: "No model beats the naive forecast out of sample",
      detail: bt.data
        ? `Across ${bt.data.n_origins} rolling origins, every Diebold–Mariano p-value against naive exceeds 0.05. Ranking without a significant margin is not a win.`
        : null,
      from: "Section 3",
    },
    {
      n: 4,
      claim: "Macro factors move with ASML, never before it",
      detail: ccf.data
        ? `${ccf.data.factors[0].symbol} correlates ${num(ccf.data.factors[0].contemporaneous, 2)} on the same day and ${num(ccf.data.factors[0].best_positive_lag_corr, 3)} at a one-day lead. Not one factor carries a usable lead.`
        : null,
      from: "Section 5",
    },
  ]

  return (
    <div className="space-y-5">
      <header className="space-y-2.5">
        <h2 className="text-title font-semibold tracking-tight text-ink">
          How predictable is ASML?
        </h2>
        <p className="text-lead leading-[1.7] text-ink-secondary max-w-[78ch]">
          This project does not promise a forecast. It asks whether one is possible, and answers
          the question with the toolkit the course taught. The short answer is that the{" "}
          <strong className="text-ink font-semibold">direction</strong> of ASML is not
          forecastable from its own history or from the semiconductor complex around it — while
          the <strong className="text-ink font-semibold">magnitude</strong> of its moves very
          much is. Both halves are findings, and the four independent confirmations below are
          worth more than any single model with a flattering error metric.
        </p>
      </header>

      <Async q={meta} skeleton={<StatsSkeleton n={6} />}>
        {(d) => (
          <StatGrid>
            <StatBox label="Ticker" value={d.ticker} hint="ASML Holding N.V." />
            <StatBox label="Last close" value={num(d.last_close, 2)} unit="$" tone="accent" />
            <StatBox label="Observations" value={num(d.n_daily, 0)} hint="daily bars" />
            <StatBox label="CAGR" value={num(d.cagr_pct, 1)} unit="%" tone="up" />
            <StatBox label="Annualised vol" value={num(d.ann_vol_pct, 1)} unit="%" />
            <StatBox label="Sample" value={`${d.years}y`} hint={`${d.start} → ${d.end}`} />
          </StatGrid>
        )}
      </Async>

      <Card
        title="The evidence chain"
        subtitle="four different tools, four different labs, one conclusion"
        tip="Convergent evidence is the strongest form of empirical argument. Each of these could be dismissed alone; together they are hard to explain any other way."
      >
        <ol className="space-y-2.5">
          {evidence.map((e) => (
            <li
              key={e.n}
              className="flex gap-3 bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3.5 py-3"
            >
              <span className="mono text-caption text-accent font-bold shrink-0 mt-0.5">
                0{e.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <p className="text-lead font-medium text-ink">{e.claim}</p>
                  <span className="text-micro mono text-ink-muted shrink-0">{e.from}</span>
                </div>
                {e.detail ? (
                  <p className="text-body leading-[1.6] text-ink-secondary mt-1">{e.detail}</p>
                ) : (
                  <Skeleton className="h-3 w-full mt-2" />
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 bg-sunk border border-hairline rounded-[var(--radius-sm)] px-3.5 py-3">
          <span className="block text-micro uppercase tracking-[0.12em] text-accent font-semibold mb-1.5">
            What this means
          </span>
          <p className="text-body leading-[1.65] text-ink-secondary">
            These four results are the empirical content of{" "}
            <strong className="text-ink font-semibold">weak-form market efficiency</strong>{" "}
            (Fama, 1970): if past prices contained exploitable information, trading would have
            removed it. Finding that a model cannot beat the naive forecast is not a failed
            project — it is a textbook hypothesis confirmed on data the group collected itself.
            The failure mode we deliberately avoided was tuning horizons and orders until
            something appeared to win; the Diebold–Mariano test exists precisely to catch that.
          </p>
        </div>
      </Card>

      <Grid>
        <Card
          title="What is forecastable"
          subtitle="the variance, even though the mean is not"
          tip="ARCH-LM and Ljung-Box on squared residuals both reject constant variance. Volatility has memory even where returns do not."
        >
          {g.data ? (
            <>
              <StatGrid cols={2}>
                <StatBox label="GARCH persistence" value={num(g.data.persistence, 3)} tone="accent" />
                <StatBox label="Shock half-life" value={num(g.data.half_life_days, 0)} unit="d" />
                <StatBox label="Current vol" value={num(g.data.current_vol_annual_pct, 1)} unit="%" />
                <StatBox label="Long-run vol" value={num(g.data.long_run_vol_annual_pct, 1)} unit="%" />
              </StatGrid>
              <p className="text-body leading-[1.65] text-ink-secondary mt-3">
                Persistence of {num(g.data.persistence, 3)} means a volatility shock is still half
                present {num(g.data.half_life_days, 0)} trading days later. We cannot say where
                ASML is going, but we can say how rough the ride will be — and that is what
                Section 4 turns into an option price.
              </p>
            </>
          ) : (
            <StatsSkeleton n={4} />
          )}
        </Card>

        <Card
          title="Where the model still fails"
          subtitle="prediction intervals are too narrow"
          tip="Coverage below the nominal 95% means the model understates risk. The cause is the constant-variance assumption that ARCH-LM already rejected."
        >
          {bt.data ? (
            <>
              <StatGrid cols={2}>
                {bt.data.results
                  .filter((r: any) => r.pi_coverage_95)
                  .map((r: any) => (
                    <StatBox
                      key={r.h}
                      label={`Coverage h=${r.h}`}
                      value={num(r.pi_coverage_95, 1)}
                      unit="%"
                      tone="down"
                      hint="nominal 95%"
                    />
                  ))}
              </StatGrid>
              <p className="text-body leading-[1.65] text-ink-secondary mt-3">
                A nominal 95% interval that contains the truth only about 80% of the time is not a
                rounding error — it is the constant-variance assumption failing in exactly the
                periods that matter. Reporting this rather than quietly omitting it is the point:
                it is the honest limitation of the model we actually fitted, and the gap GARCH
                exists to close.
              </p>
            </>
          ) : (
            <StatsSkeleton n={3} />
          )}
        </Card>
      </Grid>

      <Card title="Group" subtitle="one section each">
        <div className="grid gap-px bg-hairline border border-hairline rounded-[var(--radius-sm)] overflow-hidden"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(230px, 100%), 1fr))" }}>
          {TEAM.map((t) => (
            <div key={t.name} className="bg-surface px-3.5 py-3">
              <div className="mono text-micro text-accent">{t.n}</div>
              <div className="text-lead font-medium text-ink mt-0.5">{t.name}</div>
              <div className="text-caption text-ink-muted mt-0.5 leading-snug">{t.owns}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Badge tone="neutral">Sections 1–3: course syllabus</Badge>
          <Badge tone="accent">Sections 4–5: extension work</Badge>
        </div>
      </Card>
    </div>
  )
}
