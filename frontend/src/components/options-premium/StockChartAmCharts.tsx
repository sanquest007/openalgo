// ─── StockChartAmCharts.tsx ───────────────────────────────────────────────
// amCharts 5 Stock Chart with full indicator + drawing toolbar.
// Ported from thirdPrj/src/components/StockChart.jsx
//
// Features:
//  - Candlestick main panel + Volume sub-panel
//  - Full StockToolbar: Indicators, Interval, Period, Drawing, Reset, Settings
//  - Mark Session Lines (day boundary dashed lines)
//  - Indicator Templates (save/reload configurations)
//  - DateJump pan control
//  - Live data append via exposed ref methods

import * as am5 from '@amcharts/amcharts5'
import * as am5stock from '@amcharts/amcharts5/stock'
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated'
import am5themes_Dark from '@amcharts/amcharts5/themes/Dark'
import * as am5xy from '@amcharts/amcharts5/xy'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { OHLCVPoint } from '@/api/options-premium'
import DateJumpControl from './DateJumpControl'
import IndicatorTemplates from './IndicatorTemplates'

interface StockChartAmChartsProps {
  data: OHLCVPoint[]
  chartTitle: string
  theme: 'dark' | 'light'
  onIntervalChange: (mins: number) => void
  chartId?: string
  controlsId?: string
}

// biome-ignore lint/suspicious/noExplicitAny: amCharts refs hold mixed types
type ChartRefs = Record<string, any>

