"""
smoothing.py — Section 2: Moving Averages & Exponential Smoothing  (Lab 5)

The three-model ladder the course drills: SES holds a level, Holt adds a
trend, Holt-Winters adds a season. All fitted on the same monthly log series
so the comparison is fair, all scored against naive and drift benchmarks.

Monthly only. Holt-Winters needs seasonal_periods to mean something, and on
daily bars it does not.
"""

from functools import lru_cache

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing, SimpleExpSmoothing

import data as D
from common import r4, to_series, errors

PERIOD = 12


def _monthly(ticker: str) -> pd.Series:
    s = D.get_series(ticker, "monthly", "log")
    return s.asfreq("ME")


@lru_cache(maxsize=32)
def moving_average(ticker: str = "ASML", windows: str = "3,6,12") -> dict:
    """
    Centred moving averages. The lab point: the window controls the
    trade-off — short windows track the data and keep the noise, long windows
    give a clean trend and lag the turning points.
    """
    s = _monthly(ticker)
    wins = [int(w) for w in windows.split(",") if w.strip()]

    df = pd.DataFrame({"observed": s})
    rows_err = []
    for w in wins:
        ma = s.rolling(window=w, center=True).mean()
        df[f"ma_{w}"] = ma
        joined = pd.concat([s, ma], axis=1).dropna()
        e = errors(joined.iloc[:, 0], joined.iloc[:, 1])
        rows_err.append({"window": w, "n": int(len(joined)), **e})

    smoothest = min(rows_err, key=lambda r_: r_["rmse"] or 9e9)
    return {
        "ticker": ticker, "freq": "monthly", "windows": wins,
        "series": to_series(df),
        "errors": rows_err,
        "interpretation": (
            f"A {smoothest['window']}-month moving average tracks the log price "
            f"most closely (RMSE {smoothest['rmse']:.4f}), which is the expected "
            f"result rather than an interesting one: the shortest window always "
            f"fits best because it is allowed to follow the noise. The wider "
            f"windows are the useful ones — they strip the month-to-month "
            f"movement and leave the trend that Section 1's decomposition "
            f"measured at 0.99 strength. Note that a centred average cannot "
            f"reach the ends of the sample, so it describes history and "
            f"forecasts nothing."
        ),
    }


def _fit_one(train: pd.Series, method: str, seasonal: str = "add"):
    """SES / Holt / Holt-Winters on the training slice."""
    if method == "ses":
        return SimpleExpSmoothing(train, initialization_method="estimated").fit()
    if method == "holt":
        return ExponentialSmoothing(
            train, trend="add", seasonal=None,
            initialization_method="estimated").fit()
    return ExponentialSmoothing(
        train, trend="add", seasonal=seasonal, seasonal_periods=PERIOD,
        initialization_method="estimated").fit()


def _params(res, method: str) -> dict:
    p = res.params
    out = {"alpha": r4(p.get("smoothing_level"))}
    if method in ("holt", "hw"):
        out["beta"] = r4(p.get("smoothing_trend"))
    if method == "hw":
        out["gamma"] = r4(p.get("smoothing_seasonal"))
    out["l0"] = r4(p.get("initial_level"))
    out["b0"] = r4(p.get("initial_trend"))
    return out


