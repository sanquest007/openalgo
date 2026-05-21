// ─── aggregation.ts ───────────────────────────────────────────────────────
// Aggregates multiple OHLCV datasets by timestamp.
// When multiple contracts are active, their premiums are summed per candle.
// Ported from thirdPrj/src/utils/aggregation.js

import type { OHLCVPoint } from '@/api/options-premium'

/**
 * Merge multiple OHLCV datasets into one by summing open/high/low/close/volume
 * at matching timestamps.
 *
 * @param datasets - Array of OHLCV arrays (one per contract)
 * @returns Single merged OHLCV array sorted by date
 */
export function aggregateDatasets(datasets: OHLCVPoint[][]): OHLCVPoint[] {
  if (datasets.length === 0) return []
  if (datasets.length === 1) return [...datasets[0]]

  // Build a map: date → aggregated OHLCV
  const map = new Map<number, OHLCVPoint>()

  for (const dataset of datasets) {
    for (const point of dataset) {
      const existing = map.get(point.date)
      if (existing) {
        map.set(point.date, {
          date: point.date,
          open: existing.open + point.open,
          high: existing.high + point.high,
          low: existing.low + point.low,
          close: existing.close + point.close,
          volume: existing.volume + point.volume,
        })
      } else {
        map.set(point.date, { ...point })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date - b.date)
}