export default function StockChartAmCharts({
  data,
  chartTitle,
  theme,
  onIntervalChange,
  chartId    = 'onc-chartdiv',
  controlsId = 'onc-chartcontrols',
}: StockChartAmChartsProps) {
  const chartRef = useRef<ChartRefs | null>(null)
  const [markSession, setMarkSession] = useState(false)

  // ── Chart init (once, re-init on theme/id change) ──────────────────────
  useLayoutEffect(() => {
    const root = am5.Root.new(chartId)

    const themes: am5.Theme[] = [am5themes_Animated.new(root)]
    if (theme === 'dark') themes.push(am5themes_Dark.new(root))
    root.setThemes(themes)

    root.numberFormatter.set('numberFormat', '#,###.00')

    // Stock chart container
    const stockChart = root.container.children.push(
      am5stock.StockChart.new(root, {})
    )

    // Main price panel
    const mainPanel = stockChart.panels.push(
      am5stock.StockPanel.new(root, { wheelY: 'zoomX', panX: true, panY: true })
    )

    const valueAxis = mainPanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, { pan: 'zoom' }),
        tooltip: am5.Tooltip.new(root, {}),
        numberFormat: '#,###.00',
        extraTooltipPrecision: 2,
      })
    )

    const dateAxis = mainPanel.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: { timeUnit: 'minute', count: 1 },
        renderer: am5xy.AxisRendererX.new(root, { pan: 'zoom' }),
        tooltip: am5.Tooltip.new(root, {}),
        markUnitChange: true,
      })
    )

    // Candlestick series
    const valueSeries = mainPanel.series.push(
      am5xy.CandlestickSeries.new(root, {
        name: chartTitle || 'Premium',
        clustered: false,
        valueXField: 'date',
        valueYField: 'close',
        highValueYField: 'high',
        lowValueYField: 'low',
        openValueYField: 'open',
        calculateAggregates: true,
        xAxis: dateAxis,
        yAxis: valueAxis,
        legendValueText:
          'O: [bold]{openValueY}[/]  H: [bold]{highValueY}[/]  ' +
          'L: [bold]{lowValueY}[/]  C: [bold]{valueY}[/]',
      })
    )

    stockChart.set('stockSeries', valueSeries)

    const valueLegend = mainPanel.topPlotContainer.children.push(
      am5stock.StockLegend.new(root, { stockChart })
    )
    valueLegend.data.setAll([valueSeries])

    mainPanel.set('cursor', am5xy.XYCursor.new(root, { yAxis: valueAxis, xAxis: dateAxis }))

    // Volume sub-panel
    const volumePanel = stockChart.panels.push(
      am5stock.StockPanel.new(root, {
        wheelY: 'zoomX', panX: true, panY: true,
        height: am5.percent(25),
      })
    )

    const volumeValueAxis = volumePanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        numberFormat: '#.#a',
        renderer: am5xy.AxisRendererY.new(root, { pan: 'zoom' }),
      })
    )

    const volumeDateAxis = volumePanel.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: { timeUnit: 'minute', count: 1 },
        renderer: am5xy.AxisRendererX.new(root, { pan: 'zoom' }),
        tooltip: am5.Tooltip.new(root, { forceHidden: true }),
        markUnitChange: true,
      })
    )
    volumeDateAxis.get('renderer').labels.template.set('forceHidden', true)

    const volumeSeries = volumePanel.series.push(
      am5xy.ColumnSeries.new(root, {
        name: 'Volume',
        clustered: false,
        valueXField: 'date',
        valueYField: 'volume',
        xAxis: volumeDateAxis,
        yAxis: volumeValueAxis,
        legendValueText: '[bold]{valueY.formatNumber("#,###.0a")}[/]',
      })
    )
    volumeSeries.columns.template.setAll({ strokeOpacity: 0, fillOpacity: 0.5 })

    // Colour volume bars by close vs open
    volumeSeries.columns.template.adapters.add('fill', (fill, target: any) => {
      const dataContext = target.dataItem?.dataContext
      if (dataContext) {
        const { open, close } = dataContext as { open?: number; close?: number }
        if (open !== undefined && close !== undefined) {
          return close < open ? am5.color(0xef5350) : am5.color(0x26a69a)
        }
      }
      return fill
    })

    stockChart.set('volumeSeries', volumeSeries)

    const volumeLegend = volumePanel.topPlotContainer.children.push(
      am5stock.StockLegend.new(root, { stockChart })
    )
    volumeLegend.data.setAll([volumeSeries])
    volumePanel.set('cursor', am5xy.XYCursor.new(root, { yAxis: volumeValueAxis, xAxis: volumeDateAxis }))

    // Interval control
    const intervalControl = am5stock.IntervalControl.new(root, {
      stockChart,
      items: [
        { id: '1 minute',   label: '1m',  interval: { timeUnit: 'minute', count: 1  } },
        { id: '5 minutes',  label: '5m',  interval: { timeUnit: 'minute', count: 5  } },
        { id: '15 minutes', label: '15m', interval: { timeUnit: 'minute', count: 15 } },
        { id: '30 minutes', label: '30m', interval: { timeUnit: 'minute', count: 30 } },
        { id: '1 hour',     label: '1H',  interval: { timeUnit: 'hour',   count: 1  } },
        { id: '1 day',      label: '1D',  interval: { timeUnit: 'day',    count: 1  } },
      ],
    })

    intervalControl.events.on('selected', (ev: any) => {
      if (onIntervalChange && ev.item?.interval) {
        let mins = ev.item.interval.count
        if (ev.item.interval.timeUnit === 'hour') mins *= 60
        if (ev.item.interval.timeUnit === 'day')  mins *= 1440
        onIntervalChange(mins)
      }
    })

    // Toolbar
    const controlsEl = document.getElementById(controlsId)
    if (controlsEl) {
      am5stock.StockToolbar.new(root, {
        container: controlsEl,
        stockChart,
        controls: [
          am5stock.IndicatorControl.new(root, { stockChart, legend: valueLegend }),
          intervalControl,
          am5stock.PeriodSelector.new(root, {
            stockChart,
            periods: [
              { timeUnit: 'day',   count: 1,  name: '1D'  },
              { timeUnit: 'week',  count: 1,  name: '1W'  },
              { timeUnit: 'month', count: 1,  name: '1M'  },
              { timeUnit: 'month', count: 3,  name: '3M'  },
              { timeUnit: 'month', count: 6,  name: '6M'  },
              { timeUnit: 'year',  count: 1,  name: '1Y'  },
              { timeUnit: 'max',              name: 'Max' },
            ],
          }),
          am5stock.DrawingControl.new(root, { stockChart }),
          am5stock.ResetControl.new(root, { stockChart }),
          am5stock.SettingsControl.new(root, { stockChart }),
        ],
      })
    }

    chartRef.current = {
      root, stockChart, valueSeries, volumeSeries,
      dateAxis, mainPanel, valueAxis, valueLegend,
    }

    return () => root.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, controlsId, theme])

  // ── Sync data ──────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const c = chartRef.current
    if (!c || !data) return
    c.valueSeries.data.setAll(data)
    c.volumeSeries.data.setAll(data)
  }, [data])

  // ── Mark Session Lines ─────────────────────────────────────────────────
  useLayoutEffect(() => {
    const c = chartRef.current
    if (!c || !data || data.length === 0) return

    c.dateAxis.axisRanges.clear()
    const volumeAxis = c.stockChart.panels.getIndex(1)?.xAxes.getIndex(0)
    if (volumeAxis) volumeAxis.axisRanges.clear()

    if (markSession) {
      const firstCandles: number[] = []
      let lastDay: number | null = null
      for (const d of data) {
        const dateObj = new Date(d.date)
        const day = dateObj.getDate()
        if (day !== lastDay) { firstCandles.push(d.date); lastDay = day }
      }

      firstCandles.forEach(ts => {
        const rangeDataItem = c.dateAxis.makeDataItem({ value: ts })
        const range = c.dateAxis.createAxisRange(rangeDataItem)
        range.get('grid').setAll({
          stroke: am5.color(theme === 'dark' ? 0xffffff : 0x000000),
          strokeWidth: 1, strokeDasharray: [3, 3], strokeOpacity: 0.4, visible: true,
        })
        if (volumeAxis) {
          const volRangeDataItem = volumeAxis.makeDataItem({ value: ts })
          const volRange = volumeAxis.createAxisRange(volRangeDataItem)
          volRange.get('grid').setAll({
            stroke: am5.color(theme === 'dark' ? 0xffffff : 0x000000),
            strokeWidth: 1, strokeDasharray: [3, 3], strokeOpacity: 0.4, visible: true,
          })
        }
      })
    }
  }, [data, markSession, theme])

  // ── Sync chart title ───────────────────────────────────────────────────
  useLayoutEffect(() => {
    const c = chartRef.current
    if (!c || !chartTitle) return
    c.valueSeries.set('name', chartTitle)
  }, [chartTitle])

  // ── DateJump handler ───────────────────────────────────────────────────
  const handleDateJump = useCallback((targetMs: number) => {
    const c = chartRef.current
    if (!c) return
    const axis = c.dateAxis
    const start = axis.get('start') ?? 0
    const end   = axis.get('end')   ?? 1
    const width = end - start
    const min = axis.getPrivate('min') ?? 0
    const max = axis.getPrivate('max') ?? 1
    const span = max - min
    if (span <= 0) return
    const newStart = (targetMs - min) / span
    const newEnd   = newStart + width
    axis.zoom(Math.max(0, newStart), Math.min(1, newEnd))
  }, [])

  return (
    <div className="onc-chart-container">
      {/* Toolbar row */}
      <div className="onc-chart-toolbar-row">
        <div id={controlsId} className="onc-chart-controls" />
        <label className="onc-flush-check" style={{ marginLeft: 8, marginRight: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={markSession}
            onChange={e => setMarkSession(e.target.checked)}
          />
          <span>Mark Session</span>
        </label>
        <IndicatorTemplates chartRef={chartRef} />
        <DateJumpControl onJump={handleDateJump} />
      </div>
      {/* Chart canvas */}
      <div id={chartId} className="onc-chartdiv" />
    </div>
  )
}