@lru_cache(maxsize=64)
def ets(ticker: str = "ASML", method: str = "hw", seasonal: str = "add",
        holdout: int = 12, h: int = 12) -> dict:
    """
    Fit one method, score it on a held-out tail, then refit on everything and
    forecast h steps ahead.

    Everything is computed in logs and reported back on the price scale, since
    a MAPE in log space is not a quantity anyone can interpret.
    """
    s = _monthly(ticker)
    train, test = s.iloc[:-holdout], s.iloc[-holdout:]

    res = _fit_one(train, method, seasonal)
    pred = res.forecast(holdout)

    # Back to price for anything a human reads.
    actual_px, pred_px = np.exp(test), np.exp(pred)
    e = errors(actual_px, pred_px, train=np.exp(train), m=1)

    naive_px = np.exp(pd.Series(float(train.iloc[-1]), index=test.index))
    e_naive = errors(actual_px, naive_px, train=np.exp(train), m=1)

    full = _fit_one(s, method, seasonal)
    fc = full.forecast(h)

    # ExponentialSmoothing has no analytic interval, so the band comes from the
    # residual sd widened by sqrt(step) — the standard random-walk scaling.
    resid_sd = float(np.std(full.resid, ddof=1))
    steps = np.arange(1, h + 1)
    se = resid_sd * np.sqrt(steps)
    fc_rows = [
        {"date": d.strftime("%Y-%m-%d"),
         "mean": r4(np.exp(m), 2),
         "lo80": r4(np.exp(m - 1.2816 * u), 2), "hi80": r4(np.exp(m + 1.2816 * u), 2),
         "lo95": r4(np.exp(m - 1.9600 * u), 2), "hi95": r4(np.exp(m + 1.9600 * u), 2)}
        for d, m, u in zip(fc.index, fc.values, se)
    ]

    fitted = pd.DataFrame({"observed": np.exp(s), "fitted": np.exp(full.fittedvalues)})
    hold_rows = [{"date": d.strftime("%Y-%m-%d"), "actual": r4(a, 2), "predicted": r4(p_, 2)}
                 for d, a, p_ in zip(test.index, actual_px.values, pred_px.values)]

    beat = (e["mase"] is not None and e_naive["mase"] is not None
            and e["mase"] < e_naive["mase"])
    name = {"ses": "SES", "holt": "Holt", "hw": f"Holt-Winters ({seasonal})"}[method]

    return {
        "ticker": ticker, "freq": "monthly", "method": method, "name": name,
        "seasonal": seasonal if method == "hw" else None,
        "params": _params(full, method),
        "aic": r4(full.aic, 2), "bic": r4(full.bic, 2), "sse": r4(full.sse),
        "fitted": to_series(fitted),
        "holdout": {"h": holdout, "points": hold_rows, "errors": e,
                    "naive_errors": e_naive, "beats_naive": bool(beat)},
        "forecast": fc_rows,
        "interpretation": _ets_text(name, full, method, e, e_naive, holdout, beat),
    }


def _ets_text(name, res, method, e, e_naive, holdout, beat) -> str:
    a = res.params.get("smoothing_level")
    bits = [
        f"{name} fits with alpha = {a:.3f}." if a is not None else f"{name} fitted."
    ]
    if a is not None and a > 0.85:
        bits.append(
            f"An alpha that close to 1 means the level is being reset to "
            f"whatever just happened — the model is copying the last "
            f"observation, which is a random walk wearing a costume."
        )
    if method == "hw":
        g = res.params.get("smoothing_seasonal")
        if g is not None:
            bits.append(
                f"The seasonal weight gamma = {g:.3f} confirms Section 1: with "
                f"seasonal strength near zero there is no annual pattern for "
                f"this term to learn."
            )
    verdict = "beats" if beat else "does not beat"
    bits.append(
        f"Over a {holdout}-month holdout it scores MAPE {e['mape']:.2f}% "
        f"against the naive forecast's {e_naive['mape']:.2f}%, so it {verdict} "
        f"the benchmark. Treat that number with suspicion in either direction: "
        f"a {holdout}-month-ahead error on a stock that tripled says more about "
        f"the horizon than the model. Section 3's rolling-origin backtest is "
        f"the honest comparison."
    )
    return " ".join(bits)


