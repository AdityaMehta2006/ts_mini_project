"""
make_figures.py
---------------
Generates every figure and every number the report and slides quote, by
importing the same backend modules the dashboard serves from.

That is the whole point: a figure in the PDF cannot disagree with the
dashboard, because there is only one implementation. Re-run this after any
backend change or data refresh.

    python docs/figures/make_figures.py

Writes docs/figures/fig_*.png (200 dpi) and docs/figures/facts.json.
Nothing may be typed into REPORT.md or SLIDES.md unless it appears in facts.json.
"""

import json
import os
import sys
import warnings

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, "..", "..", "backend"))
sys.path.insert(0, BACKEND)

import data as D                                    # noqa: E402
from analysis import explore, smoothing, arima, options, macro   # noqa: E402

FACTS: dict = {}
DPI = 200

# Match the dashboard's palette so the report and the screen agree.
INK = "#1a1a1a"
ACCENT = "#b26b00"
UP = "#2f7d4f"
DOWN = "#b3341f"
MUTED = "#8a8a8a"
GRID = "#d8d8d8"

plt.rcParams.update({
    "figure.dpi": DPI,
    "savefig.dpi": DPI,
    "font.size": 9,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK,
    "axes.titlesize": 10,
    "axes.titleweight": "bold",
    "axes.grid": True,
    "grid.color": GRID,
    "grid.linewidth": 0.6,
    "grid.alpha": 0.7,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "text.color": INK,
    "legend.frameon": False,
    "figure.autolayout": True,
})


def save(fig, name):
    path = os.path.join(HERE, f"{name}.png")
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"  wrote {name}.png")


def rec(**kw):
    """Record facts, rounding floats so the report never quotes noise."""
    for k, v in kw.items():
        FACTS[k] = round(v, 6) if isinstance(v, float) else v


# ---------------------------------------------------------------- Section 1

def fig_data():
    px = D.get_series("ASML", "daily", "price")
    ret = D.get_series("ASML", "daily", "logret")
    m = explore.meta("ASML")

    rec(n_daily=m["n_daily"], n_monthly=m["n_monthly"],
        date_start=m["start"], date_end=m["end"],
        first_close=m["first_close"], last_close=m["last_close"],
        cagr_pct=m["cagr_pct"], ann_vol_pct=m["ann_vol_pct"],
        total_return_pct=m["total_return_pct"], years=m["years"])

    fig, ax = plt.subplots(2, 1, figsize=(7.2, 5), sharex=True)
    ax[0].plot(px.index, px.values, color=ACCENT, lw=0.9)
    ax[0].set_yscale("log")
    ax[0].set_title("ASML close (log scale)")
    ax[0].set_ylabel("USD")
    ax[1].plot(ret.index, ret.values * 100, color=ACCENT, lw=0.4)
    ax[1].axhline(0, color=MUTED, lw=0.6, ls="--")
    ax[1].set_title("Daily log returns (%)")
    ax[1].set_ylabel("%")
    save(fig, "fig_data")

    s = explore.series("ASML", "daily", 0)
    rec(kurtosis_returns=s["stats"]["kurtosis"], skew_returns=s["stats"]["skew"],
        sd_return_pct=s["stats"]["sd_return_pct"])


def fig_decompose():
    d = explore.decompose("ASML", "additive", "classical")
    comp = pd.DataFrame(d["components"])
    comp["date"] = pd.to_datetime(comp["date"])
    comp = comp.set_index("date")

    fig, ax = plt.subplots(4, 1, figsize=(7.2, 6.4), sharex=True)
    for a, (col, title, color) in zip(ax, [
        ("observed", "Observed (log price)", ACCENT),
        ("trend", "Trend", INK),
        ("seasonal", "Seasonal", MUTED),
        ("resid", "Remainder", MUTED),
    ]):
        a.plot(comp.index, comp[col], color=color, lw=1.0)
        a.set_title(title, loc="left")
    save(fig, "fig_decompose")

    rec(trend_strength=d["strength"]["trend"],
        seasonal_strength=d["strength"]["seasonal"])

    prof = pd.DataFrame(d["seasonal_profile"])
    fig, ax = plt.subplots(figsize=(6.4, 2.6))
    ax.bar(prof["month"], prof["effect"],
           color=[UP if v >= 0 else DOWN for v in prof["effect"]])
    ax.axhline(0, color=MUTED, lw=0.8)
    ax.set_title("Average seasonal effect by month")
    save(fig, "fig_seasonal")


