# Presentation split — who says what

Five parts, roughly 5 minutes each. Each person owns one dashboard tab, one
report section, and one block of slides. The numbers listed under each part
are the ones that person must be able to defend without notes.

The through-line, so the talk sounds like one argument rather than five:
**Parts 1–3 establish that the direction is unforecastable. Part 4 shows the
variance is. Part 5 confirms Part 3's conclusion from an entirely different
direction.** Each presenter should hand off by naming the next question.

---

## Part 1 — Abhinabha Das · Data, Decomposition & Stationarity

**Slides:** "Why we model the log price" → "Correlogram"
**Dashboard tab:** 01 Data & Stationarity
**Report:** §2

**Must know:**
- 2,921 daily observations, 2015-01-02 → 2026-08-14, CAGR 28.98%
- Kurtosis 7.81 vs 3 for a normal
- Trend strength 0.9905, seasonal strength 0.0980
- ADF 0.9634 / KPSS 0.0100 on the level; ADF < 0.0001 / KPSS 0.1000 differenced
- ACF: 40 of 40 lags significant on the level, 9 of 40 on returns, band ±0.0363

**Likely questions:**
- *Why ADF and KPSS together?* Opposite nulls — ADF's is a unit root, KPSS's is stationarity. Agreement in both directions is much stronger than either alone.
- *Why logs?* 28.98% compounding is multiplicative; logs make it additive and stabilise variance in one step.
- *Returns aren't white noise — doesn't that break your conclusion?* No. Ljung-Box p < 0.0001 because n = 2,920 makes r = 0.04 detectable. It is real and far too small to act on. Part 3 quantifies exactly that.

**Hand off with:** "So it's I(1) and there's no season. The obvious next question is whether the simplest possible smoother can forecast it."

---

## Part 2 — K Suraj Das · Moving Averages & Exponential Smoothing

**Slides:** "The three-model ladder" → "Nothing beats Drift"
**Dashboard tab:** 02 Smoothing
**Report:** §3

**Must know:**
- SES α = 0.9879 · Holt α = 0.9371, β = 0 · Holt-Winters α = 1.0, β = 0, γ = 0
- Drift MASE 18.565 beats every smoother; Naive 21.248
- Holt-Winters MAPE 39.60%, SES 44.68%

**Likely questions:**
- *Why is MASE ~18 and not ~1?* It divides by the **one-step** in-sample naive error. At a 12-step horizon large values are expected. Read the ranking and the gap to the same-horizon Naive row (21.248).
- *Why does γ = 0?* Because there is no seasonality — Part 1 measured seasonal strength at 0.098. The model correctly refuses to learn something that isn't there.
- *Isn't Drift winning embarrassing?* It's the point. Holt with β = 0 *is* drift. The extra machinery earns no accuracy.

**Hand off with:** "Smoothing gets us nowhere beyond drift. Let's do it properly with Box–Jenkins."

---

## Part 3 — Akash Kumar · ARIMA & Forecast Evaluation

**Slides:** "Order selection" → "Why a null result is a strong result"
**Dashboard tab:** 03 ARIMA & Forecast
**Report:** §4, §5

**This is the heaviest part — two big reveals. Don't rush the burn-in slide.**

**Must know:**
- ARIMA(3,1,3) selected, AIC −13,539.73; random walk (0,1,0) ranks 16th of 16, ΔAIC 36.93
- Six significant coefficients, but smallest AR root 1.0026 vs smallest MA root 1.0035 — a near-common factor sitting on the unit circle, so they cancel
- Burn-in: first residual 4.5638 vs σ 0.0237 = 192.2σ. LB p = 0.99999 kept, 0.0961 trimmed
- 74 rolling origins; DM p vs naive ranges 0.235 → 0.888, none < 0.05
- PI coverage 82.4 / 82.4 / 79.7%, mean 81.5% vs nominal 95%

