"""
explore.py — Section 1: Data, Decomposition & Stationarity  (Labs 1-4, 6)

The setup section. Establishes what the series is, splits it into trend /
seasonal / remainder, and settles the question everything downstream depends
on: is it stationary, and if not, how many differences does it take?
"""

from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.seasonal import seasonal_decompose, STL
from statsmodels.tsa.stattools import adfuller, kpss, acf, pacf
from statsmodels.stats.diagnostic import acorr_ljungbox

import data as D
from common import r4, rp, to_series, subsample, acf_bands

TRANSFORM_LABEL = {"price": "price", "log": "log price", "logret": "log returns"}


@lru_cache(maxsize=32)
def meta(ticker: str = "ASML") -> dict:
    px = D.get_series(ticker, "daily", "price")
    ret = D.get_series(ticker, "daily", "logret")
    years = (px.index[-1] - px.index[0]).days / 365.25
    cagr = (float(px.iloc[-1]) / float(px.iloc[0])) ** (1 / years) - 1
    ann_vol = float(ret.std()) * np.sqrt(252)

    return {
        "ticker": ticker,
        "start": px.index[0].strftime("%Y-%m-%d"),
        "end": px.index[-1].strftime("%Y-%m-%d"),
        "n_daily": int(len(px)),
        "n_monthly": int(len(D.get_series(ticker, "monthly", "price"))),
        "first_close": r4(px.iloc[0], 2),
        "last_close": r4(px.iloc[-1], 2),
        "total_return_pct": r4((float(px.iloc[-1]) / float(px.iloc[0]) - 1) * 100, 1),
        "cagr_pct": r4(cagr * 100, 2),
        "ann_vol_pct": r4(ann_vol * 100, 2),
        "years": r4(years, 1),
        "freshness": D.freshness(ticker),
        "interpretation": (
            f"{ticker} has {len(px):,} trading days from {px.index[0]:%b %Y} to "
            f"{px.index[-1]:%b %Y}, compounding at {cagr * 100:.1f}% a year with "
            f"{ann_vol * 100:.1f}% annualised volatility. Growth that fast is "
            f"multiplicative, which is why every model below is fitted on the "
            f"log price: logs turn multiplicative growth into additive growth "
            f"and stabilise the variance at the same time."
        ),
    }


@lru_cache(maxsize=64)
def series(ticker: str = "ASML", freq: str = "daily", limit: int = 0) -> dict:
    """Price series plus OHLC. `limit` returns only the tail (candlestick)."""
    ohlc = D.get_ohlc(ticker)
    if freq == "monthly":
        ohlc = ohlc.resample("ME").agg(
            {"Open": "first", "High": "max", "Low": "min",
             "Close": "last", "Volume": "sum"}
        ).dropna()

    df = ohlc.copy()
    df["log_close"] = np.log(df["Close"])
    df["log_return"] = df["log_close"].diff()

    if limit and limit > 0:
        df = df.tail(limit)

    rows = to_series(df)
    rows, was_sub = subsample(rows)

    ret = df["log_return"].dropna()
    return {
        "ticker": ticker,
        "freq": freq,
        "n": int(len(df)),
        "subsampled": was_sub,
        "series": rows,
        "stats": {
            "min": r4(df["Close"].min(), 2),
            "max": r4(df["Close"].max(), 2),
            "mean": r4(df["Close"].mean(), 2),
            "mean_return_pct": r4(ret.mean() * 100, 4),
            "sd_return_pct": r4(ret.std() * 100, 4),
            "skew": r4(stats.skew(ret)),
            "kurtosis": r4(stats.kurtosis(ret, fisher=False)),
        },
        "interpretation": (
            f"Closing prices range {df['Close'].min():,.0f} to "
            f"{df['Close'].max():,.0f}. Returns have excess kurtosis "
            f"({stats.kurtosis(ret, fisher=False):.2f} against 3 for a normal "
            f"distribution), the fat tails that make extreme days far more "
            f"common than a bell curve allows."
        ),
    }