def fig_stationarity_acf():
    st = explore.stationarity("ASML", "daily")
    rec(adf_p_level=st["matrix"]["level"]["adf_p"],
        kpss_p_level=st["matrix"]["level"]["kpss_p"],
        adf_p_diff=st["matrix"]["diff"]["adf_p"],
        kpss_p_diff=st["matrix"]["diff"]["kpss_p"],
        integration_order=st["integration_order"],
        tests_agree_level=st["matrix"]["level"]["agree"],
        tests_agree_diff=st["matrix"]["diff"]["agree"])

    lvl = explore.acf_pacf("ASML", "daily", "log", 40)
    ret = explore.acf_pacf("ASML", "daily", "logret", 40)
    rec(acf_band=lvl["conf_band"],
        n_sig_acf_level=lvl["reading"]["n_significant_acf"],
        n_sig_acf_returns=ret["reading"]["n_significant_acf"],
        ljung_box_returns_p=ret["ljung_box"][9]["pvalue"])

    fig, axes = plt.subplots(2, 2, figsize=(7.2, 4.6))
    for row, (res, label) in enumerate([(lvl, "log price"), (ret, "log returns")]):
        band = res["conf_band"]
        for col, key in enumerate(["acf", "pacf"]):
            a = axes[row][col]
            df = pd.DataFrame(res[key])
            a.bar(df["lag"], df["value"], color=ACCENT, width=0.8)
            a.axhspan(-band, band, color=MUTED, alpha=0.18)
            a.axhline(0, color=MUTED, lw=0.7)
            a.set_ylim(-1.05, 1.05)
            a.set_title(f"{key.upper()} — {label}", loc="left")
    save(fig, "fig_acf_pacf")


# ---------------------------------------------------------------- Section 2

def fig_smoothing():
    c = smoothing.compare("ASML", 12)
    rows = [r for r in c["models"] if r.get("mase") is not None]
    rec(best_smoother=c["best_by_mase"], naive_mase=c["naive_mase"],
        models_beating_naive=c["models_beating_naive"])
    for r in c["models"]:
        key = r["name"].lower().replace(" ", "_").replace("(", "").replace(")", "").replace("-", "_")
        if r.get("mase") is not None:
            rec(**{f"mase_{key}": r["mase"], f"mape_{key}": r["mape"]})

    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    names = [r["name"] for r in rows]
    vals = [r["mase"] for r in rows]
    cols = [MUTED if r["kind"] == "benchmark" else ACCENT for r in rows]
    ax.bar(names, vals, color=cols)
    ax.axhline(c["naive_mase"], color=DOWN, ls="--", lw=1, label="Naive benchmark")
    ax.set_ylabel("MASE (lower is better)")
    ax.set_title("Holdout accuracy — models (amber) vs benchmarks (grey)")
    ax.legend()
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    save(fig, "fig_smoothing_errors")

    for m in ("ses", "holt", "hw"):
        e = smoothing.ets("ASML", m, "add", 12, 12)
        rec(**{f"{m}_alpha": e["params"].get("alpha"),
               f"{m}_mape": e["holdout"]["errors"]["mape"]})
        if m == "hw":
            rec(hw_beta=e["params"].get("beta"), hw_gamma=e["params"].get("gamma"))

    e = smoothing.ets("ASML", "hw", "add", 12, 12)
    fit = pd.DataFrame(e["fitted"])
    fit["date"] = pd.to_datetime(fit["date"])
    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    ax.plot(fit["date"], fit["observed"], color=MUTED, lw=1.0, label="Observed")
    ax.plot(fit["date"], fit["fitted"], color=ACCENT, lw=1.2, label="Holt-Winters fitted")
    ax.set_title("Holt-Winters fit, monthly")
    ax.legend()
    save(fig, "fig_ets")


