"""
test_backend.py
---------------
One assert-based guard per claim the project actually makes. Run with:

    pytest backend/test_backend.py -q

The important one is `test_burnin_trap`. Everything else is scaffolding around
the fact that a single untrimmed residual silently inverts every diagnostic in
Section 3, and nothing in the output looks wrong when it happens.
"""

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import data as D
from common import errors, trim_burnin
from analysis import explore, smoothing, arima, options, macro
from main import app

client = TestClient(app)


# --------------------------------------------------------------------------
# Data spine
# --------------------------------------------------------------------------

def test_series_shapes():
    daily = D.get_series("ASML", "daily", "price")
    monthly = D.get_series("ASML", "monthly", "price")
    assert len(daily) > 2500, "expected 10+ years of daily bars"
    assert 100 < len(monthly) < 200, "monthly resample should be ~140 points"
    assert daily.index.is_monotonic_increasing
    assert not daily.isna().any()


def test_logret_is_diff_of_log():
    lp = D.get_series("ASML", "daily", "log")
    lr = D.get_series("ASML", "daily", "logret")
    assert len(lr) == len(lp) - 1
    np.testing.assert_allclose(lr.values, lp.diff().dropna().values, rtol=1e-9)


def test_bad_ticker_raises_nodata():
    with pytest.raises(D.NoDataError):
        D.get_ohlc("NOT_A_REAL_TICKER_XYZ")


# --------------------------------------------------------------------------
# The burn-in trap — the reason common.trim_burnin exists
# --------------------------------------------------------------------------

def test_burnin_trap():
    """
    Untrimmed, Ljung-Box reports the residuals are perfect white noise.
    Trimmed, it reports the opposite. Both cannot be true, and the first is
    an artifact of one 191-sigma initialisation point.
    """
    d = arima.diagnostics("ASML", "daily", 1, 1, 0)
    b = d["burn_in"]

    assert b["sigmas"] > 50, "first residual should be a huge outlier"
    assert b["ljung_box_p_if_kept"] > 0.9, "untrimmed LB should look like white noise"
    assert b["ljung_box_p_after_trim"] < 0.05, "trimmed LB should reject white noise"
    assert b["dropped"] >= 1


def test_trimmed_residuals_have_no_outlier():
    """After trimming, no residual should be anywhere near 191 sigma."""
    d = arima.diagnostics("ASML", "daily", 1, 1, 0)
    vals = np.array([r["resid"] for r in d["resid"] if r["resid"] is not None])
    sd = np.std(vals)
    assert np.max(np.abs(vals)) < 15 * sd, "a burn-in artifact survived the trim"


def test_trim_burnin_drops_leading_rows():
    s = pd.Series([100.0, 0.1, -0.2, 0.15])
    assert len(trim_burnin(s, d=1, p=0)) == 3
    assert 100.0 not in trim_burnin(s, d=1, p=0).values


# --------------------------------------------------------------------------
# Section 1 — the I(1) result the whole project rests on
# --------------------------------------------------------------------------

def test_log_price_is_i1():
    s = explore.stationarity("ASML", "daily")
    assert s["matrix"]["level"]["verdict"] == "non-stationary"
    assert s["matrix"]["diff"]["verdict"] == "stationary"
    assert s["matrix"]["level"]["agree"], "ADF and KPSS should agree on the level"
    assert s["matrix"]["diff"]["agree"], "ADF and KPSS should agree on the difference"
    assert s["integration_order"] == 1


def test_acf_decays_for_level_not_returns():
    lvl = explore.acf_pacf("ASML", "daily", "log", 40)
    ret = explore.acf_pacf("ASML", "daily", "logret", 40)
    assert lvl["reading"]["n_significant_acf"] > 35, "level ACF should barely decay"
    assert ret["reading"]["n_significant_acf"] < 15, "return ACF should collapse"
    assert abs(ret["acf"][0]["value"]) < 0.2


def test_decomposition_finds_trend_not_season():
    d = explore.decompose("ASML", "additive", "classical")
    assert d["strength"]["trend"] > 0.8, "a stock price is trend-dominated"
    assert d["strength"]["seasonal"] < 0.4, "there is no calendar season in a stock"
    assert len(d["seasonal_profile"]) == 12


# --------------------------------------------------------------------------
# Section 2 — error measures
# --------------------------------------------------------------------------

def test_errors_are_sane():
    a = np.array([10.0, 11.0, 12.0, 13.0])
    e = errors(a, a, train=a, m=1)
    assert e["mae"] == 0 and e["rmse"] == 0 and e["mape"] == 0

    e2 = errors(a, a + 1, train=a, m=1)
    assert e2["mae"] == 1.0
    assert e2["mase"] == 1.0, "an error equal to the naive step should give MASE 1"