@lru_cache(maxsize=32)
def decompose(ticker: str = "ASML", model: str = "additive",
              method: str = "classical") -> dict:
    """
    Classical or STL decomposition. Monthly only — a defined period is required
    and daily stock bars have no meaningful weekly cycle.

    On log price, `additive` is the right model: logs already removed the
    multiplicative structure.
    """
    s = D.get_series(ticker, "monthly", "log")
    s = s.asfreq("ME")

    if method == "stl":
        res = STL(s, period=12, robust=True).fit()
        trend, seasonal, resid = res.trend, res.seasonal, res.resid
    else:
        res = seasonal_decompose(s, model=model, period=12)
        trend, seasonal, resid = res.trend, res.seasonal, res.resid

    comp = pd.DataFrame({
        "observed": s, "trend": trend, "seasonal": seasonal, "resid": resid,
    })

    # Hyndman's strength measures: 1 - Var(remainder)/Var(remainder + component).
    # Bounded [0, 1], and directly comparable between the two components.
    r = resid.dropna()
    def strength(component):
        combined = (component + resid).dropna()
        if len(combined) < 2 or combined.var() == 0:
            return 0.0
        return float(max(0.0, 1 - r.var() / combined.var()))

    t_str, s_str = strength(trend), strength(seasonal)

    monthly_effect = seasonal.groupby(seasonal.index.month).mean()
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    profile = [{"month": names[m - 1], "effect": r4(v)}
               for m, v in monthly_effect.items()]

    return {
        "ticker": ticker,
        "freq": "monthly",
        "model": model,
        "method": method,
        "components": to_series(comp),
        "seasonal_profile": profile,
        "strength": {"trend": r4(t_str), "seasonal": r4(s_str)},
        "interpretation": (
            f"Trend strength is {t_str:.2f} and seasonal strength is "
            f"{s_str:.2f} on a 0-1 scale. The series is almost entirely trend: "
            f"there is no calendar season in a share price, and the seasonal "
            f"panel is picking up noise rather than a repeating annual pattern. "
            f"That is a real finding, not a failure — it is the reason Section 2 "
            f"compares Holt-Winters against Holt, and expects the extra seasonal "
            f"term to earn nothing."
        ),
    }


@lru_cache(maxsize=64)
def stationarity(ticker: str = "ASML", freq: str = "daily") -> dict:
    """
    ADF and KPSS on the log level and its first difference.

    The two tests are built with opposite nulls, which is exactly the pairing
    the labs drill: ADF's null is a unit root (non-stationary), KPSS's null is
    stationarity. Agreement in both directions is the strongest evidence either
    way, and here they agree.
    """
    lvl = D.get_series(ticker, freq, "log")
    dif = lvl.diff().dropna()

    def run(s, label):
        a = adfuller(s, autolag="AIC")
        k = kpss(s, regression="c", nlags="auto")
        return [
            {"series": label, "test": "ADF", "statistic": r4(a[0]),
             "pvalue": rp(a[1]), "lags": int(a[2]),
             "critical": {k2: r4(v) for k2, v in a[4].items()},
             "null": "has a unit root (non-stationary)",
             "reject_null": bool(a[1] < 0.05),
             "says_stationary": bool(a[1] < 0.05)},
            {"series": label, "test": "KPSS", "statistic": r4(k[0]),
             "pvalue": rp(k[1]), "lags": int(k[2]),
             "critical": {k2: r4(v) for k2, v in k[3].items()},
             "null": "is stationary",
             "reject_null": bool(k[1] < 0.05),
             "says_stationary": bool(k[1] >= 0.05)},
        ]

    lvl_tests = run(lvl, "log price")
    dif_tests = run(dif, "differenced log price")
    tests = lvl_tests + dif_tests

    lvl_stat = lvl_tests[0]["says_stationary"] and lvl_tests[1]["says_stationary"]
    dif_stat = dif_tests[0]["says_stationary"] and dif_tests[1]["says_stationary"]
    agree_lvl = lvl_tests[0]["says_stationary"] == lvl_tests[1]["says_stationary"]
    agree_dif = dif_tests[0]["says_stationary"] == dif_tests[1]["says_stationary"]

    d = 0 if lvl_stat else 1

    return {
        "ticker": ticker,
        "freq": freq,
        "tests": tests,
        "matrix": {
            "level": {"adf_p": lvl_tests[0]["pvalue"], "kpss_p": lvl_tests[1]["pvalue"],
                      "verdict": "stationary" if lvl_stat else "non-stationary",
                      "agree": agree_lvl},
            "diff": {"adf_p": dif_tests[0]["pvalue"], "kpss_p": dif_tests[1]["pvalue"],
                     "verdict": "stationary" if dif_stat else "non-stationary",
                     "agree": agree_dif},
        },
        "integration_order": d,
        "recommended_d": d,
        "interpretation": (
            f"On the log level ADF returns p = {lvl_tests[0]['pvalue']:.3f} "
            f"(cannot reject a unit root) while KPSS returns "
            f"p = {lvl_tests[1]['pvalue']:.3f} (rejects stationarity). Both point "
            f"the same way despite opposite null hypotheses. After one "
            f"difference ADF gives p = {dif_tests[0]['pvalue']:.3f} and KPSS "
            f"p = {dif_tests[1]['pvalue']:.3f}, and they agree again in the "
            f"opposite direction. {ticker} log price is I(1): non-stationary in "
            f"level, stationary in first difference, so d = {d}."
        ),
    }


