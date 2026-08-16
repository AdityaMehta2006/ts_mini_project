"""
common.py
---------
Helpers shared by every analysis module. Three jobs: round floats before they
reach JSON, turn a pandas object into the flat [{date, ...}] shape Recharts
wants, and trim ARIMA burn-in residuals.

That last one is not a nicety. See `trim_burnin`.
"""

import math
import numpy as np
import pandas as pd


def r4(x, nd: int = 4):
    """Round for JSON. NaN/inf become None so `json.dumps` doesn't emit NaN."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return round(v, nd)


def rp(x):
    """Round a p-value. 6dp — 4dp turns every strong rejection into a flat 0.0."""
    return r4(x, 6)


def to_series(obj, **extra) -> list[dict]:
    """
    DataFrame/Series -> [{"date": "YYYY-MM-DD", col: val, ...}].

    Column names are lowercased. NaN becomes None (a gap Recharts skips) rather
    than 0, which would draw a spike down to the axis.
    """
    df = obj.to_frame() if isinstance(obj, pd.Series) else obj.copy()
    df = df.rename(columns={c: str(c).lower() for c in df.columns})
    for k, v in extra.items():
        df[k] = v

    out = []
    for idx, row in df.iterrows():
        rec = {"date": pd.Timestamp(idx).strftime("%Y-%m-%d")}
        for c in df.columns:
            rec[c] = r4(row[c])
        out.append(rec)
    return out


def subsample(rows: list, n: int = 900) -> tuple[list, bool]:
    """
    Thin a long series for transport. Always keeps the last row so the most
    recent observation is never the one dropped.

    Returns (rows, was_subsampled).
    """
    if len(rows) <= n:
        return rows, False
    step = math.ceil(len(rows) / n)
    thinned = rows[::step]
    if thinned[-1] is not rows[-1]:
        thinned.append(rows[-1])
    return thinned, True


def trim_burnin(resid, d: int = 1, p: int = 0) -> pd.Series:
    """
    Drop the initialisation residuals from a statsmodels ARIMA fit.

    statsmodels runs the state-space filter from a diffuse prior, so the first
    few residuals are not model errors at all — they are the filter finding its
    footing. On ASML log price the very first residual is 4.5638 against a
    residual sd of 0.0239. That is a 191-sigma point.

    Left in, it dominates every sum of squares that follows: Ljung-Box returns
    p = 1.0 and the model looks like flawless white noise. Trimmed, the same
    test returns p = 0.0. The diagnostics invert completely on this one point,
    which is why every module routes through here instead of touching
    `res.resid` directly.
    """
    s = pd.Series(resid).dropna()
    return s.iloc[max(d + p, 1):]


def acf_bands(n: int, alpha: float = 0.05) -> float:
    """
    Bartlett white-noise band, the +-1.96/sqrt(n) dashed lines on an R acf plot.
    """
    from scipy import stats
    return float(stats.norm.ppf(1 - alpha / 2) / np.sqrt(n))


def errors(actual, predicted, train=None, m: int = 1) -> dict:
    """
    The Lab 7 error battery: MAE, MSE, RMSE, MAPE, MASE.

    MASE scales by the in-sample naive error, so MASE < 1 beats the naive
    forecast and MASE > 1 loses to it. It is the only one of these that is
    comparable across series, which is exactly why the labs teach it.
    """
    a = np.asarray(actual, dtype=float)
    f = np.asarray(predicted, dtype=float)
    mask = ~(np.isnan(a) | np.isnan(f))
    a, f = a[mask], f[mask]
    if len(a) == 0:
        return {"mae": None, "rmse": None, "mape": None, "mase": None}

    err = a - f
    mae = float(np.mean(np.abs(err)))
    mse = float(np.mean(err ** 2))

    mape = None
    nz = a != 0
    if nz.any():
        mape = float(np.mean(np.abs(err[nz] / a[nz])) * 100)

    mase = None
    if train is not None:
        tr = np.asarray(train, dtype=float)
        tr = tr[~np.isnan(tr)]
        if len(tr) > m:
            scale = float(np.mean(np.abs(tr[m:] - tr[:-m])))
            if scale > 0:
                mase = mae / scale

    return {
        "mae": r4(mae),
        "rmse": r4(math.sqrt(mse)),
        "mape": r4(mape),
        "mase": r4(mase),
    }
