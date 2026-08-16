"""
data.py
-------
Pulls ASML (or any Yahoo ticker) and caches it as CSV in backend/data/raw/.

Everything downstream reads through `get_series`. Nothing else in the project
calls yfinance directly.
"""

import os
import re
import threading
from datetime import timedelta
from functools import lru_cache

import numpy as np
import pandas as pd
import yfinance as yf

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "raw")
os.makedirs(DATA_DIR, exist_ok=True)

START = "2015-01-01"

# Daily bars settle after the close, so a cache from earlier today is still
# current. 18h means one refresh per trading day without hammering Yahoo.
CACHE_MAX_AGE_HOURS = 18

DEFAULT_TICKER = "ASML"

# ---------------------------------------------------------------------------
# Submission vintage.
#
# While this is set, nothing re-downloads and nothing reads the wall clock:
# every series is served from the CSV cache in data/raw/, so the report, the
# slides, the figures and the dashboard all describe one dataset.
#
# This is not belt-and-braces. Yahoo re-adjusts the whole price history for
# dividends and splits, so a refresh does not just append new bars — it
# rewrites the old ones. One such refresh moved the AIC-selected order from
# ARIMA(1,1,3) to ARIMA(3,1,3) with the sample length, dates and CAGR all
# unchanged, which silently invalidated a written section while every
# surface-level number still looked right.
#
# Set to None to track live data again, then re-run make_figures.py and
# check_facts.py before trusting anything written down.
# ---------------------------------------------------------------------------
AS_OF = "2026-08-16"


def today() -> pd.Timestamp:
    """
    The current date, or the pinned vintage. Anything that dates a calculation
    goes through here — a live clock against frozen data drifts apart daily.
    """
    return pd.Timestamp(AS_OF) if AS_OF else pd.Timestamp.today().normalize()

# Section 5. Each is a plausible driver of a Dutch semiconductor-equipment maker:
# the sector it sells into, its two biggest customers, the market, the fear
# gauge, the currency it reports in, and the discount rate its valuation lives on.
MACRO_FACTORS = {
    "SOXX": "Semiconductor ETF",
    "TSM": "TSMC (customer)",
    "NVDA": "NVIDIA (demand proxy)",
    "^GSPC": "S&P 500",
    "^VIX": "Volatility index",
    "EURUSD=X": "EUR/USD",
    "^TNX": "US 10Y yield",
}

# yfinance is NOT thread-safe: concurrent download() calls share session state
# and can silently return one ticker's frame for another. Downloads are rare
# and I/O bound, so one global lock costs nothing measurable.
# ponytail: global lock, go per-ticker only if a threaded scan ever appears.
_download_lock = threading.Lock()


class NoDataError(ValueError):
    """
    Yahoo returned nothing for this symbol — nearly always a typo rather than a
    server fault. Its own type so the API can answer 404 with something readable
    instead of a 500 quoting a cache key.
    """


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_\-]", "_", name)


def _cache_path(ticker: str) -> str:
    return os.path.join(DATA_DIR, f"{_safe(ticker)}.csv")


def _age_hours(path: str) -> float:
    import time
    return (time.time() - os.path.getmtime(path)) / 3600.0


def _read_cache(path: str) -> pd.DataFrame:
    return pd.read_csv(path, index_col=0, parse_dates=True)


def _download(ticker: str) -> pd.DataFrame:
    """Fetch daily OHLCV. `end` is exclusive in yfinance, hence tomorrow."""
    end = (today().date() + timedelta(days=1)).isoformat()
    with _download_lock:
        df = yf.download(
            ticker, start=START, end=end,
            auto_adjust=True, progress=False, threads=False,
        )
    if df is None or len(df) == 0:
        raise NoDataError(f"Yahoo Finance returned no rows for '{ticker}'.")
    # A single-ticker download still comes back with a ('Close', 'ASML') level.
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    df.index = pd.to_datetime(df.index).tz_localize(None)
    return df.dropna(how="all")


