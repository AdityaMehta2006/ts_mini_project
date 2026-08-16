"""
main.py — FastAPI surface for the ASML time series project.

Endpoints are deliberately thin: parse params, call one analysis function,
return the dict. All the reasoning lives in analysis/, all the numbers are
rounded there, and every payload carries an `interpretation` string because
the course rubric marks interpretation over computation.
"""

import threading
import traceback

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

import data as D
from data import NoDataError
from analysis import explore, smoothing, arima, options, macro

TICKER = Query("ASML", description="Yahoo Finance ticker")
FREQ = Query("daily", pattern="^(daily|monthly)$")


def _warm():
    """
    Pre-compute the slow defaults so the first click is not the slow one.
    The backtest refits ARIMA at ~74 origins and is the only endpoint that
    takes seconds rather than milliseconds.
    """
    try:
        explore.meta("ASML")
        arima.grid("ASML", "daily", 1, 3, 3)
        arima.backtest("ASML", "monthly", "1,3,6", 60)
    except Exception:
        traceback.print_exc()


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_warm, daemon=True).start()
    yield


app = FastAPI(
    title="ASML Time Series API",
    description="Box-Jenkins analysis and forecasting of ASML Holding N.V.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NoDataError)
async def _no_data(request, exc: NoDataError):
    return JSONResponse(
        status_code=404,
        content={"error": "No data", "detail": str(exc)},
    )


@app.exception_handler(Exception)
async def _unhandled(request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"error": type(exc).__name__, "detail": str(exc)[:300]},
    )


# --------------------------------------------------------------------------
# Section 1 — Data, decomposition, stationarity
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version}


@app.get("/api/meta")
def meta(ticker: str = TICKER):
    return explore.meta(ticker)


@app.get("/api/series")
def series(ticker: str = TICKER, freq: str = FREQ, limit: int = Query(0, ge=0)):
    return explore.series(ticker, freq, limit)


@app.get("/api/decompose")
def decompose(ticker: str = TICKER,
              model: str = Query("additive", pattern="^(additive|multiplicative)$"),
              method: str = Query("classical", pattern="^(classical|stl)$")):
    return explore.decompose(ticker, model, method)


@app.get("/api/stationarity")
def stationarity(ticker: str = TICKER, freq: str = FREQ):
    return explore.stationarity(ticker, freq)


@app.get("/api/acf")
def acf(ticker: str = TICKER, freq: str = FREQ,
        transform: str = Query("log", pattern="^(price|log|logret)$"),
        nlags: int = Query(40, ge=5, le=100)):
    return explore.acf_pacf(ticker, freq, transform, nlags)


# --------------------------------------------------------------------------
# Section 2 — Smoothing
# --------------------------------------------------------------------------

@app.get("/api/smoothing/ma")
def smoothing_ma(ticker: str = TICKER, windows: str = "3,6,12"):
    return smoothing.moving_average(ticker, windows)


@app.get("/api/smoothing/ets")
def smoothing_ets(ticker: str = TICKER,
                  method: str = Query("hw", pattern="^(ses|holt|hw)$"),
                  seasonal: str = Query("add", pattern="^(add|mul)$"),
                  holdout: int = Query(12, ge=3, le=36),
                  h: int = Query(12, ge=1, le=36)):
    return smoothing.ets(ticker, method, seasonal, holdout, h)


@app.get("/api/smoothing/compare")
def smoothing_compare(ticker: str = TICKER, holdout: int = Query(12, ge=3, le=36)):
    return smoothing.compare(ticker, holdout)


# --------------------------------------------------------------------------
# Section 3 — ARIMA and evaluation
# --------------------------------------------------------------------------

@app.get("/api/arima/grid")
def arima_grid(ticker: str = TICKER, freq: str = FREQ,
               d: int = Query(1, ge=0, le=2),
               max_p: int = Query(3, ge=0, le=5),
               max_q: int = Query(3, ge=0, le=5)):
    return arima.grid(ticker, freq, d, max_p, max_q)


@app.get("/api/arima/fit")
def arima_fit(ticker: str = TICKER, freq: str = FREQ,
              p: int = Query(1, ge=0, le=5), d: int = Query(1, ge=0, le=2),
              q: int = Query(3, ge=0, le=5), h: int = Query(30, ge=1, le=120)):
    return arima.fit(ticker, freq, p, d, q, h)


@app.get("/api/arima/diagnostics")
def arima_diagnostics(ticker: str = TICKER, freq: str = FREQ,
                      p: int = Query(1, ge=0, le=5), d: int = Query(1, ge=0, le=2),
                      q: int = Query(3, ge=0, le=5)):
    return arima.diagnostics(ticker, freq, p, d, q)


@app.get("/api/backtest")
def backtest(ticker: str = TICKER,
             freq: str = Query("monthly", pattern="^(daily|monthly)$"),
             horizons: str = "1,3,6",
             min_train: int = Query(60, ge=24, le=400)):
    return arima.backtest(ticker, freq, horizons, min_train)


# --------------------------------------------------------------------------
# Section 4 — Volatility and options  [beyond syllabus]
# --------------------------------------------------------------------------

@app.get("/api/garch")
def garch(ticker: str = TICKER, p: int = Query(1, ge=1, le=3),
          q: int = Query(1, ge=1, le=3),
          dist: str = Query("t", pattern="^(normal|t|skewt)$")):
    return options.garch(ticker, p, q, dist)


@app.get("/api/options")
def option_chain(ticker: str = TICKER, expiry_index: int = Query(4, ge=0, le=20)):
    return options.option_chain(ticker, expiry_index)


# --------------------------------------------------------------------------
# Section 5 — Macro factors  [beyond syllabus]
# --------------------------------------------------------------------------

@app.get("/api/macro/ccf")
def macro_ccf(ticker: str = TICKER, max_lag: int = Query(10, ge=1, le=30)):
    return macro.cross_correlation(ticker, max_lag)


@app.get("/api/macro/granger")
def macro_granger(ticker: str = TICKER, max_lag: int = Query(5, ge=1, le=10)):
    return macro.granger(ticker, max_lag)


@app.get("/api/macro/dlag")
def macro_dlag(ticker: str = TICKER, symbol: str = "SOXX",
               max_lag: int = Query(5, ge=1, le=10)):
    return macro.distributed_lag(ticker, symbol, max_lag)


@app.get("/api/macro/factors")
def macro_factors():
    return {"factors": [{"symbol": k, "name": v} for k, v in D.MACRO_FACTORS.items()]}
