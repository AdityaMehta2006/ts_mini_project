---
marp: true
paginate: true
size: 16:9
header: 'ASML · Time Series Mini Project'
---

<!-- _class: title -->

# How Predictable Is ASML?

<div class="epigraph">

The honest deliverable is not a forecast. It is a **verdict on forecastability**.

</div>

<div class="byline">Abhinabha Das · K Suraj Das · Akash Kumar · Ritesh KR · Aditya Mehta</div>
<div class="repo">github.com/AdityaMehta2006/ts_mini_project</div>

---

# The data

<div class="cols even">
<div>

| Property | Value |
|---|---|
| Ticker | **ASML** |
| Source | Yahoo Finance, adjusted |
| Period | 2015-01-02 → 2026-08-14 |
| Daily observations | **2,921** |
| Monthly observations | 140 |

</div>
<div>

| Property | Value |
|---|---|
| First close | 95.94 |
| Last close | **1,844.08** |
| Total return | 1,822.0% |
| CAGR | **28.98%** |
| Annualised volatility | **38.01%** |

</div>
</div>

The EUV lithography monopoly — structurally important, and violently volatile. Daily data for stationarity, ARIMA and volatility; monthly for decomposition and smoothing.

---

<!-- header: 'Part 01 · Abhinabha Das · Data, Decomposition & Stationarity' -->

# Why we model the log price

<div class="cols">
<div>

![w:600](figures/fig_data.png)

</div>
<div>

ASML compounded at **28.98% a year**.

Growth that fast is **multiplicative** — variance grows with the level.

Logs turn multiplicative growth into additive growth *and* stabilise variance in one step.

Returns: skew −0.33, **kurtosis 7.81** (normal = 3). Those fat tails come back twice.

</div>
</div>

---

# There is no calendar season in a share price

<div class="cols">
<div>

![w:560](figures/fig_decompose.png)

</div>
<div>

| Component | Strength |
|---|---|
| Trend | **0.99** |
| Seasonal | **0.10** |

A seasonal strength of 0.10 means that panel is fitting noise.

A negative result — and it makes a prediction: Holt-Winters' seasonal term should earn nothing. Part 2 confirms γ = 0 exactly.

</div>
</div>

---

# Stationarity: two tests, opposite nulls

<div class="cols">
<div>

![w:600](figures/fig_acf_pacf.png)

</div>
<div>

**ADF** H₀: unit root · **KPSS** H₀: stationary

| Series | ADF p | KPSS p |
|---|---|---|
| Log price | 0.9634 | 0.0100 |
| Δ log price | **< 0.0001** | **0.1000** |

Log price: **all 40** lags outside the ±0.0363 band. Returns: only **9 of 40**, none large.

<span class="note">Ljung-Box on returns gives p < 0.0001, so returns are not *strictly* white noise. At n = 2,920 even r = 0.04 is detectable. Real, and far too small to trade.</span>

</div>
</div>

## Because the nulls are opposed, agreement in both directions is far stronger than either test alone — ASML log price is I(1), so d = 1

---

<!-- header: 'Part 02 · K Suraj Das · Moving Averages & Exponential Smoothing' -->

# The three-model ladder

<div class="cols even">
<div>

**SES** → level only
**Holt** → + trend
**Holt-Winters** → + season

| Model | α | β | γ | MAPE |
|---|---|---|---|---|
| SES | 0.9879 | — | — | 44.68% |
| Holt | 0.9371 | 0.0000 | — | 39.19% |
| Holt-Winters | 1.0000 | 0.0000 | 0.0000 | 39.60% |

</div>
<div>

Three parameters tell the whole story:

- **α ≈ 1** → the level is reset to whatever just happened — *a random walk in a costume*
- **β = 0** → trend treated as fixed, so Holt collapses onto Drift
- **γ = 0** → no seasonality to learn, exactly as Part 1 predicted

</div>
</div>

---

# Nothing beats Drift

<div class="cols">
<div>

![w:600](figures/fig_smoothing_errors.png)

</div>
<div>

| Model | MASE | Benchmark | MASE |
|---|---|---|---|
| SES | 21.279 | Naive | 21.248 |
| Holt | 18.625 | **Drift** | **18.565** |
| Holt-Winters | 18.653 | Seasonal naive | 22.081 |

**Last value plus the average monthly change — two parameters, no fitting — wins.**

<span class="note">MASE divides by the one-step in-sample naive error, so values above 1 are normal at a 12-step horizon. Read the ranking, not the level.</span>

</div>
</div>

---

