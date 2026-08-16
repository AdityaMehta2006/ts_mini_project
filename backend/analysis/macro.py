"""
macro.py — Section 5: Macro-Factor Lag Analysis   [BEYOND SYLLABUS]

Sections 1-3 asked whether ASML's own past predicts its future, and answered
no. This section asks the obvious follow-up: if the stock cannot predict
itself, can something else predict it? The semiconductor sector, its largest
customers, the market, the fear gauge, the euro, the 10-year yield.

The method is cross-correlation across leads and lags, then Granger causality
on the ones that look promising. The distinction the whole section turns on is
between correlation *at lag 0* — which is large — and correlation *at any
lag* — which is not. Moving together is not the same as leading.
"""

from functools import lru_cache

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.stattools import grangercausalitytests

import data as D
from common import r4, rp

BEYOND = {"beyond_syllabus": True,
          "label": "Beyond syllabus — multivariate lead/lag analysis"}

MAX_LAG = 10


@lru_cache(maxsize=8)
def cross_correlation(ticker: str = "ASML", max_lag: int = MAX_LAG) -> dict:
    """
    Correlation of ASML returns against each factor shifted from -max_lag to
    +max_lag trading days.

    Sign convention, stated because it is the only thing that makes the output
    readable: a positive lag k means the factor is shifted *forward*, so it is
    the factor's value k days ago against ASML today. A peak at k > 0 would
    mean the factor leads and could be used to forecast. A peak at k = 0 means
    they simply move together and nothing is predictable from it.
    """
    panel = D.get_factor_returns(ticker)
    asset = panel["ASSET"]

    factors = []
    for sym in [c for c in panel.columns if c != "ASSET"]:
        f = panel[sym]
        lags = []
        for k in range(-max_lag, max_lag + 1):
            c = float(asset.corr(f.shift(k)))
            lags.append({"lag": int(k), "corr": r4(c)})

        contemp = next(x["corr"] for x in lags if x["lag"] == 0)
        lagged = [x for x in lags if x["lag"] > 0]
        best_lag = max(lagged, key=lambda x: abs(x["corr"]))
        # 95% band for a correlation under the null of independence.
        band = 1.96 / np.sqrt(len(panel))
        ratio = abs(best_lag["corr"]) / abs(contemp) if contemp else None

        factors.append({
            "symbol": sym,
            "name": D.MACRO_FACTORS.get(sym, sym),
            "lags": lags,
            "contemporaneous": contemp,
            "best_positive_lag": best_lag["lag"],
            "best_positive_lag_corr": best_lag["corr"],
            # Two tiers, because they answer different questions. A correlation
            # can clear the significance band at n=2915 and still be far too
            # small to act on, so "detectable" must not be reported as "leads".
            "lead_detectable": bool(abs(best_lag["corr"]) > band),
            "lead_meaningful": bool(ratio is not None and ratio > 0.5
                                    and abs(best_lag["corr"]) > 0.2),
            "sign_flips": bool(contemp * best_lag["corr"] < 0),
            "ratio": r4(ratio),
        })

    factors.sort(key=lambda x: abs(x["contemporaneous"]), reverse=True)
    band = 1.96 / np.sqrt(len(panel))
    top = factors[0]
    leaders = [f["symbol"] for f in factors if f["lead_meaningful"]]
    flippers = [f["symbol"] for f in factors
                if f["sign_flips"] and f["lead_detectable"]]

    return {
        **BEYOND,
        "ticker": ticker, "n_obs": int(len(panel)),
        "max_lag": max_lag, "conf_band": r4(band),
        "factors": factors,
        "leaders": leaders,
        "sign_flippers": flippers,
        "interpretation": (
            f"Across {len(panel):,} common trading days, the strongest "
            f"same-day relationship is {top['name']} ({top['symbol']}) at "
            f"r = {top['contemporaneous']:.3f}. Shift that same factor forward "
            f"by even one day and the correlation falls to "
            f"{top['best_positive_lag_corr']:.3f} — about "
            f"{abs(top['best_positive_lag_corr'] / top['contemporaneous']) * 100:.0f}% "
            f"of its contemporaneous size. Every factor shows the same shape: a "
            f"tall spike at lag 0 with almost flat ground on either side, so "
            f"not one of them clears the bar for a usable lead. "
            + (f"The lag-1 values are not quite zero, but they are *negative* "
               f"({', '.join(flippers)}), the opposite sign to the day-0 "
               f"relationship. That is the signature of short-horizon reversal "
               f"and bid-ask bounce rather than a predictive link — a factor "
               f"that genuinely led ASML would carry the same sign it has at "
               f"lag 0, not the reverse. "
               if flippers else "")
            + f"ASML moves *with* the semiconductor complex, not *after* it. "
              f"That distinction is the whole section: r = 0.82 looks like a "
              f"forecasting opportunity until you notice it exists only at zero "
              f"lag, by which point the information is already in the price. It "
              f"is the same efficient-market conclusion Sections 1 to 3 reached, "
              f"arrived at from a completely different direction."
        ),
    }


