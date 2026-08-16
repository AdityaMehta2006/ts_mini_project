"""
options.py — Section 4: Volatility & Black-Scholes   [BEYOND SYLLABUS]

Section 3 ended with two facts that point here: the ARCH-LM test rejects
constant variance, and the ARIMA prediction intervals cover only ~80% instead
of 95%. Both say the same thing — the variance moves, and a model that ignores
that understates risk.

GARCH(1,1) models the moving variance. Black-Scholes then turns a volatility
number into an option price, which is where a volatility forecast becomes worth
money and where the model can be checked against a live market instead of
against itself.
"""

from functools import lru_cache

import numpy as np
import pandas as pd
from arch import arch_model
from scipy import stats
from statsmodels.stats.diagnostic import acorr_ljungbox

import data as D
from common import r4, rp, to_series, subsample

BEYOND = {"beyond_syllabus": True,
          "label": "Beyond syllabus — volatility modelling & option pricing"}


@lru_cache(maxsize=16)
def garch(ticker: str = "ASML", p: int = 1, q: int = 1, dist: str = "t") -> dict:
    """
    GARCH(1,1) on daily log returns, in percent so the optimiser is well scaled.

    Student-t errors by default: Section 3 measured kurtosis 7.69, and a normal
    likelihood cannot represent tails that heavy.
    """
    ret = D.get_series(ticker, "daily", "logret") * 100
    res = arch_model(ret, vol="Garch", p=p, q=q, dist=dist, mean="Constant").fit(disp="off")

    params = {}
    for name in res.params.index:
        params[name] = {"value": r4(res.params[name]),
                        "pvalue": rp(res.pvalues[name]),
                        "significant": bool(res.pvalues[name] < 0.05)}

    alpha = float(res.params.get("alpha[1]", 0.0))
    beta = float(res.params.get("beta[1]", 0.0))
    omega = float(res.params.get("omega", 0.0))
    persistence = alpha + beta

    cond = res.conditional_volatility.dropna()
    ann = cond * np.sqrt(252)
    df = pd.DataFrame({"volatility": cond, "annualised": ann})
    rows, was_sub = subsample(to_series(df))

    # Long-run (unconditional) variance the process reverts to.
    lr_daily = np.sqrt(omega / (1 - persistence)) if persistence < 1 else np.nan
    lr_ann = lr_daily * np.sqrt(252) if np.isfinite(lr_daily) else None

    fc = res.forecast(horizon=21, reindex=False)
    fc_var = fc.variance.values[-1]
    last = D.get_ohlc(ticker).index[-1]
    fc_idx = pd.date_range(last, periods=22, freq="B")[1:]
    fc_rows = [{"date": d.strftime("%Y-%m-%d"),
                "volatility": r4(np.sqrt(v)),
                "annualised": r4(np.sqrt(v) * np.sqrt(252))}
               for d, v in zip(fc_idx, fc_var)]

    std_resid = pd.Series(res.std_resid).dropna()
    lb_sq = acorr_ljungbox(std_resid ** 2, lags=[10], return_df=True)
    lb_p = float(lb_sq["lb_pvalue"].iloc[0])

    current_ann = float(ann.iloc[-1])
    half_life = (np.log(0.5) / np.log(persistence)) if 0 < persistence < 1 else None

    return {
        **BEYOND,
        "ticker": ticker, "freq": "daily",
        "order": [p, q], "dist": dist,
        "parameters": params,
        "persistence": r4(persistence),
        "half_life_days": r4(half_life, 1),
        "long_run_vol_annual_pct": r4(lr_ann),
        "current_vol_annual_pct": r4(current_ann),
        "aic": r4(res.aic, 2), "bic": r4(res.bic, 2),
        "conditional_volatility": rows, "subsampled": was_sub,
        "forecast": fc_rows,
        "arch_removed": {"ljung_box_sq_std_resid_p": rp(lb_p),
                         "clean": bool(lb_p >= 0.05)},
        "interpretation": (
            f"GARCH(1,1) estimates alpha = {alpha:.3f} and beta = {beta:.3f}, "
            f"so persistence is alpha + beta = {persistence:.3f}. Being that "
            f"close to 1 means volatility shocks decay slowly — a half-life of "
            f"about {half_life:.0f} trading days, so a turbulent week is still "
            f"being felt a month later. This is volatility clustering, and it is "
            f"the structure the ARCH-LM test in Section 3 detected. "
            f"Annualised volatility is currently {current_ann:.1f}% against a "
            f"long-run level of {lr_ann:.1f}%. "
            + (f"Ljung-Box on the squared standardised residuals returns "
               f"p = {lb_p:.3f}, so the model has absorbed the ARCH effect and "
               f"left nothing behind. "
               if lb_p >= 0.05 else
               f"Ljung-Box on the squared standardised residuals still returns "
               f"p = {lb_p:.4f}, so a richer specification (EGARCH or GJR, which "
               f"allow falls and rises to affect volatility differently) would "
               f"fit better. ")
            + f"The headline is the contrast with Section 3: the *direction* of "
              f"ASML is unforecastable, but the *magnitude* of its moves is "
              f"strongly forecastable."
        ),
    }