<!-- header: 'Part 03 · Akash Kumar · ARIMA & Forecast Evaluation' -->

# Order selection: 16 candidates by AIC

<div class="cols">
<div>

![w:600](figures/fig_arima_grid.png)

</div>
<div>

| Order | AIC | ΔAIC |
|---|---|---|
| **(3,1,3)** | **−13,539.73** | **0.00** |
| (1,1,3) | −13,520.20 | 19.53 |
| (0,1,0) random walk | −13,502.80 | **36.93** |

The random walk ranks **16th of 16**.

AIC *does* find real structure in the differenced series — this is not a criterion unable to choose.

</div>
</div>

---

# But the coefficients mislead

<div class="cols even">
<div>

| Coefficient | Estimate |
|---|---|
| ar.L1 | **−0.7897** |
| ar.L2 | 0.8681 |
| ar.L3 | 0.9119 |
| ma.L1 | **0.7384** |
| ma.L2 | −0.8740 |
| ma.L3 | −0.8520 |

All six significant at 5%. It looks like strong structure.

</div>
<div>

| | Smallest root modulus |
|---|---|
| AR(3) | **1.0026** |
| MA(3) | **1.0035** |

Both sit almost exactly *on* the unit circle, and almost exactly on top of each other — the polynomials share a **near-common factor** and very nearly cancel.

A factor on both sides of the equation does no forecasting work at all.

</div>
</div>

## A model can carry large, significant coefficients and still be a near-random walk. Only an out-of-sample test settles it.

---

# The trap: one residual inverts every diagnostic

<div class="cols even">
<div>

`statsmodels` starts its state-space filter from a diffuse prior. The first residual is the filter finding its footing — **not** a model error.

<div class="stat">192.2σ</div>
<div class="label">first residual 4.5638 vs σ = 0.0237</div>

</div>
<div>

| Ljung-Box | p |
|---|---|
| Burn-in **kept** | **0.99999** |
| Burn-in **trimmed** | **0.0961** |

Kept, it dominates every sum of squares that follows and the model looks like flawless white noise. Trimmed, it passes — but only just.

**The whole appearance of a perfect fit rested on one observation, and nothing in the output looks wrong.**

</div>
</div>

---

# Residuals, and where the model genuinely fails

<div class="cols">
<div>

![w:580](figures/fig_arima_resid.png)

</div>
<div>

| Test | p | Meaning |
|---|---|---|
| Ljung-Box (10) | 0.0961 | no autocorrelation |
| Jarque-Bera | < 0.0001 | not normal |
| ARCH-LM (10) | < 0.0001 | **variance not constant** |

| Horizon | Coverage | Nominal |
|---|---|---|
| h = 1 | 82.4% | 95% |
| h = 3 | 82.4% | 95% |
| h = 6 | **79.7%** | 95% |

Mean **81.5%** against 95% — the intervals are **too narrow**. ARIMA assumes one constant variance; ARCH-LM rejects that at p < 0.0001.

</div>
</div>

---

<!-- _class: verdict -->

# No model beats naive at any horizon

<div class="cols even">
<div>

| Model | h=1 | h=3 | h=6 |
|---|---|---|---|
| ARIMA(3,1,3) | 7.179 | 13.558 | 24.483 |
| Naive | 7.151 | 13.634 | 24.556 |
| **Drift** | **7.020** | **13.211** | **23.273** |

<span class="note">74 rolling origins, expanding window, refit every time. MASE by horizon.</span>

</div>
<div>

**Diebold–Mariano p vs naive:** 0.235 → 0.888.

**Not one below 0.05.**

Drift ranks first at every horizon — but a ranking without a significant margin **is not a win**, and reporting it as one would be the easiest mistake in this project.

</div>
</div>

---

<!-- header: 'Part 04 · Ritesh KR · Volatility & Black–Scholes — beyond syllabus' -->
<!-- _class: signal -->

# The variance, however, is forecastable

<div class="cols">
<div>

![w:600](figures/fig_garch_vol.png)

</div>
<div>

$$\sigma_t^2 = \omega + \alpha\varepsilon_{t-1}^2 + \beta\sigma_{t-1}^2$$

| Parameter | Value |
|---|---|
| α (shock) | 0.0752 |
| β (persistence) | 0.9113 |
| **α + β** | **0.9864** |
| Half-life | **50.7 days** |

Ljung-Box on squared standardised residuals: **p = 0.2012** → ARCH fully absorbed.

</div>
</div>

---

<!-- _class: verdict signal -->

# We cannot say where ASML is going. We can say how rough the ride will be.