**Likely questions:**
- *Your coefficients are significant — isn't that structure?* Individually yes, jointly almost cancelling. AR and MA roots sit 3% apart. The out-of-sample test is what settles it, and it says no.
- *Why drop the first residual? Isn't that cherry-picking?* The opposite — keeping it flatters us. It makes the model look like perfect white noise (p = 0.9999). Dropping it is what exposes the remaining autocorrelation.
- *Drift ranks first — so it wins?* No. DM p = 0.507 at h=1. A ranking without a significant margin is not a win.
- *Isn't a failed forecast a failed project?* We never promised a forecast. We asked whether one was possible and answered it four independent ways.

**Hand off with:** "The mean is a dead end and our intervals are too narrow. Both point at the variance."

---

## Part 4 — Ritesh KR · Volatility & Black–Scholes *(beyond syllabus)*

**Slides:** "The variance is forecastable" → "The smile"
**Dashboard tab:** 04 Volatility & Options
**Report:** §6

**Open by picking up Part 3's loose end — ARCH-LM p < 0.0001 and 81.5% coverage.**

**Must know:**
- α = 0.0752, β = 0.9113, persistence 0.9864, half-life 50.7 trading days
- Current annualised vol 45.3%, long-run 42.7%
- Ljung-Box on squared standardised residuals p = 0.2012 → ARCH fully absorbed
- 61 calls, expiry 2026-09-18, r = 3.697%; ATM market 102.85 vs BS 105.09 (+2.2%)
- Implied vol 49.2% vs GARCH 45.3% → gap +3.9 points

**Likely questions:**
- *Say persistence in plain English.* A volatility shock is still half-present about 50 trading days later. Turbulent weeks are felt a month on.
- *Why Student-t errors?* Kurtosis 7.81. A normal likelihood cannot represent tails that heavy.
- *Why is Black–Scholes wrong?* Two ways, one cause. It assumes constant Gaussian volatility — but implied vol curves across strikes (the smile), and the market charges 3.9 points more than history. Both were already rejected by Part 3's ARCH test.

**Hand off with:** "That's what we *can* forecast. Last question: could something outside ASML have predicted it?"

---

## Part 5 — Aditya Mehta · Macro-Factor Lag Analysis *(beyond syllabus)*

**Slides:** "If ASML can't predict itself" → "Granger" → Conclusion
**Dashboard tab:** 05 Macro Lag
**Report:** §7, §8, §9

**You also close the talk — leave 60 seconds for the conclusion slide.**

**Must know:**
- 7 factors, 2,915 common days
- SOXX 0.8237 same-day, −0.1210 at lag +1 (ratio 0.15); ^GSPC 0.6728 → −0.1466; ^VIX −0.5253
- Distributed lag on SOXX: R² 0.6795 with lag 0, **0.0161** without → 97.6% of power lost
- Granger: 4 of 7 significant at Bonferroni α = 0.01 (SOXX, TSM, ^GSPC, ^TNX)

**Likely questions:**
- *Four factors ARE Granger-significant — doesn't that contradict you?* No, and we report it rather than hide it. Significance ≠ usefulness: at n = 2,915 a test detects effects worth under 1% of variance, which is exactly what the lags-only R² of 0.0161 measures. Part 3 showed what happens to such effects out of sample.
- *Why are the lag-1 correlations negative?* Reversal and bid-ask bounce. A genuine leader would keep the same sign it has at lag 0 — a sign flip is the giveaway that it isn't prediction.
- *Does SOXX cause ASML?* Granger causality is about forecast improvement, not cause. For a chip-equipment maker and a semiconductor index, a common driver is much the likeliest story.

**Close on:** "We cannot tell you where ASML is going. We can tell you, with a well-specified model, how rough the ride will be."

---

## Practical notes

- **Start the backend first** (`uvicorn main:app --port 8000` from `backend/`), then `npm run dev`. The dashboard warms the slow backtest in a background thread at startup, so give it ~20 seconds before demoing tab 03.
- The data is **live**. Final digits will differ from these notes after a market move; the structural conclusions will not. If a number on screen differs from your slide, say so — "the data refreshed this morning" is a better answer than pretending.
- If the network fails during the demo, the backend serves the cached CSV and the dashboard shows a staleness indicator in the header. Not a crash.
- Tabs 04 and 05 carry a **"Beyond syllabus"** pill. Say so out loud — claiming taught material we didn't cover would be the wrong impression to leave.