# ---------------------------------------------------------------- Section 3

def fig_arima():
    g = arima.grid("ASML", "daily", 1, 3, 3)
    rec(arima_best_order=[g["best"]["p"], g["best"]["d"], g["best"]["q"]],
        arima_best_aic=g["best"]["aic"],
        arima_n_fitted=g["n_fitted"],
        random_walk_delta_aic=g["random_walk"]["delta_aic"],
        random_walk_rank=g["random_walk"]["rank"],
        # The full table, so the runner-up AICs quoted in the report are
        # traceable rather than transcribed by hand.
        arima_candidates={f"({c['p']},{c['d']},{c['q']})": {"aic": c["aic"],
                                                           "delta_aic": c["delta_aic"]}
                          for c in g["candidates"]})

    cand = pd.DataFrame(g["candidates"])
    cand["label"] = cand.apply(lambda r: f"({r.p},{r.d},{r.q})", axis=1)
    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    cols = [DOWN if (r.p == 0 and r.q == 0) else (ACCENT if r.delta_aic == 0 else MUTED)
            for r in cand.itertuples()]
    ax.bar(cand["label"], cand["delta_aic"], color=cols)
    ax.set_ylabel("ΔAIC from best")
    ax.set_title("Order selection — red is ARIMA(0,1,0), the random walk")
    plt.setp(ax.get_xticklabels(), rotation=60, ha="right", fontsize=7)
    save(fig, "fig_arima_grid")

    p, d, q = g["best"]["p"], g["best"]["d"], g["best"]["q"]
    f = arima.fit("ASML", "daily", p, d, q, 30)
    rec(near_common_root=f["near_common_root"],
        arima_coefficients={c["name"]: c["estimate"] for c in f["coefficients"]},
        ar_root_modulus=[r["modulus"] for r in f["roots"] if r["type"] == "AR"],
        ma_root_modulus=[r["modulus"] for r in f["roots"] if r["type"] == "MA"])

    fc = pd.DataFrame(f["forecast"])
    fc["date"] = pd.to_datetime(fc["date"])
    hist = D.get_series("ASML", "daily", "price").tail(120)
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    ax.plot(hist.index, hist.values, color=INK, lw=1.0, label="Observed")
    ax.plot(fc["date"], fc["mean"], color=ACCENT, lw=1.4, label="Forecast")
    ax.fill_between(fc["date"], fc["lo95"], fc["hi95"], color=ACCENT, alpha=0.14, label="95%")
    ax.fill_between(fc["date"], fc["lo80"], fc["hi80"], color=ACCENT, alpha=0.20, label="80%")
    ax.set_title(f"ARIMA({p},{d},{q}) 30-day forecast")
    ax.legend()
    save(fig, "fig_forecast")

    dg = arima.diagnostics("ASML", "daily", p, d, q)
    b = dg["burn_in"]
    rec(resid_burnin_value=b["first_residual"], resid_sd=b["residual_sd"],
        resid_burnin_sigmas=b["sigmas"],
        lb_p_if_burnin_kept=b["ljung_box_p_if_kept"],
        lb_p_after_trim=b["ljung_box_p_after_trim"],
        jarque_bera_p=dg["jarque_bera"]["pvalue"],
        resid_kurtosis=dg["jarque_bera"]["kurtosis"],
        arch_lm_p=dg["arch_lm"]["pvalue"],
        lb_squared_p=dg["ljung_box_squared"]["pvalue"])

    resid = pd.DataFrame(dg["resid"])
    qq = pd.DataFrame(dg["qq"])
    racf = pd.DataFrame(dg["resid_acf"])
    fig, ax = plt.subplots(1, 3, figsize=(7.6, 2.4))
    ax[0].plot(range(len(resid)), resid["resid"], color=ACCENT, lw=0.4)
    ax[0].set_title("Residuals", loc="left")
    ax[1].bar(racf["lag"], racf["value"], color=ACCENT)
    ax[1].axhspan(racf["lower"][0], racf["upper"][0], color=MUTED, alpha=0.2)
    ax[1].set_title("Residual ACF", loc="left")
    ax[2].scatter(qq["theoretical"], qq["sample"], s=2, color=ACCENT, alpha=0.5)
    lim = [qq["theoretical"].min(), qq["theoretical"].max()]
    ax[2].plot(lim, lim, color=MUTED, ls="--", lw=0.8)
    ax[2].set_title("Normal Q–Q", loc="left")
    save(fig, "fig_arima_resid")