@lru_cache(maxsize=32)
def get_ohlc(ticker: str = DEFAULT_TICKER) -> pd.DataFrame:
    """
    Daily OHLCV, cached in memory and on disk.

    A failed refresh falls back to the stale CSV: a rate-limited Yahoo should
    cost freshness, not take the whole dashboard down mid-demo. Callers see the
    staleness through `freshness()`.
    """
    path = _cache_path(ticker)
    have_cache = os.path.exists(path) and os.path.getsize(path) > 50

    # Pinned: the cache IS the dataset. No age check, no refresh.
    if AS_OF and have_cache:
        df = _read_cache(path)
        if len(df):
            return df

    if have_cache and _age_hours(path) < CACHE_MAX_AGE_HOURS:
        df = _read_cache(path)
        if len(df):
            return df

    try:
        df = _download(ticker)
        df.to_csv(path)
        return df
    except NoDataError:
        raise
    except Exception:
        if have_cache:
            df = _read_cache(path)
            if len(df):
                return df
        raise


def freshness(ticker: str = DEFAULT_TICKER) -> dict:
    df = get_ohlc(ticker)
    last = pd.Timestamp(df.index[-1])
    age = (today() - last.normalize()).days
    return {
        "last_observation": last.strftime("%Y-%m-%d"),
        "age_days": int(age),
        # Weekends and holidays mean 4 days can pass without anything being wrong.
        "is_fresh": bool(age <= 4),
        # A pinned dataset is not stale, and it is not live either. The UI says
        # which, because "live" over frozen data is a lie the demo would tell.
        "pinned": AS_OF,
    }


def get_series(
    ticker: str = DEFAULT_TICKER,
    freq: str = "daily",
    transform: str = "price",
) -> pd.Series:
    """
    The one accessor every analysis module uses.

    freq:      daily | monthly   (monthly = last close of each month)
    transform: price | log | logret

    Monthly matters because seasonal decomposition and Holt-Winters need a
    defined period. Daily stock bars have no weekly cycle worth modelling, so
    anything seasonal is fitted on the 140 monthly points instead.
    """
    freq = freq.lower()
    transform = transform.lower()
    if freq not in ("daily", "monthly"):
        raise ValueError(f"freq must be 'daily' or 'monthly', got '{freq}'")
    if transform not in ("price", "log", "logret"):
        raise ValueError(f"transform must be price|log|logret, got '{transform}'")

    px = get_ohlc(ticker)["Close"].dropna()
    if freq == "monthly":
        px = px.resample("ME").last().dropna()
        px.index = px.index.to_period("M").to_timestamp("M")

    if transform == "price":
        out = px
    elif transform == "log":
        out = np.log(px)
    else:
        out = np.log(px).diff().dropna()

    out.name = f"{ticker}_{freq}_{transform}"
    return out


def cached_frame(name: str, fetch) -> pd.DataFrame:
    """
    Disk cache for the one dataset that is not a price series: the option chain.
    Same rules as prices — authoritative under a pin, 18h otherwise — so §4's
    Black-Scholes numbers freeze along with everything else instead of moving
    every time the chain is quoted.
    """
    path = _cache_path(name)
    if os.path.exists(path) and os.path.getsize(path) > 50:
        if AS_OF or _age_hours(path) < CACHE_MAX_AGE_HOURS:
            return pd.read_csv(path)

    df = fetch()
    df.to_csv(path, index=False)
    return df


@lru_cache(maxsize=16)
def get_factor_returns(ticker: str = DEFAULT_TICKER) -> pd.DataFrame:
    """
    Section 5. Daily log returns of the stock alongside every macro factor,
    inner-joined so each row is a day all of them traded.
    """
    cols = {"ASSET": get_series(ticker, "daily", "logret")}
    for sym in MACRO_FACTORS:
        try:
            s = get_ohlc(sym)["Close"].dropna()
            cols[sym] = np.log(s).diff().dropna()
        except Exception:
            # One dead factor should not empty the whole panel.
            continue
    return pd.DataFrame(cols).dropna()