- **Mean** — unforecastable. 74 origins, no significant edge over naive.
- **Variance** — strongly forecastable. Persistence 0.9864, half-life 50.7 days.

The same data supports both claims, and they are not in tension: returns are unpredictable in *direction* and highly structured in *magnitude*.

---

<!-- _class: signal -->

# Black–Scholes against a live market

<div class="cols">
<div>

![w:600](figures/fig_options.png)

</div>
<div>

61 near-the-money calls, expiry 2026-09-18, r = 3.697%

| | |
|---|---|
| Spot | 1,844.08 |
| ATM strike | 1,840 |
| Market mid | **102.85** |
| Black–Scholes @ GARCH σ | **105.09** |
| Implied vol | 49.2% |
| GARCH vol | 45.3% |
| **Gap** | **+3.9 pts** |

Black–Scholes assumes **one volatility for every strike**; implied vol visibly **curves**. Both departures trace to the constant-Gaussian assumption Part 3 had already rejected.

</div>
</div>

---

<!-- header: 'Part 05 · Aditya Mehta · Macro-Factor Lag Analysis — beyond syllabus' -->

# If ASML can't predict itself, can anything else?

<div class="cols">
<div>

![w:620](figures/fig_macro_ccf.png)

</div>
<div>

| Factor | Same day | Lead (+1) |
|---|---|---|
| **SOXX** | **0.8237** | −0.1210 |
| TSM | 0.6780 | −0.0836 |
| ^GSPC | 0.6728 | −0.1466 |
| ^VIX | −0.5253 | 0.0690 |

Seven factors, 2,915 common trading days. A tall spike at lag 0 and near-flat ground either side.

**ASML moves *with* the semiconductor complex, not *after* it.** The lag-1 values are **negative** — reversal and bid-ask bounce, not prediction. A true leader would keep its sign.

</div>
</div>

---

# Quantifying it: one variable carries everything

<div class="cols">
<div>

![w:560](figures/fig_macro_dlag.png)

</div>
<div>

| Specification | R² |
|---|---|
| With the same-day term | **0.6795** |
| Lags only — all a forecaster has | **0.0161** |

A correlation of 0.82 looks like an opportunity, until you notice *when* it exists.

</div>
</div>

## Removing the one variable you cannot know in advance destroys 97.6% of the explanatory power

---

# Granger: reporting the awkward result

Lags 1–5 per factor, Bonferroni threshold α = 0.01.

**Four factors are significant: SOXX, TSM, ^GSPC, ^TNX.** This appears to contradict the section. It does not:

1. **Significance ≠ usefulness.** At n = 2,915 a test detects effects explaining well under 1% of variance — precisely what the lags-only R² of 0.0161 measures directly.
2. **Part 3 already showed** what becomes of small in-sample effects out of sample.

Granger causality is a claim about **forecast improvement**, not about cause. For a chip-equipment maker and a semiconductor index, a **common driver** is by far the likeliest explanation.

---

<!-- header: 'Conclusion · Aditya Mehta' -->

# What we found

<div class="cols even">
<div>

**The direction of ASML is not forecastable**

Four independent tools, four different labs, one conclusion:

1. ADF **and** KPSS agree: I(1)
2. The ACF of returns collapses immediately
3. ARIMA's AR and MA roots nearly cancel
4. No model beats naive across 74 origins, DM p ≥ 0.235

## This is weak-form market efficiency (Fama, 1970)

</div>
<div>

**The magnitude of its moves is**

GARCH persistence 0.9864, half-life 50.7 days, ARCH fully absorbed.

**And we found where our own model fails**

Prediction intervals cover 81.5%, not 95% — the constant-variance assumption breaking in plain sight.

<span class="note">The failure mode we deliberately avoided: tuning until something wins. Given enough specifications, one always will.</span>

</div>
</div>

---

# Limitations & further work

- Single asset, single regime — 2015–2026 was one extraordinary bull run
- Linear models only; non-linear or regime-switching structure would be invisible
- **SARIMA not fitted** — seasonal strength 0.098 did not justify it, and it is the natural next step
- Daily closes hide microstructure; bid-ask bounce likely explains the negative lag-1 values
- Live option chain reflects quotes at one moment; no transaction costs modelled

**Reproducibility:** every figure and number comes from `make_figures.py`, which imports the same modules that serve the dashboard. One implementation — a slide cannot disagree with the app.

---

<!-- _class: verdict -->

# Thank you — questions?

<div class="label">Live dashboard · 6 sections · FastAPI + React</div>
<div class="repo">github.com/AdityaMehta2006/ts_mini_project</div>