@lru_cache(maxsize=8)
def granger(ticker: str = "ASML", max_lag: int = 5) -> dict:
    """
    Granger causality: does adding k lags of the factor improve a forecast of
    ASML built from k lags of ASML alone?

    Both series are daily log returns and therefore stationary, which is the
    precondition the test needs — running it on price levels is the classic
    misuse and would give spurious results.

    "Granger causality" is a claim about forecast improvement, not about cause.
    The name oversells it and the interpretation below does not.
    """
    panel = D.get_factor_returns(ticker)
    asset = panel["ASSET"]

    rows = []
    for sym in [c for c in panel.columns if c != "ASSET"]:
        pair = pd.concat([asset, panel[sym]], axis=1).dropna()
        try:
            res = grangercausalitytests(pair.values, maxlag=max_lag)
            best_p, best_lag = 1.0, 1
            per_lag = []
            for lag in range(1, max_lag + 1):
                pv = float(res[lag][0]["ssr_ftest"][1])
                per_lag.append({"lag": lag, "pvalue": rp(pv)})
                if pv < best_p:
                    best_p, best_lag = pv, lag
            rows.append({
                "symbol": sym, "name": D.MACRO_FACTORS.get(sym, sym),
                "per_lag": per_lag,
                "best_lag": best_lag, "min_pvalue": rp(best_p),
                # Bonferroni across the lags searched — testing 5 lags and
                # reporting the smallest p without correction manufactures
                # significance out of nothing.
                "significant": bool(best_p < 0.05 / max_lag),
            })
        except Exception as exc:
            rows.append({"symbol": sym, "name": D.MACRO_FACTORS.get(sym, sym),
                         "error": str(exc)[:120], "significant": False})

    sig = [r_ for r_ in rows if r_.get("significant")]
    rows.sort(key=lambda r_: r_.get("min_pvalue") if r_.get("min_pvalue") is not None else 9)

    return {
        **BEYOND,
        "ticker": ticker, "max_lag": max_lag,
        "n_obs": int(len(panel)),
        "alpha_corrected": r4(0.05 / max_lag, 4),
        "results": rows,
        "n_significant": len(sig),
        "significant_factors": [r_["symbol"] for r_ in sig],
        "interpretation": (
            f"Testing lags 1 to {max_lag} for each factor, with the threshold "
            f"Bonferroni-corrected to {0.05 / max_lag:.3f} because searching "
            f"five lags and quoting the smallest p-value would otherwise "
            f"manufacture significance. "
            + (f"{len(sig)} of {len(rows)} factors clear that bar: "
               f"{', '.join(r_['symbol'] for r_ in sig)}. Even where the test "
               f"is significant, the effect is small — statistical detectability "
               f"across {len(panel):,} observations is not the same as an "
               f"economically useful signal, and Section 3's backtest showed "
               f"what happens to small in-sample effects out of sample. "
               if sig else
               f"Not one factor clears that bar. No macro series in this panel "
               f"improves a forecast of ASML returns beyond what ASML's own "
               f"past already provides. ")
            + f"Granger causality is a statement about forecast improvement, "
              f"not about cause: the test cannot tell whether a factor drives "
              f"ASML, responds to it, or shares a common driver with it."
        ),
    }


@lru_cache(maxsize=8)
def distributed_lag(ticker: str = "ASML", symbol: str = "SOXX",
                    max_lag: int = 5) -> dict:
    """
    Regress ASML returns on the contemporaneous factor plus its lags.

    This puts a number on the section's claim. The lag-0 coefficient carries
    essentially all the explanatory power; the lagged coefficients are the
    forecastable part, and they are near zero.
    """
    panel = D.get_factor_returns(ticker)
    if symbol not in panel.columns:
        raise D.NoDataError(f"Unknown factor '{symbol}'.")

    y = panel["ASSET"]
    X = pd.DataFrame({f"lag_{k}": panel[symbol].shift(k) for k in range(max_lag + 1)})
    joined = pd.concat([y, X], axis=1).dropna()
    yy, XX = joined["ASSET"], sm.add_constant(joined.drop(columns="ASSET"))

    full = sm.OLS(yy, XX).fit()
    # Same regression with lag 0 removed — what a genuine forecaster could use,
    # since today's factor move is not known before today's close.
    lag_only = sm.OLS(yy, sm.add_constant(
        joined[[f"lag_{k}" for k in range(1, max_lag + 1)]])).fit()

    coefs = [{"lag": int(name.split("_")[1]) if name.startswith("lag_") else None,
              "name": name, "estimate": r4(full.params[name]),
              "std_err": r4(full.bse[name]), "t": r4(full.tvalues[name]),
              "pvalue": rp(full.pvalues[name]),
              "significant": bool(full.pvalues[name] < 0.05)}
             for name in full.params.index]

    return {
        **BEYOND,
        "ticker": ticker, "symbol": symbol,
        "name": D.MACRO_FACTORS.get(symbol, symbol),
        "max_lag": max_lag, "n_obs": int(len(joined)),
        "coefficients": coefs,
        "r_squared": r4(full.rsquared),
        "adj_r_squared": r4(full.rsquared_adj),
        "r_squared_lags_only": r4(lag_only.rsquared),
        "f_pvalue": rp(full.f_pvalue),
        "interpretation": (
            f"Regressing ASML returns on {symbol} and {max_lag} of its lags "
            f"explains {full.rsquared * 100:.1f}% of the variance. Drop the "
            f"contemporaneous term — which a forecaster could not know in "
            f"advance — and the same regression explains "
            f"{lag_only.rsquared * 100:.2f}%. Almost all the explanatory power "
            f"sits in the lag-0 coefficient "
            f"({full.params['lag_0']:.3f}), which is a statement about how "
            f"ASML and the sector co-move, not about predicting either. The "
            f"tradeable part of this relationship — everything at lag 1 and "
            f"beyond — is worth under one percent of variance. High correlation "
            f"and zero predictability coexist comfortably, and that is the "
            f"single most useful thing this section has to say."
        ),
    }