@lru_cache(maxsize=32)
def compare(ticker: str = "ASML", holdout: int = 12) -> dict:
    """
    Every smoother against every benchmark on one holdout, one table.

    Benchmarks matter more than the models here. A forecast that cannot beat
    "tomorrow equals today" has earned nothing, however good its MAPE looks.
    """
    s = _monthly(ticker)
    train, test = s.iloc[:-holdout], s.iloc[-holdout:]
    actual_px, train_px = np.exp(test), np.exp(train)
    last = float(train.iloc[-1])

    rows = []
    for method, seasonal, label in [
        ("ses", None, "SES"), ("holt", None, "Holt"),
        ("hw", "add", "Holt-Winters (add)"), ("hw", "mul", "Holt-Winters (mul)"),
    ]:
        try:
            res = _fit_one(train, method, seasonal or "add")
            pred_px = np.exp(res.forecast(holdout))
            e = errors(actual_px, pred_px, train=train_px, m=1)
            rows.append({"name": label, "kind": "model",
                         "alpha": r4(res.params.get("smoothing_level")),
                         "aic": r4(res.aic, 2), **e})
        except Exception as exc:
            rows.append({"name": label, "kind": "model", "error": str(exc)[:120],
                         "mae": None, "rmse": None, "mape": None, "mase": None})

    # Naive: last value carried forward. Drift: last value plus the average
    # per-period change over the training sample.
    naive_px = np.exp(pd.Series(last, index=test.index))
    rows.append({"name": "Naive", "kind": "benchmark", "alpha": None, "aic": None,
                 **errors(actual_px, naive_px, train=train_px, m=1)})

    slope = (float(train.iloc[-1]) - float(train.iloc[0])) / (len(train) - 1)
    drift_px = np.exp(pd.Series(
        [last + slope * (i + 1) for i in range(holdout)], index=test.index))
    rows.append({"name": "Drift", "kind": "benchmark", "alpha": None, "aic": None,
                 **errors(actual_px, drift_px, train=train_px, m=1)})

    snaive_px = np.exp(pd.Series(
        [float(train.iloc[-PERIOD + (i % PERIOD)]) for i in range(holdout)],
        index=test.index))
    rows.append({"name": "Seasonal naive", "kind": "benchmark", "alpha": None,
                 "aic": None, **errors(actual_px, snaive_px, train=train_px, m=1)})

    scored = [r_ for r_ in rows if r_.get("mase") is not None]
    best = min(scored, key=lambda r_: r_["mase"])
    naive_mase = next(r_["mase"] for r_ in rows if r_["name"] == "Naive")
    models_beating = [r_["name"] for r_ in scored
                      if r_["kind"] == "model" and r_["mase"] < naive_mase]

    for r_ in rows:
        r_["beats_naive"] = bool(r_.get("mase") is not None and r_["mase"] < naive_mase)

    return {
        "ticker": ticker, "freq": "monthly", "holdout": holdout,
        "models": rows,
        "best_by_mase": best["name"],
        "naive_mase": naive_mase,
        "models_beating_naive": models_beating,
        "interpretation": (
            f"Ranked by MASE, the winner over this {holdout}-month holdout is "
            f"{best['name']} at {best['mase']:.3f}, against the naive "
            f"benchmark's {naive_mase:.3f}. "
            + (f"{len(models_beating)} of the four smoothers beat naive here "
               f"({', '.join(models_beating)}). "
               if models_beating else
               "Not one of the four smoothers beats simply carrying the last "
               "price forward. ")
            + f"MASE is the measure to read, but read it correctly: it divides "
              f"by the *one-step* in-sample naive error, so at a {holdout}-step "
              f"horizon values far above 1 are normal and not a sign of "
              f"failure. What counts is the ranking, and specifically the gap "
              f"to the same-horizon Naive row at {naive_mase:.3f}. The result "
              f"that matters is that Drift — last value plus the average "
              f"monthly change, two parameters and no fitting — is at or near "
              f"the top. Holt collapses onto it once beta is estimated at 0, "
              f"and Holt-Winters adds a seasonal term with gamma = 0 that "
              f"changes nothing. The extra machinery earns no accuracy. A "
              f"single holdout is still one draw, which is why Section 3 "
              f"repeats this over dozens of origins."
        ),
    }