def fig_backtest():
    b = arima.backtest("ASML", "monthly", "1,3,6", 60)
    rec(backtest_origins=b["n_origins"],
        backtest_significant_vs_naive=b["significant_vs_naive"],
        winner_by_horizon=b["winner_by_horizon"])

    mase, cov, dm = {}, {}, {}
    for r in b["results"]:
        mase[f"{r['model']}_h{r['h']}"] = r["mase"]
        if r.get("pi_coverage_95") is not None:
            cov[f"h{r['h']}"] = r["pi_coverage_95"]
        if r.get("dm_pvalue_vs_naive") is not None:
            dm[f"{r['model']}_h{r['h']}"] = r["dm_pvalue_vs_naive"]
    rec(mase_by_model_horizon=mase, pi_coverage_95=cov, dm_pvalues=dm,
        mean_pi_coverage=round(float(np.mean(list(cov.values()))), 2))

    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    for model in ("ARIMA", "Holt", "Drift", "Naive"):
        pts = [(r["h"], r["mase"]) for r in b["results"] if r["model"] == model]
        pts.sort()
        ax.plot([x for x, _ in pts], [y for _, y in pts],
                marker="o", lw=2 if model == "Naive" else 1.3,
                ls="--" if model == "Naive" else "-",
                color=DOWN if model == "Naive" else None, label=model)
    ax.set_xlabel("Forecast horizon (months)")
    ax.set_ylabel("MASE")
    ax.set_title("Rolling-origin accuracy — overlapping lines cannot be told apart")
    ax.legend()
    save(fig, "fig_backtest")


# ---------------------------------------------------------------- Section 4

def fig_garch():
    g = options.garch("ASML")
    rec(garch_omega=g["parameters"]["omega"]["value"],
        garch_alpha=g["parameters"]["alpha[1]"]["value"],
        garch_beta=g["parameters"]["beta[1]"]["value"],
        garch_persistence=g["persistence"],
        garch_half_life_days=g["half_life_days"],
        garch_current_vol_pct=g["current_vol_annual_pct"],
        garch_long_run_vol_pct=g["long_run_vol_annual_pct"],
        garch_arch_absorbed=g["arch_removed"]["clean"],
        garch_lb_sq_p=g["arch_removed"]["ljung_box_sq_std_resid_p"])

    cv = pd.DataFrame(g["conditional_volatility"])
    cv["date"] = pd.to_datetime(cv["date"])
    fig, ax = plt.subplots(figsize=(7.2, 2.8))
    ax.plot(cv["date"], cv["annualised"], color=ACCENT, lw=0.9)
    ax.axhline(g["long_run_vol_annual_pct"], color=MUTED, ls="--", lw=1,
               label=f"Long-run {g['long_run_vol_annual_pct']:.0f}%")
    ax.set_ylabel("Annualised volatility (%)")
    ax.set_title("GARCH(1,1) conditional volatility")
    ax.legend()
    save(fig, "fig_garch_vol")

    try:
        o = options.option_chain("ASML", 4)
        rec(option_expiry=o["expiry"], option_spot=o["spot"],
            risk_free_pct=o["risk_free_pct"], option_n_contracts=o["n_contracts"],
            garch_vol_for_pricing_pct=o["garch_vol_pct"],
            mean_implied_vol_pct=o["mean_implied_vol_pct"],
            vol_gap_pct=o["vol_gap_pct"],
            atm_strike=o["atm"]["strike"], atm_market=o["atm"]["market_mid"],
            atm_bs=o["atm"]["bs_price"], atm_diff_pct=o["atm"]["diff_pct"])

        sm = pd.DataFrame(o["smile"])
        ct = pd.DataFrame(o["contracts"])
        fig, ax = plt.subplots(1, 2, figsize=(7.6, 2.8))
        ax[0].plot(ct["strike"], ct["market_mid"], color=MUTED, lw=1.3, label="Market mid")
        ax[0].plot(ct["strike"], ct["bs_price"], color=ACCENT, lw=1.3, label="Black-Scholes")
        ax[0].set_title("Model vs market", loc="left")
        ax[0].set_xlabel("Strike")
        ax[0].legend()
        ax[1].scatter(sm["moneyness"], sm["implied_vol_pct"], s=10, color=ACCENT)
        ax[1].axhline(o["garch_vol_pct"], color=MUTED, ls="--", lw=1, label="GARCH σ")
        ax[1].set_title("Implied volatility smile", loc="left")
        ax[1].set_xlabel("Moneyness K/S")
        ax[1].legend()
        save(fig, "fig_options")
    except Exception as exc:
        # The option chain is live and can be empty out of hours. The report
        # should still build; the figure is simply omitted.
        print(f"  ! option chain unavailable, skipping fig_options ({exc})")
        rec(option_chain_error=str(exc)[:200])