def bs_price(S, K, T, r, sigma, kind="call") -> dict:
    """
    Black-Scholes-Merton with greeks. Vectorises over arrays.

    T is in years. An expiry at or below zero, or zero vol, collapses to
    intrinsic value rather than dividing by zero.
    """
    S, K, T, sigma = map(lambda x: np.asarray(x, dtype=float), (S, K, T, sigma))
    with np.errstate(divide="ignore", invalid="ignore"):
        d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
        d2 = d1 - sigma * np.sqrt(T)
        Nd1, Nd2 = stats.norm.cdf(d1), stats.norm.cdf(d2)
        pdf = stats.norm.pdf(d1)
        disc = np.exp(-r * T)

        if kind == "call":
            price = S * Nd1 - K * disc * Nd2
            delta = Nd1
            theta = (-S * pdf * sigma / (2 * np.sqrt(T)) - r * K * disc * Nd2) / 365
            rho = K * T * disc * Nd2 / 100
        else:
            price = K * disc * (1 - Nd2) - S * (1 - Nd1)
            delta = Nd1 - 1
            theta = (-S * pdf * sigma / (2 * np.sqrt(T)) + r * K * disc * (1 - Nd2)) / 365
            rho = -K * T * disc * (1 - Nd2) / 100

        gamma = pdf / (S * sigma * np.sqrt(T))
        vega = S * pdf * np.sqrt(T) / 100

    intrinsic = np.maximum(S - K, 0) if kind == "call" else np.maximum(K - S, 0)
    price = np.where((T <= 0) | (sigma <= 0), intrinsic, price)
    return {"price": price, "delta": delta, "gamma": gamma,
            "vega": vega, "theta": theta, "rho": rho, "d1": d1, "d2": d2}


def _risk_free() -> float:
    """13-week T-bill as the risk-free proxy. ^IRX quotes in percent."""
    try:
        return float(D.get_ohlc("^IRX")["Close"].dropna().iloc[-1]) / 100.0
    except Exception:
        return 0.04


