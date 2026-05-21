// ─── sessionGapRemoval.ts ─────────────────────────────────────────────────
// Removes the overnight gap between trading sessions for a continuous chart.
// Ported from thirdPrj/src/utils/sessionGapRemoval.js

import type { OHLCVPoint } from '@/api/options-premium'

/**
 * Remove the overnight gap from OHLCV data.
 *
 * Finds the start of each session (first candle of each day) and shifts
 * that candle's open to be the previous day's close, then offsets all candles
 * in that session by the difference — creating a gapless chart.
 *
 * @param data         - OHLCV data sorted by date (ms timestamps)
 * @param selectedDate - Selected date string (YYYY-MM-DD) — used to anchor sessions
 * @returns Gap-removed OHLCV array
 */
export function removeSessionGap(data: OHLCVPoint[], _selectedDate: string): OHLCVPoint[] {
  if (!data || data.length < 2) return data

  // Group by calendar day
  const dayMap = new Map<string, OHLCVPoint[]>()
  for (const bar of data) {
    const d = new Date(bar.date)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!dayMap.has(key)) dayMap.set(key, [])
    dayMap.get(key)!.push(bar)
  }

  const days = Array.from(dayMap.values())
  if (days.length <= 1) return data

  const result: OHLCVPoint[] = [...days[0]]
  let cumulativeShift = 0

  for (let i = 1; i < days.length; i++) {
    const prevDayBars = days[i - 1]
    const prevClose = prevDayBars[prevDayBars.length - 1].close
    const currentFirstOpen = days[i][0].open

    const gap = currentFirstOpen - prevClose
    cumulativeShift += gap

    for (const bar of days[i]) {
      result.push({
        date: bar.date,
        open: parseFloat((bar.open - cumulativeShift).toFixed(2)),
        high: parseFloat((bar.high - cumulativeShift).toFixed(2)),
        low: parseFloat((bar.low - cumulativeShift).toFixed(2)),
        close: parseFloat((bar.close - cumulativeShift).toFixed(2)),
        volume: bar.volume,
      })
    }
  }

  return result
}