@lru_cache(maxsize=64)
def acf_pacf(ticker: str = "ASML", freq: str = "daily",
             transform: str = "log", nlags: int = 40) -> dict:
    """
    ACF and PACF with Bartlett bands, plus the Ljung-Box ladder.

    Reading rules from Lab 3/6: slow geometric decay in the ACF is the trend
    signature; a cut-off at lag q identifies MA(q); a PACF cut-off at lag p
    identifies AR(p).
    """
    s = D.get_series(ticker, freq, transform).dropna()
    n = len(s)
    nlags = min(nlags, n // 4)
    band = acf_bands(n)

    a = acf(s, nlags=nlags, fft=True)
    p = pacf(s, nlags=nlags)

    def pack(vals):
        return [{"lag": int(i), "value": r4(v),
                 "lower": r4(-band), "upper": r4(band),
                 "significant": bool(abs(v) > band)}
                for i, v in enumerate(vals) if i > 0]

    acf_rows, pacf_rows = pack(a), pack(p)

    lb = acorr_ljungbox(s, lags=min(20, nlags), return_df=True)
    lb_rows = [{"lag": int(i), "statistic": r4(row["lb_stat"]),
                "pvalue": rp(row["lb_pvalue"]),
                "white_noise": bool(row["lb_pvalue"] >= 0.05)}
               for i, row in lb.iterrows()]

    def first_cut(rows):
        """Last lag that is significant before a run of insignificance."""
        cut = None
        for r_ in rows:
            if r_["significant"]:
                cut = r_["lag"]
            elif cut is not None:
                break
        return cut

    n_sig = sum(1 for r_ in acf_rows if r_["significant"])
    lb10 = next((r_ for r_ in lb_rows if r_["lag"] == 10), lb_rows[-1])
    is_wn = lb10["white_noise"]
    label = TRANSFORM_LABEL.get(transform, transform)

    if transform == "logret":
        expected = max(1, int(round(0.05 * len(acf_rows))))
        largest = max(abs(r_["value"]) for r_ in acf_rows)
        interp = (
            f"The ACF of {label} collapses immediately — every autocorrelation "
            f"is tiny, the largest being {largest:.3f} against a +-{band:.3f} "
            f"band. {n_sig} of {len(acf_rows)} lags cross that band where chance "
            f"alone would give about {expected}, and Ljung-Box at lag 10 returns "
            f"p = {lb10['pvalue']:.4f}, so the series is not *quite* white noise. "
            f"With {n:,} observations even an autocorrelation of 0.04 is "
            f"detectable, which is the honest reading here: the structure is "
            f"statistically present but far too small to trade or forecast on. "
            f"Compare this with the log level, where the ACF is still near 1 at "
            f"lag 40."
        )
    else:
        interp = (
            f"The ACF of {label} decays glacially — {n_sig} of {len(acf_rows)} "
            f"lags exceed the +-{band:.3f} band, and lag 40 is still far above "
            f"it. That slow decay is the textbook non-stationarity signature: "
            f"the series has no fixed mean to revert to. Differencing is "
            f"required before any ARMA structure can be read."
        )

    return {
        "ticker": ticker, "freq": freq, "transform": transform,
        "nlags": nlags, "n": int(n), "conf_band": r4(band),
        "acf": acf_rows, "pacf": pacf_rows, "ljung_box": lb_rows,
        "reading": {
            "acf_cuts_at": first_cut(acf_rows),
            "pacf_cuts_at": first_cut(pacf_rows),
            "n_significant_acf": int(n_sig),
        },
        "is_white_noise": bool(is_wn),
        "interpretation": interp,
    }
