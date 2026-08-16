# How Predictable Is ASML?

A Box–Jenkins audit of ASML Holding N.V. — Time Series Analysis group mini project.

Live FastAPI backend + React dashboard, plus a written report and slide deck whose
numbers are generated from the same code that serves the app.

**The finding:** ASML's log price is I(1), and across 74 rolling origins no model beats
the naive forecast by a statistically significant margin at any horizon. The *direction*
is unforecastable — but the *variance* is, with GARCH persistence of 0.9864 and a shock
half-life of 50.7 trading days.

---

## Running it

Two processes. Backend first.

```bash
# 1. Backend  (http://localhost:8000, interactive docs at /docs)
pip install -r backend/requirements.txt
cd backend
python -m uvicorn main:app --reload --port 8000

# 2. Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

The dashboard proxies `/api` to port 8000, so there is no CORS step and no hardcoded
host in the client. On startup the backend warms the slow rolling-origin backtest in a
daemon thread — give it ~20 seconds before demoing Section 3.

Market data is fetched live and cached as CSV in `backend/data/raw/` for 18 hours. If
Yahoo is unreachable, the backend serves the stale cache and the header shows a
staleness indicator rather than failing.

## Verifying it

```bash
pytest backend/test_backend.py     # 55 assertions
npm run build                      # typecheck + production build
python docs/check_facts.py         # every number in the docs traces to facts.json
```

`test_backend.py` asserts the project's headline claims, not just that the code runs.
If a future data refresh ever makes a model genuinely beat naive, the suite fails —
which is the correct alarm, since the report would then need rewriting.

## Regenerating the report and slides

```bash
python docs/figures/make_figures.py    # 14 figures + facts.json
python docs/check_facts.py             # guard against stale prose
npm run report                         # docs/REPORT.html
npm run report:pdf                     # docs/REPORT.pdf  (24 pages, submission-ready)
npm run slides                         # docs/SLIDES.pdf  (Marp; needs node, no LaTeX)
```

`npm run report` produces a self-contained HTML file with every figure inlined as a
data URI — no pandoc, no LaTeX, no external requests. `report:pdf` then prints that file
with whichever Chrome or Edge is already installed (`--headless --print-to-pdf`), so the
PDF needs no toolchain beyond a browser. If neither browser is found it says so and leaves
the HTML for you to print by hand; it does not fail the build.

`make_figures.py` imports the same backend modules the dashboard serves from, so a
figure in the PDF cannot disagree with the app. **No number is typed into `REPORT.md`
or `SLIDES.md` by hand unless it exists in `facts.json`** — `check_facts.py` enforces
this and fails the build otherwise.

---

## Layout

```
backend/
  main.py           FastAPI — 18 endpoints, thin wrappers over analysis/
  data.py           yfinance + CSV cache + download lock + stale fallback
  common.py         rounding, JSON shaping, error measures, burn-in trim
  analysis/
    explore.py      §1  decomposition, ADF/KPSS, ACF/PACF, Ljung-Box
    smoothing.py    §2  MA, SES/Holt/Holt-Winters, accuracy measures
    arima.py        §3  AIC grid, fit, diagnostics, rolling-origin backtest
    options.py      §4  GARCH(1,1), Black–Scholes, live option chain
    macro.py        §5  cross-correlation, distributed lags, Granger
  test_backend.py   the guards

frontend/src/
  sections/         one file per presenter + Overview
  components/       shell primitives and chart wrappers
  hooks/            stale-while-revalidate fetch

docs/
  REPORT.md         → PDF
  SLIDES.md         → Marp deck
  PRESENTATION_PARTS.md   who presents what, and the likely questions
  figures/          make_figures.py, facts.json, 14 PNGs
```

## Sections

| # | Section | Presenter |
|---|---|---|
| 1 | Data, Decomposition & Stationarity | Abhinabha Das |
| 2 | Moving Averages & Exponential Smoothing | K Suraj Das |
| 3 | ARIMA & Forecast Evaluation | Akash Kumar |
| 4 | Volatility & Black–Scholes *(beyond syllabus)* | Ritesh KR |
| 5 | Macro-Factor Lag Analysis *(beyond syllabus)* | Aditya Mehta |

Sections 1–3 use only methods taught in the course. Sections 4 and 5 are extension
work and are labelled as such in the UI, the report and the deck.

## Two implementation notes worth knowing

**The burn-in trap.** `statsmodels` initialises its ARIMA state-space filter from a
diffuse prior, so the first residual is the filter settling, not a model error — here
it is 4.5638 against a residual sd of 0.0237, a 192.2σ point. Left in, it dominates
every sum of squares and Ljung-Box reports p = 0.99999: apparently perfect white noise.
Trimmed, the same test reports p = 0.0961. The entire appearance of a flawless fit
rested on one observation and nothing in the output looks wrong when it happens, so
every diagnostic routes through `common.trim_burnin`. `test_backend.py::test_burnin_trap`
guards it.

**No `pmdarima`.** It is broken under NumPy 2, so `analysis/arima.py` runs an explicit
AIC grid instead of `auto_arima`. That is what `auto.arima` does internally anyway, and
having every candidate visible is easier to defend.

**The data is pinned.** `data.AS_OF` freezes the dataset to one vintage, so the report,
the slides, the figures and the dashboard all describe the same numbers. This is not
caution for its own sake: Yahoo re-adjusts the *whole* price history for dividends and
splits, so a refresh rewrites the past rather than appending to it. One such refresh
moved the AIC-selected order from ARIMA(1,1,3) to ARIMA(3,1,3) while the sample length,
the date range and the CAGR all stayed identical — every surface-level number still
looked right while a written section had quietly become false. Set `AS_OF = None` to
track live data again, then re-run `make_figures.py` and `check_facts.py` before
trusting anything written down.

## Stack

FastAPI · statsmodels · arch · yfinance — React 19 · Vite · TypeScript · Tailwind v4 · Recharts · Motion
