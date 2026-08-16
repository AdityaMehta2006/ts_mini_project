/**
 * Section registry — the single place tab order and ownership are defined.
 * App.tsx maps over this; adding a section means adding one row.
 */

import type { ComponentType } from "react"
import S0Overview from "./S0Overview"
import S1Explore from "./S1Explore"
import S2Smoothing from "./S2Smoothing"
import S3Arima from "./S3Arima"
import S4Options from "./S4Options"
import S5Macro from "./S5Macro"

export interface Section {
  id: string
  num: string
  short: string
  title: string
  presenter: string
  beyond?: boolean
  Component: ComponentType
}

export const SECTIONS: Section[] = [
  {
    id: "overview",
    num: "00",
    short: "Overview",
    title: "How predictable is ASML?",
    presenter: "All",
    Component: S0Overview,
  },
  {
    id: "explore",
    num: "01",
    short: "Data & Stationarity",
    title: "Data, Decomposition & Stationarity",
    presenter: "Abhinabha Das",
    Component: S1Explore,
  },
  {
    id: "smoothing",
    num: "02",
    short: "Smoothing",
    title: "Moving Averages & Exponential Smoothing",
    presenter: "K Suraj Das",
    Component: S2Smoothing,
  },
  {
    id: "arima",
    num: "03",
    short: "ARIMA & Forecast",
    title: "ARIMA & Forecast Evaluation",
    presenter: "Akash Kumar",
    Component: S3Arima,
  },
  {
    id: "options",
    num: "04",
    short: "Volatility & Options",
    title: "Volatility & Black–Scholes",
    presenter: "Ritesh KR",
    beyond: true,
    Component: S4Options,
  },
  {
    id: "macro",
    num: "05",
    short: "Macro Lag",
    title: "Macro-Factor Lag Analysis",
    presenter: "Aditya Mehta",
    beyond: true,
    Component: S5Macro,
  },
]