@lru_cache(maxsize=8)
def option_chain(ticker: str = "ASML", expiry_index: int = 4) -> dict:
    """
    Price the live call chain with Black-Scholes at the GARCH volatility, then
    compare against what the market is actually charging.

    Two volatilities are in play and the difference is the whole point:
    - GARCH sigma is backward-looking, fitted to what the stock has done.
    - Implied volatility is forward-looking, backed out of the traded price.
    Where they disagree, the market is pricing something history cannot see.
    """
    def fetch():
        import yfinance as yf

        tk = yf.Ticker(ticker)
        listed = list(tk.options)
        if not listed:
            raise D.NoDataError(f"No option expiries listed for '{ticker}'.")
        i = min(expiry_index, len(listed) - 1)
        df = tk.option_chain(listed[i]).calls.copy()
        # Carried alongside the quotes so a cached chain restores the whole
        # answer, not just the strikes.
        df["expiry"] = listed[i]
        df["expiry_idx"] = i
        df["all_expiries"] = "|".join(listed)
        return df

    calls = D.cached_frame(f"{ticker}_calls_{expiry_index}", fetch).copy()
    expiry = str(calls["expiry"].iloc[0])
    idx = int(calls["expiry_idx"].iloc[0])
    expiries = str(calls["all_expiries"].iloc[0]).split("|")

    spot = float(D.get_ohlc(ticker)["Close"].iloc[-1])
    T = max((pd.Timestamp(expiry) - D.today()).days, 1) / 365.0
    r = _risk_free()

    g = garch(ticker)
    sigma = float(g["current_vol_annual_pct"]) / 100.0

    # Keep the liquid middle of the chain: quoted, and within +-25% of spot.
    calls = calls[(calls["strike"] > spot * 0.75) & (calls["strike"] < spot * 1.25)]
    calls = calls[(calls["bid"] > 0) & (calls["ask"] > 0)].copy()
    if calls.empty:
        raise D.NoDataError(f"No liquid near-the-money calls for '{ticker}' at {expiry}.")

    calls["mid"] = (calls["bid"] + calls["ask"]) / 2
    bs = bs_price(spot, calls["strike"].values, T, r, sigma, "call")
    calls["bs"] = bs["price"]
    calls["diff"] = calls["bs"] - calls["mid"]

    rows = [
        {"strike": r4(row.strike, 2), "market_mid": r4(row.mid, 2),
         "bs_price": r4(row.bs, 2), "diff": r4(row.diff, 2),
         "diff_pct": r4((row.bs - row.mid) / row.mid * 100, 1) if row.mid else None,
         "implied_vol_pct": r4(row.impliedVolatility * 100, 1),
         "delta": r4(d), "gamma": r4(gm, 6), "vega": r4(v), "theta": r4(th),
         "moneyness": r4(row.strike / spot, 3),
         "open_interest": int(row.openInterest) if pd.notna(row.openInterest) else 0}
        for row, d, gm, v, th in zip(
            calls.itertuples(), bs["delta"], bs["gamma"], bs["vega"], bs["theta"])
    ]

    smile = [{"moneyness": r_["moneyness"], "strike": r_["strike"],
              "implied_vol_pct": r_["implied_vol_pct"]}
             for r_ in rows if r_["implied_vol_pct"]]

    atm = min(rows, key=lambda r_: abs(r_["moneyness"] - 1))
    mean_iv = float(np.mean([r_["implied_vol_pct"] for r_ in rows
                             if r_["implied_vol_pct"]]))
    rich = sum(1 for r_ in rows if r_["diff"] and r_["diff"] > 0)

    return {
        **BEYOND,
        "ticker": ticker, "expiry": expiry, "expiries": expiries,
        "expiry_index": idx,
        "spot": r4(spot, 2), "risk_free_pct": r4(r * 100, 3),
        "T_years": r4(T, 4), "days_to_expiry": int(round(T * 365)),
        "garch_vol_pct": r4(sigma * 100, 1),
        "mean_implied_vol_pct": r4(mean_iv, 1),
        "vol_gap_pct": r4(mean_iv - sigma * 100, 1),
        "n_contracts": len(rows),
        "contracts": rows, "smile": smile,
        "atm": atm,
        "interpretation": (
            f"Pricing {len(rows)} near-the-money {ticker} calls expiring "
            f"{expiry} ({int(round(T * 365))} days out) at a risk-free rate of "
            f"{r * 100:.2f}%. Feeding in the GARCH volatility of "
            f"{sigma * 100:.1f}% reprices {rich} of {len(rows)} contracts above "
            f"the market mid. The market's own average implied volatility is "
            f"{mean_iv:.1f}%, a gap of {mean_iv - sigma * 100:+.1f} points "
            f"against GARCH. "
            + (f"Traders are demanding more volatility than history alone "
               f"justifies — the usual reading is a variance risk premium plus "
               f"whatever event risk sits inside this expiry. "
               if mean_iv > sigma * 100 else
               f"The market is pricing less volatility than recent history "
               f"implies, which typically follows a shock that has already "
               f"begun to fade. ")
            + f"The smile chart shows the second Black-Scholes failure: the "
              f"model assumes one volatility for every strike, yet implied "
              f"volatility visibly curves across moneyness. Both breaks trace to "
              f"the same wrong assumption — constant Gaussian volatility — that "
              f"Section 3's ARCH test and the fat tails in the returns already "
              f"rejected."
        ),
    }