def test_compare_includes_benchmarks():
    c = smoothing.compare("ASML", 12)
    names = {r["name"] for r in c["models"]}
    assert {"Naive", "Drift", "SES", "Holt"} <= names
    for r in c["models"]:
        if r.get("mase") is not None:
            assert r["mase"] > 0 and np.isfinite(r["mase"])


# --------------------------------------------------------------------------
# Section 3 — the central claim
# --------------------------------------------------------------------------

def test_backtest_no_model_significantly_beats_naive():
    """
    The project's headline. If a future data refresh ever makes a model
    genuinely beat naive, this test failing is the correct alarm — the
    conclusion in the report would need rewriting, not the test.
    """
    b = arima.backtest("ASML", "monthly", "1,3", 60)
    assert b["n_origins"] > 30
    assert b["significant_vs_naive"] == [], (
        f"a model now beats naive significantly: {b['significant_vs_naive']}")


def test_backtest_reports_coverage():
    b = arima.backtest("ASML", "monthly", "1,3", 60)
    cov = [r["pi_coverage_95"] for r in b["results"] if "pi_coverage_95" in r]
    assert cov, "ARIMA rows should carry prediction-interval coverage"
    assert all(0 <= c <= 100 for c in cov)


def test_grid_ranks_random_walk():
    g = arima.grid("ASML", "daily", 1, 3, 3)
    assert g["n_fitted"] >= 15
    assert g["random_walk"] is not None
    assert g["candidates"][0]["delta_aic"] == 0


# --------------------------------------------------------------------------
# Section 4 — volatility
# --------------------------------------------------------------------------

def test_garch_persistence_high_but_stationary():
    g = options.garch("ASML")
    assert 0.8 < g["persistence"] < 1.0, "equity vol is persistent but mean-reverting"
    assert g["current_vol_annual_pct"] > 10


def test_black_scholes_call_bounds():
    """A call is worth at least intrinsic value and never more than the spot."""
    S, K, T, r, sig = 100.0, 90.0, 0.5, 0.04, 0.3
    out = options.bs_price(S, K, T, r, sig, "call")
    price = float(out["price"])
    assert max(S - K, 0) <= price <= S
    assert 0 <= float(out["delta"]) <= 1


def test_put_call_parity():
    S, K, T, r, sig = 100.0, 105.0, 0.75, 0.04, 0.25
    c = float(options.bs_price(S, K, T, r, sig, "call")["price"])
    p = float(options.bs_price(S, K, T, r, sig, "put")["price"])
    assert abs((c - p) - (S - K * np.exp(-r * T))) < 1e-8


# --------------------------------------------------------------------------
# Section 5 — macro
# --------------------------------------------------------------------------

def test_contemporaneous_beats_lagged():
    """
    The section's whole claim: factors move with ASML, not before it.
    """
    c = macro.cross_correlation("ASML", 10)
    top = c["factors"][0]
    assert abs(top["contemporaneous"]) > 0.5
    assert abs(top["best_positive_lag_corr"]) < abs(top["contemporaneous"]) / 2
    assert c["leaders"] == [], f"a factor now meaningfully leads: {c['leaders']}"


def test_distributed_lag_power_is_contemporaneous():
    d = macro.distributed_lag("ASML", "SOXX", 5)
    assert d["r_squared"] > 0.4
    assert d["r_squared_lags_only"] < 0.10, "lagged factors should explain almost nothing"


# --------------------------------------------------------------------------
# API contract
# --------------------------------------------------------------------------

ENDPOINTS = [
    "/api/health", "/api/meta", "/api/series", "/api/decompose",
    "/api/stationarity", "/api/acf", "/api/smoothing/ma", "/api/smoothing/ets",
    "/api/smoothing/compare", "/api/arima/grid", "/api/arima/fit",
    "/api/arima/diagnostics", "/api/backtest", "/api/garch",
    "/api/macro/ccf", "/api/macro/granger", "/api/macro/dlag",
    "/api/macro/factors",
]


@pytest.mark.parametrize("path", ENDPOINTS)
def test_endpoint_ok(path):
    r = client.get(path)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"


@pytest.mark.parametrize("path", [p for p in ENDPOINTS
                                  if p not in ("/api/health", "/api/macro/factors")])
def test_endpoint_has_interpretation(path):
    """The rubric marks interpretation over computation, so it is not optional."""
    body = client.get(path).json()
    assert "interpretation" in body, f"{path} has no interpretation"
    assert len(body["interpretation"]) > 80, f"{path} interpretation is too thin"


def test_unknown_ticker_returns_404():
    r = client.get("/api/meta", params={"ticker": "NOT_A_REAL_TICKER_XYZ"})
    assert r.status_code == 404
    assert "detail" in r.json()


def test_payloads_are_json_clean():
    """NaN would serialise to invalid JSON that the browser silently rejects."""
    import json
    for path in ("/api/series", "/api/decompose", "/api/arima/diagnostics"):
        text = client.get(path).text
        assert "NaN" not in text and "Infinity" not in text, f"{path} leaked NaN"
        json.loads(text)