# ---------------------------------------------------------------- Section 5

def fig_macro():
    c = macro.cross_correlation("ASML", 10)
    rec(macro_n_obs=c["n_obs"], macro_conf_band=c["conf_band"],
        macro_leaders=c["leaders"], macro_sign_flippers=c["sign_flippers"],
        macro_contemporaneous={f["symbol"]: f["contemporaneous"] for f in c["factors"]},
        macro_best_lag_corr={f["symbol"]: f["best_positive_lag_corr"] for f in c["factors"]})

    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    for f in c["factors"]:
        lags = pd.DataFrame(f["lags"])
        ax.plot(lags["lag"], lags["corr"], lw=1.1, label=f["symbol"])
    ax.axhspan(-c["conf_band"], c["conf_band"], color=MUTED, alpha=0.2)
    ax.axvline(0, color=MUTED, ls="--", lw=0.8)
    ax.set_xlabel("Lag (days) — positive means the factor leads ASML")
    ax.set_ylabel("Correlation")
    ax.set_title("Cross-correlation: a spike at zero and nothing either side")
    ax.legend(ncol=4, fontsize=7)
    save(fig, "fig_macro_ccf")

    g = macro.granger("ASML", 5)
    rec(granger_alpha=g["alpha_corrected"], granger_n_significant=g["n_significant"],
        granger_significant=g["significant_factors"],
        granger_pvalues={r["symbol"]: r.get("min_pvalue") for r in g["results"]})

    dl = macro.distributed_lag("ASML", "SOXX", 5)
    rec(dlag_r2=dl["r_squared"], dlag_r2_lags_only=dl["r_squared_lags_only"],
        dlag_lag0_coef=next(c2["estimate"] for c2 in dl["coefficients"] if c2["name"] == "lag_0"))

    coefs = pd.DataFrame([c2 for c2 in dl["coefficients"] if c2["lag"] is not None])
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    ax.bar(coefs["name"], coefs["estimate"],
           color=[ACCENT if l == 0 else MUTED for l in coefs["lag"]])
    ax.axhline(0, color=MUTED, lw=0.8)
    ax.set_title(f"Distributed lag on SOXX — R² {dl['r_squared']:.3f}, "
                 f"lags only {dl['r_squared_lags_only']:.4f}")
    save(fig, "fig_macro_dlag")


def main():
    print("Generating figures and harvesting facts...")
    for fn in (fig_data, fig_decompose, fig_stationarity_acf, fig_smoothing,
               fig_arima, fig_backtest, fig_garch, fig_macro):
        print(f"[{fn.__name__}]")
        fn()

    FACTS["_generated"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
    out = os.path.join(HERE, "facts.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(FACTS, f, indent=2, default=str)
    print(f"\nWrote {out} with {len(FACTS)} facts.")


if __name__ == "__main__":
    main()
